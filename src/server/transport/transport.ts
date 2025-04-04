import { EventEmitter } from 'node:events';
import { Transport as SdkTransport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { JSONRPCMessage } from '../../types/mcp.js';

/**
 * Transport events
 */
export enum TransportEvent {
  /** Transport received a message */
  MESSAGE = 'message',
  /** Transport encountered an error */
  ERROR = 'error',
  /** Transport closed */
  CLOSE = 'close',
  /** Transport started */
  START = 'start',
}

/**
 * Base transport interface for communication with MCP servers
 */
export interface Transport {
  /**
   * Start the transport
   */
  start(): Promise<void>;

  /**
   * Stop the transport
   */
  stop(): Promise<void>;

  /**
   * Send a message to the transport
   *
   * @param message - Message to send
   */
  send(message: JSONRPCMessage): Promise<void>;

  /**
   * Check if the transport is running
   */
  isRunning(): boolean;

  /**
   * Add an event listener
   * 
   * @param type - Event type
   * @param handler - Event handler
   */
  on(type: 'message', handler: (message: JSONRPCMessage) => void): void;
  on(type: 'error', handler: (error: Error) => void): void;
  on(type: 'close', handler: (code?: number) => void): void;
  on(type: string, handler: (...args: any[]) => void): void;

  /**
   * Remove an event listener
   * 
   * @param type - Event type
   * @param handler - Event handler
   */
  removeListener(type: 'message', handler: (message: JSONRPCMessage) => void): void;
  removeListener(type: 'error', handler: (error: Error) => void): void;
  removeListener(type: 'close', handler: (code?: number) => void): void;
  removeListener(type: string, handler: (...args: any[]) => void): void;

  /**
   * Close the transport
   */
  close(): Promise<void>;
}

/**
 * Abstract base class for transport implementations
 */
export abstract class BaseTransport extends EventEmitter implements Transport {
  protected running: boolean = false;

  /**
   * Start the transport
   */
  abstract start(): Promise<void>;

  /**
   * Stop the transport
   */
  abstract stop(): Promise<void>;

  /**
   * Send a message to the transport
   *
   * @param message - Message to send
   */
  abstract send(message: JSONRPCMessage): Promise<void>;

  /**
   * Check if the transport is running
   *
   * @returns True if the transport is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Close the transport
   */
  async close(): Promise<void> {
    await this.stop();
  }

  // The base class inherits the EventEmitter implementation of on/removeListener
  // which satisfies the interface, so we don't need explicit implementations here
}
