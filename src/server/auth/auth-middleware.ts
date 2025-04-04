import { Request, Response, NextFunction } from 'express';
import { AuthProvider } from './auth-provider.js';
import { createContextLogger } from '../../utils/logger.js';

const logger = createContextLogger('AuthMiddleware');

/**
 * Options for authentication middleware
 */
export interface AuthMiddlewareOptions {
  /** Whether to bypass authentication for certain paths */
  bypassPaths?: string[];
  /** Whether to throw an error on authentication failure */
  throwOnFailure?: boolean;
  /** Whether to enable CORS headers */
  enableCors?: boolean;
  /** Origin to allow for CORS (default: '*') */
  corsOrigin?: string;
  /** HTTP methods to allow for CORS (default: 'GET, POST, OPTIONS') */
  corsMethods?: string;
  /** Headers to allow for CORS (default: 'Origin, X-Requested-With, Content-Type, Accept, Authorization') */
  corsHeaders?: string;
  /** Log authentication requests (default: false in production, true in development) */
  logAuth?: boolean;
}

/**
 * Extract token from request
 *
 * @param req - HTTP request
 * @returns Authentication token or null
 */
function extractToken(req: Request): string | null {
  // Check for authorization header
  const authHeader = req.headers.authorization;
  if (authHeader) {
    // Bearer token
    if (authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }
    // Basic auth
    if (authHeader.startsWith('Basic ')) {
      const credentials = Buffer.from(authHeader.slice(6), 'base64').toString().split(':');
      return credentials.length === 2 ? credentials.join(':') : null;
    }
  }

  // Check for token in query parameters
  if (req.query.token) {
    return req.query.token as string;
  }

  // Check for token in cookies
  if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }

  return null;
}

/**
 * Create authentication middleware
 *
 * @param authProvider - Authentication provider
 * @param options - Middleware options
 * @returns Express middleware function
 */
export function createAuthMiddleware(
  authProvider: AuthProvider,
  options: AuthMiddlewareOptions = {}
): (req: Request, res: Response, next: NextFunction) => Promise<void | Response> {
  const {
    bypassPaths = [],
    throwOnFailure = true,
    enableCors = true, // Default to enabling CORS for better compatibility
    corsOrigin = '*',
    corsMethods = 'GET, POST, OPTIONS',
    corsHeaders = 'Origin, X-Requested-With, Content-Type, Accept, Authorization',
    logAuth = process.env.NODE_ENV === 'development' || process.env.DEBUG_AUTH === 'true',
  } = options;

  // Essential endpoints are always bypassed
  const allBypassPaths = [...bypassPaths];
  if (!allBypassPaths.includes('/health')) {
    allBypassPaths.push('/health');
  }
  if (!allBypassPaths.includes('/status')) {
    allBypassPaths.push('/status');
  }
  if (!allBypassPaths.includes('/auth')) {
    allBypassPaths.push('/auth');
  }

  // Debug endpoints are only accessible in development mode
  if (
    process.env.NODE_ENV === 'development' &&
    !allBypassPaths.some(path => path.startsWith('/debug/'))
  ) {
    allBypassPaths.push('/debug/');
    logger.info('Debug endpoints are accessible in development mode');
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    // Add CORS headers if enabled
    if (enableCors) {
      res.setHeader('Access-Control-Allow-Origin', corsOrigin);
      res.setHeader('Access-Control-Allow-Headers', corsHeaders);
      res.setHeader('Access-Control-Allow-Methods', corsMethods);

      // Handle OPTIONS requests for CORS preflight
      if (req.method === 'OPTIONS') {
        return res.status(200).end();
      }
    }

    // Skip authentication for bypassed paths
    if (allBypassPaths.some(path => req.path === path || req.path.startsWith(path))) {
      // For health and debug endpoints, set system authentication
      req.auth = {
        authenticated: true,
        userId: 'system',
        roles: ['system'],
      };
      return next();
    }

    // Extract token from request
    const token = extractToken(req);

    if (!token) {
      if (logAuth) {
        logger.info(`Auth failed: No token provided for ${req.method} ${req.path}`);
      } else {
        logger.debug('No authentication token found');
      }

      if (throwOnFailure) {
        return res.status(401).json({
          error: 'Authentication required',
          message: 'Please provide a valid token via Bearer auth header or token query parameter',
        });
      }

      // Set empty auth info and continue
      req.auth = { authenticated: false };
      return next();
    }

    try {
      // Validate token
      const authResult = await authProvider.validateToken(token);

      if (!authResult.success) {
        if (logAuth) {
          logger.info(`Auth failed: ${authResult.error} for ${req.method} ${req.path}`);
        } else {
          logger.debug(`Authentication failed: ${authResult.error}`);
        }

        if (throwOnFailure) {
          return res.status(401).json({ error: authResult.error || 'Authentication failed' });
        }

        // Set empty auth info and continue
        req.auth = { authenticated: false };
        return next();
      }

      // Set authentication info on request
      req.auth = {
        authenticated: true,
        userId: authResult.userId,
        roles: authResult.roles || [],
      };

      if (logAuth) {
        logger.info(`Auth success: User ${authResult.userId} for ${req.method} ${req.path}`);
      } else {
        logger.debug(`Authenticated user: ${authResult.userId}`);
      }

      next();
    } catch (error) {
      logger.error('Authentication error:', error);

      if (throwOnFailure) {
        return res.status(500).json({ error: 'Authentication error' });
      }

      // Set empty auth info and continue
      req.auth = { authenticated: false };
      next();
    }
  };
}

// Extend Express Request type to include auth information
import 'express';

// Make sure we're using the correct module augmentation pattern
declare global {
  namespace Express {
    // Extend the Express Request interface
    interface Request {
      auth?: {
        authenticated: boolean;
        userId?: string;
        roles?: string[];
      };
    }
  }
}
