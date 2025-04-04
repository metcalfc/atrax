import { SSEServerTransport as SdkSSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { Request, Response } from 'express';
import { Transport } from './transport.js';
import { JSONRPCMessage, JSONRPCMessageSchema } from '@modelcontextprotocol/sdk/types.js';
import { createContextLogger } from '../../utils/logger.js';

const logger = createContextLogger('SSEServerTransport');

/**
 * Custom transport error class for better error information
 */
export class SSETransportError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
    public readonly code?: number,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'SSETransportError';

    // Capture the stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SSETransportError);
    }
  }
}

/**
 * Wrapper for SSEServerTransport that implements the event handling interface
 * with enhanced error handling
 */
export class SSEServerTransport implements Transport {
  private transport: SdkSSEServerTransport;
  private messageHandlers: ((message: JSONRPCMessage) => void)[] = [];
  private errorHandlers: ((error: Error) => void)[] = [];
  private closeHandlers: (() => void)[] = [];
  private running: boolean = false;
  private clientId: string;

  /**
   * Get the underlying SDK transport's session ID
   */
  get sessionId(): string {
    return this.transport?.sessionId || this.clientId;
  }

  /**
   * Create a new SSE server transport
   *
   * @param path - The path for the message endpoint
   * @param res - The Express response object to use for SSE
   * @param clientId - Optional client identifier for tracing
   */
  constructor(path: string, res: Response, clientId?: string) {
    this.clientId = clientId || 'unknown-client';
    logger.debug(`Creating SSE transport for client ${this.clientId}`);

    try {
      this.transport = new SdkSSEServerTransport(path, res);
    } catch (error) {
      const transportError = new SSETransportError(
        'Failed to create SSE transport',
        error instanceof Error ? error : undefined,
        400,
        { clientId: this.clientId, path }
      );
      logger.error(`Transport creation error:`, transportError);
      throw transportError;
    }

    // Forward events with enhanced error information
    this.transport.onmessage = message => {
      try {
        logger.debug(`Received message from client ${this.clientId}`);
        this.messageHandlers.forEach(handler => handler(message));
      } catch (error) {
        const messageError = new SSETransportError(
          'Error handling incoming message',
          error instanceof Error ? error : undefined,
          500,
          { clientId: this.clientId }
        );
        logger.error(`Message handling error:`, messageError);
        this.errorHandlers.forEach(handler => handler(messageError));
      }
    };

    this.transport.onerror = error => {
      const transportError = new SSETransportError('SSE transport error', error, 500, {
        clientId: this.clientId,
      });
      logger.error(`Transport error for client ${this.clientId}:`, transportError);
      this.errorHandlers.forEach(handler => handler(transportError));
    };

    this.transport.onclose = () => {
      logger.info(`SSE connection closed for client ${this.clientId}`);
      this.closeHandlers.forEach(handler => handler());
      this.running = false;
    };
  }

  /**
   * Start the transport
   */
  async start(): Promise<void> {
    if (this.running) {
      logger.debug(`Transport for client ${this.clientId} already running`);
      return;
    }

    logger.info(`Starting SSE transport for client ${this.clientId}`);
    try {
      await this.transport.start();
      this.running = true;
      logger.info(`Successfully started SSE transport for client ${this.clientId}`);
    } catch (error) {
      const startError = new SSETransportError(
        'Failed to start SSE transport',
        error instanceof Error ? error : undefined,
        500,
        { clientId: this.clientId }
      );
      logger.error(`Transport start error:`, startError);
      throw startError;
    }
  }

  /**
   * Stop the transport
   */
  async stop(): Promise<void> {
    if (!this.running) {
      logger.debug(`Transport for client ${this.clientId} not running`);
      return;
    }

    logger.info(`Stopping SSE transport for client ${this.clientId}`);
    try {
      await this.transport.close();
      this.running = false;
      logger.info(`Successfully stopped SSE transport for client ${this.clientId}`);
    } catch (error) {
      const stopError = new SSETransportError(
        'Failed to stop SSE transport',
        error instanceof Error ? error : undefined,
        500,
        { clientId: this.clientId }
      );
      logger.error(`Transport stop error:`, stopError);
      throw stopError;
    }
  }

