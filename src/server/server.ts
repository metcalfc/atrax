type RouteHandler = (req: any, res: any) => Promise<any>;

// Helper function to wrap our route handlers for Express
const wrapHandler = (handler: RouteHandler) => {
  return (req: any, res: any) => {
    handler(req, res).catch((err: any) => {
      console.error('Route handler error:', err);
      res.status(500).json({ error: 'Internal server error' });
    });
  };
};
import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import cookieParser from 'cookie-parser';
import { McpProxy } from './proxy/mcp-proxy.js';
import { ServerRegistry } from './registry/server-registry.js';
import { HttpHandler } from './proxy/http-handler.js';
import { AuthProvider } from './auth/auth-provider.js';
import { setupAuth } from './auth/index.js';
import { AtraxConfig } from '../types/config.js';
import { createContextLogger } from '../utils/logger.js';
import { McpServer } from './mcp/mcp-server.js';
import { ResourceConflictStrategy } from './mcp/types.js';

// Import types for Express Request extension
import { Request, Response, NextFunction } from 'express';

const logger = createContextLogger('Server');

/**
 * Atrax proxy server
 */
export class AtraxServer {
  private config: AtraxConfig;
  private app: express.Express;
  private server: ReturnType<typeof createServer> | null = null;
  private registry: ServerRegistry;
  private proxy: McpProxy;
  private httpHandler: HttpHandler;
  private authProvider!: AuthProvider; // Initialized in setupMiddleware
  private mcpServer: McpServer | null = null;

  /**
   * Create a new Atrax server
   *
   * @param config - Server configuration
   */
  constructor(config: AtraxConfig) {
    this.config = config;
    this.app = express();

    // Create server registry
    this.registry = new ServerRegistry();

    // Create MCP proxy
    this.proxy = new McpProxy(this.registry);

    // Create HTTP handler
    this.httpHandler = new HttpHandler(this.proxy, this.registry);

    // Create the MCP server for internal use only
    this.mcpServer = new McpServer('atrax', '0.1.0', this.registry, {
      strategy: ResourceConflictStrategy.FIRST_WINS,
    });

    // Set up middleware
    this.setupMiddleware();

    // Set up routes
    this.setupRoutes();
  }

