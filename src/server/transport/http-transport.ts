import { Transport } from './transport.js';
import { JSONRPCMessage, JSONRPCRequest } from '@modelcontextprotocol/sdk/types.js';
import { Request, Response } from 'express';
import { z } from 'zod';

/**
 * HTTP transport implementation for MCP servers
 */
export class HTTPServerTransport implements Transport {
  private messageHandlers: ((message: JSONRPCMessage) => void)[] = [];
  private errorHandlers: ((error: Error) => void)[] = [];
  private closeHandlers: (() => void)[] = [];
  private running: boolean = false;

  constructor() {
    // Initialize without dependencies
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }
    this.running = false;
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.running) {
      throw new Error('Transport not running');
    }
    // Messages are sent via handleRequest
  }

  isRunning(): boolean {
    return this.running;
  }

  on(type: 'message', handler: (message: JSONRPCMessage) => void): void;
  on(type: 'error', handler: (error: Error) => void): void;
  on(type: 'close', handler: (code?: number) => void): void;
  on(type: string, handler: (...args: any[]) => void): void {
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
    }
  }

  removeListener(type: 'message', handler: (message: JSONRPCMessage) => void): void;
  removeListener(type: 'error', handler: (error: Error) => void): void;
  removeListener(type: 'close', handler: (code?: number) => void): void;
  removeListener(type: string, handler: (...args: any[]) => void): void {
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
    }
  }

  async close(): Promise<void> {
    await this.stop();
  }

  /**
   * Handle an HTTP request
   */
  async handleRequest(req: Request, res: Response): Promise<void> {
    try {
      const message = req.body as JSONRPCRequest;
      this.messageHandlers.forEach(handler => handler(message));

      // Let the message handlers process the request
      // The response will be sent by the server
      res.json({
        jsonrpc: '2.0',
        result: null,
        id: message.id || null,
      });
    } catch (error) {
      const err = error as Error;
      this.errorHandlers.forEach(handler => handler(err));
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: err.message,
        },
        id: null,
      });
    }
  }
}