  /**
   * Send a message through the transport
   *
   * @param message - JSON-RPC message to send
   */
  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.running) {
      throw new SSETransportError('Transport not running', undefined, 400, {
        clientId: this.clientId,
      });
    }

    logger.debug(`Sending message to client ${this.clientId}`);

    try {
      // Validate message before sending
      JSONRPCMessageSchema.parse(message);

      await this.transport.send(message);
      logger.debug(`Successfully sent message to client ${this.clientId}`);
    } catch (error) {
      const sendError = new SSETransportError(
        'Failed to send message',
        error instanceof Error ? error : undefined,
        500,
        { clientId: this.clientId }
      );
      logger.error(`Message send error:`, sendError);
      throw sendError;
    }
  }

  /**
   * Check if the transport is running
   *
   * @returns True if the transport is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Register an event handler
   */
  on(type: 'message', handler: (message: JSONRPCMessage) => void): void;
  on(type: 'error', handler: (error: Error) => void): void;
  on(type: 'close', handler: (code?: number) => void): void;
  on(type: string, handler: (...args: any[]) => void): void {
    logger.debug(`Registering ${type} handler for client ${this.clientId}`);

    switch (type) {
      case 'message':
        this.messageHandlers.push(handler as (message: JSONRPCMessage) => void);
        break;
      case 'error':
        this.errorHandlers.push(handler as (error: Error) => void);
        break;
      case 'close':
        this.closeHandlers.push(handler as () => void);
        break;
      default:
        logger.warn(`Unknown event type: ${type} for client ${this.clientId}`);
    }
  }

  /**
   * Remove an event handler
   */
  removeListener(type: 'message', handler: (message: JSONRPCMessage) => void): void;
  removeListener(type: 'error', handler: (error: Error) => void): void;
  removeListener(type: 'close', handler: (code?: number) => void): void;
  removeListener(type: string, handler: (...args: any[]) => void): void {
    logger.debug(`Removing ${type} handler for client ${this.clientId}`);

    switch (type) {
      case 'message':
        this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
        break;
      case 'error':
        this.errorHandlers = this.errorHandlers.filter(h => h !== handler);
        break;
      case 'close':
        this.closeHandlers = this.closeHandlers.filter(h => h !== handler);
        break;
      default:
        logger.warn(`Unknown event type: ${type} for client ${this.clientId}`);
    }
  }

  /**
   * Close the transport
   */
  async close(): Promise<void> {
    logger.info(`Closing SSE transport for client ${this.clientId}`);
    await this.stop();
  }

  /**
   * Handle an HTTP POST message
   *
   * @param req - Express Request object
   * @param res - Express Response object
   */
  async handlePostMessage(req: Request, res: Response): Promise<void> {
    logger.debug(`Handling POST message for client ${this.clientId}`);

    try {
      // Validate the request body is a valid JSON-RPC message
      try {
        JSONRPCMessageSchema.parse(req.body);
      } catch (error) {
        logger.error(`Invalid JSON-RPC message received:`, error);
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32600,
            message: 'Invalid JSON-RPC message',
            data: { details: error instanceof Error ? error.message : 'Unknown error' },
          },
          id: req.body?.id || null,
        });
        return;
      }

      await this.transport.handlePostMessage(req, res);
      logger.debug(`Successfully handled POST message for client ${this.clientId}`);
    } catch (error) {
      const postError = new SSETransportError(
        'Failed to handle POST message',
        error instanceof Error ? error : undefined,
        500,
        { clientId: this.clientId }
      );
      logger.error(`POST message handling error:`, postError);

      // If response is not already sent
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
            data: { details: error instanceof Error ? error.message : 'Unknown error' },
          },
          id: req.body?.id || null,
        });
      }
    }
  }
}
