/**
 * Authentication module exports
 */
export * from './auth-provider.js';
export * from './auth-middleware.js';

import { Application } from 'express';
import { AuthConfig, isTokenAuth, isBasicAuth, isOAuth2Auth } from '../../types/config.js';
import { createAuthProvider, AuthProvider } from './auth-provider.js';
import { createAuthMiddleware, AuthMiddlewareOptions } from './auth-middleware.js';
import { createContextLogger } from '../../utils/logger.js';

const logger = createContextLogger('AuthModule');

/**
 * Setup authentication for an Express application
 *
 * @param app - Express application
 * @param authConfig - Authentication configuration
 * @param middlewareOptions - Additional middleware options
 * @returns The configured auth provider
 */
export function setupAuth(
  app: Application,
  authConfig: AuthConfig | undefined,
  middlewareOptions: Partial<AuthMiddlewareOptions> = {}
): AuthProvider {
  // Default to no auth if not configured
  if (!authConfig) {
    authConfig = { type: 'none' };
  }

  logger.info(`Setting up authentication with type: ${authConfig.type}`);

  let authProvider: AuthProvider;

  // Create the appropriate auth provider based on configuration
  switch (authConfig.type) {
    case 'token':
      if (!authConfig.options?.token) {
        throw new Error('Token is required for token authentication');
      }

      // The TokenAuthProvider constructor accepts userId and roles as additional params
      // but they're not part of TokenAuthOptions in the config
      authProvider = createAuthProvider('token', {
        token: authConfig.options.token,
      });
      break;

    case 'basic':
      if (!authConfig.options?.username || !authConfig.options?.password) {
        throw new Error('Username and password are required for basic authentication');
      }
      authProvider = createAuthProvider('basic', {
        username: authConfig.options.username,
        password: authConfig.options.password,
      });
      break;

    case 'oauth2':
      throw new Error('OAuth2 authentication is not yet implemented');

    case 'none':
    default:
      authProvider = createAuthProvider('none');
      break;
  }

  // Set up middleware options with defaults
  const fullMiddlewareOptions: AuthMiddlewareOptions = {
    // Default paths to bypass authentication
    bypassPaths: ['/health', '/status', '/auth'],

    // Throw on failure by default
    throwOnFailure: true,

    // Enable CORS by default for better compatibility
    enableCors: true,

    // Override with any user-provided options
    ...middlewareOptions,
  };

  // Create and apply the auth middleware
  const authMiddleware = createAuthMiddleware(authProvider, fullMiddlewareOptions);
  app.use(authMiddleware as any);

  return authProvider;
}
