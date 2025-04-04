import { spawn, ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import { BaseTransport, TransportEvent } from './transport.js';
import { createContextLogger } from '../../utils/logger.js';
import { StdioMcpServerConfig } from '../../types/config.js';
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from '@modelcontextprotocol/sdk/client/stdio.js';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { PathUtils } from '../../utils/path.js';

/**
 * We need to use the JSONRPCMessage type from the SDK
 * to ensure compatibility with the serializeMessage function
 */
export type SafeJsonRpcMessage = JSONRPCMessage;

const logger = createContextLogger('StdioTransport');

/**
 * Transport for communicating with MCP servers over stdio
 */
export class StdioTransport extends BaseTransport {
  private process: ChildProcess | null = null;
  private config: StdioMcpServerConfig;
  private transport: StdioClientTransport | null = null;

  /**
   * Create a new stdio transport
   *
   * @param config - Stdio MCP server configuration
   */
  constructor(config: StdioMcpServerConfig) {
    super();
    this.config = config;
  }

  /**
   * Start the transport by spawning the process
   */
  async start(): Promise<void> {
    if (this.running) {
      logger.warn(`Transport for ${this.config.name} is already running`);
      return;
    }

    try {
      logger.info(
        `Starting stdio transport for ${this.config.name}: ${this.config.command} ${
          this.config.args?.join(' ') || ''
        }`
      );

      // Log detailed args before resolving
      logger.info(`Args before resolving for ${this.config.name}:`, {
        args: this.config.args,
        argsType: typeof this.config.args,
        env: {
          ATRAX_ROOT: process.env.ATRAX_ROOT,
          PWD: process.env.PWD,
          NODE_PATH: process.env.NODE_PATH,
        },
      });

      // Resolve the executable and arguments to proper paths
      const { command, args } = PathUtils.resolveExecutable(
        this.config.command,
        this.config.args || [],
        { debug: true }
      );

      logger.info(`Using command: ${command} with args: ${args.join(' ')}`);

      // Create the SDK's stdio transport
      this.transport = new StdioClientTransport({
        command,
        args,
        env: Object.fromEntries(
          Object.entries({ ...process.env, ...this.config.env }).filter(([_, v]) => v !== undefined)
        ) as Record<string, string>,
        stderr: 'pipe',
      });

      // Set up callback handlers
      this.transport.onerror = (error: Error) => {
        logger.error(`Error from ${this.config.name}:`, error);
        this.emit(TransportEvent.ERROR, error);
      };

      this.transport.onclose = () => {
        logger.info(`${this.config.name} transport closed`);
        this.running = false;
        this.transport = null;
        this.emit(TransportEvent.CLOSE);
      };

      this.transport.onmessage = (message: JSONRPCMessage) => {
        logger.debug(`Received message from ${this.config.name}:`, {
          message,
          type: typeof message,
          keys: Object.keys(message),
        });
        this.emit(TransportEvent.MESSAGE, message);
      };

      // Start the transport
      await this.transport.start();

      // Set up stderr logging if available
      if (this.transport.stderr) {
        this.transport.stderr.on('data', chunk => {
          const stderr = chunk.toString();
          logger.debug(`Stderr from ${this.config.name}: ${stderr}`);
        });
      }

      this.running = true;
      this.emit(TransportEvent.START);
    } catch (error) {
      this.running = false;
      this.transport = null;
      logger.error(`Failed to start ${this.config.name}:`, error);
      throw error;
    }
  }

  /**
   * Stop the transport by killing the process
   */
  async stop(): Promise<void> {
    if (!this.running || !this.transport) {
      logger.warn(`Transport for ${this.config.name} is not running`);
      return;
    }

    logger.info(`Stopping stdio transport for ${this.config.name}`);

    try {
      await this.transport.close();
      this.running = false;
      this.transport = null;
    } catch (error) {
      logger.error(`Error stopping ${this.config.name}:`, error);
      throw error;
    }
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.running || !this.transport) {
      throw new Error(`Cannot send message to ${this.config.name}: transport not running`);
    }

    try {
      // Log the message before sending
      logger.debug(`Preparing to send message to ${this.config.name}:`, {
        message,
        type: typeof message,
        keys: Object.keys(message),
      });

      // Use the SDK's transport to send the message
      await this.transport.send(message);

      logger.debug(`Successfully sent message to ${this.config.name}`);
    } catch (error) {
      logger.error(`Error sending message to ${this.config.name}:`, {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        message: message
          ? {
              type: typeof message,
              keys: Object.keys(message),
              stringified: JSON.stringify(message),
            }
          : 'no message',
      });
      throw new Error(
        `Failed to send message: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
