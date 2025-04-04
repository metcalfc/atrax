import { Request, Response } from 'express';
import { createContextLogger } from '../../utils/logger.js';
import { Transport } from '../transport/transport.js';
import { SSEServerTransport as SdkSSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

const logger = createContextLogger('TransportAdapter');

/**
 * Adapter to make the SDK's SSEServerTransport compatible with our Transport interface
 */
export class TransportAdapter implements Transport {
  private transport: SdkSSEServerTransport;
  private messageHandlers: ((message: JSONRPCMessage) => void)[] = [];
  private errorHandlers: ((error: Error) => void)[] = [];
  private closeHandlers: (() => void)[] = [];
  private running: boolean = false;
  private _sessionId: string;

  /**
   * Create a new TransportAdapter
   * 
   * @param transport - The SDK's SSEServerTransport
   * @param clientId - The client ID for logging purposes
   */
  constructor(transport: SdkSSEServerTransport, private clientId: string) {
    this.transport = transport;
    this._sessionId = this.transport.sessionId;
    this.running = true;
    
    // Forward events from the SDK transport to our handlers
    this.transport.onmessage = (message) => {
      logger.debug(`Received message from client ${clientId} (session ${this.sessionId})`);
      this.messageHandlers.forEach(handler => handler(message));
    };
    
    this.transport.onerror = (error) => {
      logger.error(`Transport error for client ${clientId} (session ${this.sessionId}):`, error);
      this.errorHandlers.forEach(handler => handler(error));
    };
    
    this.transport.onclose = () => {
      logger.info(`Transport closed for client ${clientId} (session ${this.sessionId})`);
      this.running = false;
      this.closeHandlers.forEach(handler => handler());
    };
  }
  
  /**
   * Start the transport
   */
  async start(): Promise<void> {
    if (this.running) {
      return;
    }
    
    try {
      // Let the SDK's transport handle starting the connection
      await this.transport.start();
      this.running = true;
      logger.info(`Transport started for client ${this.clientId} (session ${this.sessionId})`);
    } catch (error) {
      logger.error(`Failed to start transport for client ${this.clientId} (session ${this.sessionId}):`, error);
      throw error;
    }
  }
  
  /**
   * Stop the transport
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }
    
    try {
      await this.transport.close();
      this.running = false;
      logger.info(`Transport stopped for client ${this.clientId} (session ${this.sessionId})`);
    } catch (error) {
      logger.error(`Error stopping transport for client ${this.clientId} (session ${this.sessionId}):`, error);
      throw error;
    }
  }
  
  /**
   * Send a message over the transport
   * 
   * @param message - The JSON-RPC message to send
   */
  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.running) {
      logger.error(`Cannot send message for client ${this.clientId} (session ${this.sessionId}): Transport not running`);
      throw new Error('Transport not running');
    }
    
    try {
      await this.transport.send(message);
      logger.debug(`Sent message to client ${this.clientId} (session ${this.sessionId})`);
    } catch (error) {
      logger.error(`Error sending message to client ${this.clientId} (session ${this.sessionId}):`, error);
      throw error;
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
  on(type: 'close', handler: () => void): void;
  on(type: string, handler: (...args: any[]) => void): void {
    logger.debug(`Registering ${type} handler for client ${this.clientId} (session ${this.sessionId})`);
    
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
        logger.warn(`Unknown event type: ${type}`);
    }
  }
  
  /**
   * Remove an event handler
   */
  removeListener(type: 'message', handler: (message: JSONRPCMessage) => void): void;
  removeListener(type: 'error', handler: (error: Error) => void): void;
  removeListener(type: 'close', handler: () => void): void;
  removeListener(type: string, handler: (...args: any[]) => void): void {
    logger.debug(`Removing ${type} handler for client ${this.clientId} (session ${this.sessionId})`);
    
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
        logger.warn(`Unknown event type: ${type}`);
    }
  }
  
  /**
   * Close the transport
   */
  async close(): Promise<void> {
    await this.stop();
  }
  
  /**
   * Handle POST message from client
   * 
   * @param req - Express request
   * @param res - Express response
   */
  async handlePostMessage(req: Request, res: Response): Promise<void> {
    if (!this.running) {
      logger.error(`Cannot handle message for client ${this.clientId} (session ${this.sessionId}): Transport not running`);
      throw new Error('Transport not running');
    }
    
    try {
      await this.transport.handlePostMessage(req, res);
      logger.debug(`Handled POST message for client ${this.clientId} (session ${this.sessionId})`);
    } catch (error) {
      logger.error(`Error handling POST message for client ${this.clientId} (session ${this.sessionId}):`, error);
      throw error;
    }
  }
  
  /**
   * Get the session ID for this transport
   */
  get sessionId(): string {
    return this._sessionId;
  }
}