  /**
   * Set up Express middleware
   */
  private setupMiddleware(): void {
    // Add raw body parsing middleware for /message endpoint
    // This is crucial for SSE transport to work correctly
    const rawBodyParser = (req: Request, res: Response, next: NextFunction) => {
      if (req.path === '/message' && req.method === 'POST') {
        // Do not attempt to parse the body - let SSE transport handle it
        return next();
      }
      // For all other routes, use normal JSON parsing
      express.json()(req, res, next);
    };

    // Apply the middleware
    this.app.use(rawBodyParser);
    this.app.use(cookieParser());

    // Request logging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      logger.debug(`${req.method} ${req.path}`);
      next();
    });

    // Set up authentication
    // Note: This automatically adds CORS support through auth middleware
    this.authProvider = setupAuth(this.app, this.config.auth, {
      enableCors: true,
      // Only bypass basic endpoints, SSE and message require authentication
      bypassPaths: ['/health', '/status', '/auth']
    });
  }

  /**
   * Set up Express routes
   */
  private setupRoutes(): void {
    // Helper function to wrap our route handlers for Express
    const wrapHandler = (handler: (req: Request, res: Response) => Promise<any>) => {
      return (req: Request, res: Response) => {
        Promise.resolve(handler(req, res)).catch((err: Error) => {
          logger.error('Route handler error:', err);
          res.status(500).json({ error: 'Internal server error' });
        });
      };
    };

    // Health check - public endpoint
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok' });
    });
    
    // Add debug endpoints only in development mode
    if (process.env.NODE_ENV === 'development') {
      // Debug endpoints for development
      this.app.get('/debug/status', (req, res) => {
        res.json({
          status: 'ok',
          environment: process.env.NODE_ENV || 'not set',
          auth: this.config.auth?.type || 'none',
          servers: Object.keys(this.registry.getServers()),
        });
      });
    }

    // Authentication
    const authHandler = async (req: Request, res: Response) => {
      try {
        const result = await this.authProvider.authenticate(req.body);

        if (!result.success) {
          return res.status(401).json({ error: result.error });
        }

        // Set cookie with token if available
        if (result.token) {
          res.cookie('token', result.token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 24 * 60 * 60 * 1000, // 24 hours
          });
        }

        res.json({
          success: true,
          userId: result.userId,
          roles: result.roles,
          expiresAt: result.expiresAt,
        });
      } catch (error) {
        logger.error('Authentication error:', error);
        res.status(500).json({ error: 'Authentication error' });
      }
    };
    this.app.post('/auth', wrapHandler(authHandler));

    // Server status
    const statusHandler = this.httpHandler.getStatus.bind(this.httpHandler);
    this.app.get('/status', wrapHandler(statusHandler));

    // Servers
    const serversHandler = this.httpHandler.getServers.bind(this.httpHandler);
    this.app.get('/servers', wrapHandler(serversHandler));

    const serverDetailsHandler = this.httpHandler.getServerDetails.bind(this.httpHandler);
    this.app.get('/servers/:name', wrapHandler(serverDetailsHandler));

    const startServerHandler = this.httpHandler.startServer.bind(this.httpHandler);
    this.app.post('/servers/:name/start', wrapHandler(startServerHandler));

    const stopServerHandler = this.httpHandler.stopServer.bind(this.httpHandler);
    this.app.post('/servers/:name/stop', wrapHandler(stopServerHandler));

    // SSE
    const sseHandler = this.httpHandler.handleSSE.bind(this.httpHandler);
    this.app.get('/sse', wrapHandler(sseHandler));

    // Messages
    const messageHandler = this.httpHandler.handleMessage.bind(this.httpHandler);
    this.app.post('/message', wrapHandler(messageHandler));

    // Error handling
    this.app.use(
      (err: Error, req: Request, res: Response, next: NextFunction) => {
        logger.error('Express error:', err);
        res.status(500).json({ error: 'Internal server error' });
      }
    );
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    // Register all servers from the configuration
    for (const [name, serverConfig] of Object.entries(this.config.mcpServers)) {
      this.registry.registerServer({
        ...serverConfig,
        name,
        // Ensure we have transportType
        transportType: serverConfig.transportType,
      });
    }

    // Start the MCP server
    if (this.mcpServer) {
      await this.mcpServer.start();
    }

    // Start the HTTP server
    return new Promise<void>((resolve, reject) => {
      try {
        // Check for PORT environment variable override
        const envPort = process.env.PORT ? parseInt(process.env.PORT, 10) : null;
        const port = envPort || this.config.port || 4000;
        const host = this.config.host || 'localhost';

        if (envPort) {
          logger.info(`Using port ${envPort} from PORT environment variable`);
        }

        this.server = createServer(this.app);

        this.server.on('error', (error: any) => {
          if (error.code === 'EADDRINUSE') {
            logger.error(`Port ${port} is already in use. Try a different port:`);
            logger.error(`  - Set PORT environment variable: PORT=4000 npm run serve`);
            logger.error(`  - Or modify the port in your config file`);
          } else {
            logger.error('Server error:', error);
          }
          reject(error);
        });

        this.server.listen(port, host, () => {
          // Log better debugging information
          const actualHost = host === '0.0.0.0' ? 'localhost' : host;
          logger.info(`=== Atrax Server Running ===`);
          logger.info(`Server listening on http://${actualHost}:${port}`);
          logger.info(`Health check: http://${actualHost}:${port}/health`);
          logger.info(`Status: http://${actualHost}:${port}/status`);
          logger.info(`Servers: http://${actualHost}:${port}/servers`);
          logger.info(`================================`);
          resolve();
        });
      } catch (error) {
        logger.error('Failed to start server:', error);
        reject(error);
      }
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    logger.info('Stopping server');

    // Stop all running MCP servers
    await this.registry.stopAllServers();

    // Stop the MCP server
    if (this.mcpServer) {
      await this.mcpServer.stop();
    }

    // Close the HTTP server
    if (this.server) {
      return new Promise<void>((resolve, reject) => {
        this.server!.close(error => {
          if (error) {
            logger.error('Error closing server:', error);
            reject(error);
          } else {
            logger.info('Server closed');
            this.server = null;
            resolve();
          }
        });
      });
    }
  }

  /**
   * Start a specific MCP server
   *
   * @param serverName - Server name
   */
  async startServer(serverName: string): Promise<void> {
    await this.registry.startServer(serverName);
  }

  /**
   * Stop a specific MCP server
   *
   * @param serverName - Server name
   */
  async stopServer(serverName: string): Promise<void> {
    await this.registry.stopServer(serverName);
  }

  /**
   * Start all MCP servers
   */
  async startAllServers(): Promise<void> {
    await this.registry.startAllServers();
  }

  /**
   * Get the Express application
   *
   * @returns Express application
   */
  getApp(): express.Express {
    return this.app;
  }

  /**
   * Get the server registry
   *
   * @returns Server registry
   */
  getRegistry(): ServerRegistry {
    return this.registry;
  }

  /**
   * Get the MCP proxy
   *
   * @returns MCP proxy
   */
  getProxy(): McpProxy {
    return this.proxy;
  }

  /**
   * Get the MCP server
   *
   * @returns MCP server
   */
  getMcpServer(): McpServer | null {
    return this.mcpServer;
  }
}
