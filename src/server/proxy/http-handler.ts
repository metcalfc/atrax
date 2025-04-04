import { Request, Response } from 'express';
import { McpProxy } from './mcp-proxy.js';
import { ServerRegistry } from '../registry/server-registry.js';
import { createContextLogger } from '../../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

// Import directly from the SDK for standard compatibility
import { SSEServerTransport as SdkSSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { TransportAdapter } from './transport-adapter.js';

const logger = createContextLogger('HttpHandler');

/**
 * HTTP handler for the MCP proxy server
 */
export class HttpHandler {
  private proxy: McpProxy;
  private registry: ServerRegistry;
  // Store sessions with all related information
  private sessions: Map<string, {
    transport: SdkSSEServerTransport;
    adapter: TransportAdapter;
    createdAt: Date;
  }> = new Map();

  /**
   * Create a new HTTP handler
   *
   * @param proxy - MCP proxy
   * @param registry - Server registry
   */
  constructor(proxy: McpProxy, registry: ServerRegistry) {
    this.proxy = proxy;
    this.registry = registry;
  }

  /**
   * Handle SSE connection from client
   *
   * @param req - HTTP request
   * @param res - HTTP response
   */
  async handleSSE(req: Request, res: Response): Promise<void | Response> {
    try {
      // Create a unique ID for this client
      const clientId = uuidv4();
      logger.info(`New SSE connection for client ${clientId}`);

      // Important: DO NOT set headers here - let the SDK transport handle it
      // CORS headers are still needed for cross-origin requests
      res.setHeader('Access-Control-Allow-Origin', '*');

      // Create SDK's SSEServerTransport directly
      const transport = new SdkSSEServerTransport('/message', res);
      
      // Get the SDK-generated session ID
      const sessionId = transport.sessionId;
      logger.debug(`SDK assigned session ID: ${sessionId} for client ${clientId}`);
      
      // Create an adapter to make it compatible with our Transport interface
      const adapter = new TransportAdapter(transport, clientId);
      
      // Store session information with both original transport and adapter
      this.sessions.set(sessionId, {
        transport,
        adapter,
        createdAt: new Date()
      });
      
      // Add client to proxy with the client ID using the adapter
      this.proxy.addClientTransport(clientId, adapter);

      // Start the transport - this sends headers and the endpoint event
      try {
        await transport.start();
        logger.info(`Started SSE transport for client ${clientId} with session ${sessionId}`);
      } catch (error) {
        // If start fails, clean up resources
        this.sessions.delete(sessionId);
        this.proxy.removeClientTransport(clientId);
        logger.error(`Failed to start SSE transport for client ${clientId}:`, error);
        throw error;
      }
      
      // Handle connection close
      req.on('close', () => {
        logger.info(`SSE connection closed for client ${clientId} (session ${sessionId})`);
        this.sessions.delete(sessionId);
        this.proxy.removeClientTransport(clientId);
      });
    } catch (error) {
      this.handleSseError(req, res, error);
    }
  }
  
  /**
   * Handle errors during SSE connection
   * 
   * @param req - HTTP request
   * @param res - HTTP response
   * @param error - The error that occurred
   */
  private handleSseError(req: Request, res: Response, error: unknown): void {
    logger.error('Error in SSE handler:', error);
    // Only send an error response if headers haven't been sent yet
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    } else {
      // If headers have been sent, we need to end the response
      res.end();
    }
  }

  /**
   * Handle HTTP message from client
   *
   * @param req - HTTP request
   * @param res - HTTP response
   */
  async handleMessage(req: Request, res: Response): Promise<void | Response> {
    try {
      // Get sessionId from query parameter (as sent in the endpoint event)
      const sessionId = req.query.sessionId as string;

      // Skip body validation for messages that will be handled by the SDK transport
      // This prevents consuming the request body stream before passing to the SDK

      // For direct message handling with no session ID
      if (!sessionId) {
        // Validate request format only for direct messages
        if (!req.body || typeof req.body !== 'object') {
          logger.error('Invalid request body format');
          return res.status(400).json({
            jsonrpc: '2.0',
            error: {
              code: -32600,
              message: 'Invalid request body',
              data: { details: 'Request body must be a valid JSON object' }
            },
            id: null
          });
        }

        // Validate the request has the minimum required JSON-RPC fields
        if (!req.body.jsonrpc || req.body.jsonrpc !== '2.0') {
          return res.status(400).json({
            jsonrpc: '2.0',
            error: {
              code: -32600,
              message: 'Invalid JSON-RPC message',
              data: { details: 'Message must have jsonrpc field set to "2.0"' }
            },
            id: req.body.id || null
          });
        }

        logger.debug('Processing direct message without session');
        const result = await this.proxy.handleDirectMessage(req.body);
        return res.json(result);
      }

      // Get the session for this request using the SDK-generated session ID
      const session = this.sessions.get(sessionId);

      if (!session) {
        logger.error(`No session found with ID: ${sessionId}`);
        logger.debug(`Available sessions: ${Array.from(this.sessions.keys()).join(', ')}`);
        
        return res.status(404).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Session not found',
            data: { details: `No active session found with ID: ${sessionId}` }
          },
          id: null
        });
      }

      // IMPORTANT: Let the SDK transport handle the message directly
      // This ensures proper handling of the message according to the MCP protocol
      try {
        // This is critical: we must NOT access req.body before passing to transport
        // The SDK will parse the body directly from the request stream
        logger.debug(`Delegating message handling to SDK transport for session ${sessionId}`);
        
        // Pass the request and response directly to the SDK transport without trying to
        // pre-process or access the body at all
        await session.transport.handlePostMessage(req, res);
        logger.debug(`Successfully handled message for session ${sessionId}`);
      } catch (transportError) {
        logger.error(`Error in transport.handlePostMessage for session ${sessionId}:`, transportError);
        
        // Only send response if headers haven't been sent yet
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal server error',
              data: { details: transportError instanceof Error ? transportError.message : 'Unknown error' }
            },
            id: null
          });
        }
        return;
      }
    } catch (error) {
      logger.error('Error in message handler:', error);
      
      // Only send response if headers haven't been sent yet
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
            data: { details: error instanceof Error ? error.message : 'Unknown error' }
          },
          id: req.body?.id || null
        });
      }
    }
  }

  /**
   * Get server information
   *
   * @param req - HTTP request
   * @param res - HTTP response
   */
  async getServers(req: Request, res: Response): Promise<void | Response> {
    try {
      const servers = Array.from(this.registry.getServers().entries()).map(([name, config]) => ({
        name,
        transportType: config.transportType,
        description: config.description || '',
        tags: config.tags || [],
        running: this.registry.isServerRunning(name),
      }));

      res.json({ servers });
    } catch (error) {
      logger.error('Error in getServers:', error);
      res.status(500).json({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get server details
   *
   * @param req - HTTP request
   * @param res - HTTP response
   */
  async getServerDetails(req: Request, res: Response): Promise<void | Response> {
    try {
      const serverName = req.params.name;

      if (!serverName) {
        return res.status(400).json({ error: 'Missing server name' });
      }

      try {
        const config = this.registry.getServer(serverName);

        if (!config) {
          return res.status(404).json({ error: `Server ${serverName} not found` });
        }

        res.json({
          name: config.name,
          transportType: config.transportType,
          description: config.description || '',
          tags: config.tags || [],
          running: this.registry.isServerRunning(serverName),
        });
      } catch (error) {
        return res.status(404).json({ error: `Server ${serverName} not found` });
      }
    } catch (error) {
      logger.error('Error in getServerDetails:', error);
      res.status(500).json({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Start a server
   *
   * @param req - HTTP request
   * @param res - HTTP response
   */
  async startServer(req: Request, res: Response): Promise<void | Response> {
    try {
      const serverName = req.params.name;

      if (!serverName) {
        return res.status(400).json({ error: 'Missing server name' });
      }

      try {
        await this.registry.startServer(serverName);
        res.json({ success: true, message: `Server ${serverName} started` });
      } catch (error) {
        if (error instanceof Error) {
          return res.status(400).json({ error: error.message });
        }

        return res.status(500).json({ error: 'Failed to start server' });
      }
    } catch (error) {
      logger.error('Error in startServer:', error);
      res.status(500).json({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Stop a server
   *
   * @param req - HTTP request
   * @param res - HTTP response
   */
  async stopServer(req: Request, res: Response): Promise<void | Response> {
    try {
      const serverName = req.params.name;

      if (!serverName) {
        return res.status(400).json({ error: 'Missing server name' });
      }

      try {
        await this.registry.stopServer(serverName);
        res.json({ success: true, message: `Server ${serverName} stopped` });
      } catch (error) {
        if (error instanceof Error) {
          return res.status(400).json({ error: error.message });
        }

        return res.status(500).json({ error: 'Failed to stop server' });
      }
    } catch (error) {
      logger.error('Error in stopServer:', error);
      res.status(500).json({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get proxy status
   *
   * @param req - HTTP request
   * @param res - HTTP response
   */
  async getStatus(req: Request, res: Response): Promise<void | Response> {
    try {
      const status = {
        servers: {
          total: this.registry.getServerCount(),
          running: this.registry.getRunningServerCount(),
        },
        clients: {
          connected: this.proxy.getClientCount(),
        },
      };

      res.json(status);
    } catch (error) {
      logger.error('Error in getStatus:', error);
      res.status(500).json({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
