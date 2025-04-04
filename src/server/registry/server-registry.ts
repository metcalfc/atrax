import { EventEmitter } from 'node:events';
import { McpServerConfig } from '../../types/config.js';
import { Transport as SdkTransport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { TransportFactory } from '../transport/transport-factory.js';
import { createContextLogger } from '../../utils/logger.js';
import {
  JSONRPCMessage,
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCNotification,
  JSONRPCError,
} from '@modelcontextprotocol/sdk/types.js';
import { JSONRPCErrorObject, MethodResults, MethodParams } from '../../types/mcp.js';
import crypto from 'node:crypto';

// Define a more specific MessageType for our use case
type JSONRPCMessageUnion = JSONRPCRequest | JSONRPCResponse | JSONRPCNotification | JSONRPCError;

const logger = createContextLogger('ServerRegistry');

/**
 * Server registry events
 */
export enum RegistryEvent {
  /** Server registered */
  SERVER_REGISTERED = 'server-registered',
  /** Server unregistered */
  SERVER_UNREGISTERED = 'server-unregistered',
  /** Server started */
  SERVER_STARTED = 'server-started',
  /** Server stopped */
  SERVER_STOPPED = 'server-stopped',
  /** Server error */
  SERVER_ERROR = 'server-error',
  /** Server message */
  SERVER_MESSAGE = 'server-message',
  /** Server added */
  SERVER_ADDED = 'server-added',
  /** Server removed */
  SERVER_REMOVED = 'server-removed',
}

/**
 * Registry for managing MCP servers and their transports
 */
export class ServerRegistry extends EventEmitter {
  private servers: Map<string, McpServerConfig> = new Map();
  private transports: Map<string, SdkTransport> = new Map();
  private transportFactory: TransportFactory;
  private pendingResponses: Map<
    string,
    { 
      resolve: (value: unknown) => void; 
      reject: (reason: Error) => void; 
      timeoutId: NodeJS.Timeout 
    }
  > = new Map();

  constructor() {
    super();
    this.transportFactory = new TransportFactory();
  }

  /**
   * Register a server
   *
   * @param config - Server configuration
   * @throws Error if server with same name already registered
   */
  registerServer(config: McpServerConfig): void {
    if (this.servers.has(config.name)) {
      throw new Error(`Server with name ${config.name} already registered`);
    }

    logger.info(`Registering server ${config.name}`);

    this.servers.set(config.name, config);
    this.emit(RegistryEvent.SERVER_REGISTERED, config);
    this.emit(RegistryEvent.SERVER_ADDED, config);
  }

  /**
   * Unregister a server
   *
   * @param name - Server name
   * @throws Error if server is not registered
   */
  unregisterServer(name: string): void {
    if (!this.servers.has(name)) {
      throw new Error(`Server with name ${name} not registered`);
    }

    logger.info(`Unregistering server ${name}`);

    const config = this.servers.get(name)!;
    const transport = this.transports.get(name);
    if (transport) {
      transport.close();
      this.transports.delete(name);
    }

    this.servers.delete(name);
    this.emit(RegistryEvent.SERVER_UNREGISTERED, name);
    this.emit(RegistryEvent.SERVER_REMOVED, config);
  }

  /**
   * Start a server
   *
   * @param name - Server name
   * @throws Error if server is not registered
   */
  async startServer(name: string): Promise<void> {
    if (!this.servers.has(name)) {
      throw new Error(`Server with name ${name} not registered`);
    }

    // Skip if server is already running
    if (this.transports.has(name)) {
      logger.info(`Server ${name} is already running`);
      return;
    }

    logger.info(`Starting server ${name}`);

    const config = this.servers.get(name)!;
    const transport = this.transportFactory.createTransport(config);

    transport.onmessage = (message: JSONRPCMessage) => {
      logger.debug(`Received message from ${name}:`, message);

      // Handle responses to pending requests
      if ('id' in message && message.id) {
        const pendingResponse = this.pendingResponses.get(message.id as string);
        if (pendingResponse) {
          const { resolve, reject, timeoutId } = pendingResponse;
          this.pendingResponses.delete(message.id as string);
          clearTimeout(timeoutId);

          if ('error' in message) {
            reject(new Error(message.error.message));
          } else if ('result' in message) {
            resolve(message.result);
          }
          return;
        }
      }

      this.emit(RegistryEvent.SERVER_MESSAGE, { server: name, message });
    };

    transport.onerror = (error: Error) => {
      logger.error(`Error from ${name}:`, error);
      this.emit(RegistryEvent.SERVER_ERROR, { server: name, error });
    };

    transport.onclose = () => {
      logger.info(`Server ${name} closed`);
      this.transports.delete(name);

      // Reject all pending responses for this server
      for (const [id, { reject, timeoutId }] of this.pendingResponses.entries()) {
        clearTimeout(timeoutId);
        reject(new Error(`Server ${name} closed connection`));
        this.pendingResponses.delete(id);
      }

      this.emit(RegistryEvent.SERVER_STOPPED, name);
    };

    await transport.start();
    this.transports.set(name, transport);

    // Optional check: Send a get_capabilities request to verify the connection
    // This is a non-critical check and servers aren't required to implement get_capabilities
    try {
      await this.sendMessage(
        name,
        {
          jsonrpc: '2.0',
          id: crypto.randomUUID(),
          method: 'get_capabilities',
          params: {},
        },
        3000
      );
      logger.info(`Server ${name} ready and responding to messages`);
    } catch (error) {
      // This is a non-critical check - just informing that the server might not implement all expected methods
      logger.info(
        `Server ${name} started, but didn't respond to capabilities check. This is normal for simple servers.`
      );
      // Continue despite error - connection is still usable
    }

    this.emit(RegistryEvent.SERVER_STARTED, name);
  }

  /**
   * Start all registered servers
   */
  async startAllServers(): Promise<void> {
    logger.info('Starting all servers');
    for (const name of this.servers.keys()) {
      await this.startServer(name);
    }
  }

  /**
   * Stop a server
   *
   * @param name - Server name
   * @throws Error if server is not registered
   */
  async stopServer(name: string): Promise<void> {
    if (!this.servers.has(name)) {
      throw new Error(`Server with name ${name} not registered`);
    }

    logger.info(`Stopping server ${name}`);

    const transport = this.transports.get(name);
    if (transport) {
      await transport.close();
      this.transports.delete(name);
    }

    this.emit(RegistryEvent.SERVER_STOPPED, name);
  }

  /**
   * Stop all registered servers
   */
  async stopAllServers(): Promise<void> {
    logger.info('Stopping all servers');
    for (const name of this.servers.keys()) {
      await this.stopServer(name);
    }
  }

  /**
   * Send a generic message to a server
   *
   * @param name - Server name
   * @param message - Message to send
   * @param timeout - Timeout in milliseconds
   * @returns Response from server (unknown type)
   * @throws Error if server is not registered or not running
   */
  async sendMessage(name: string, message: JSONRPCMessage, timeout?: number): Promise<unknown>

  /**
   * Send a typed method request to a server
   * 
   * @param name - Server name
   * @param message - Message with a method that has a known result type
   * @param timeout - Timeout in milliseconds
   * @returns Response with proper typing based on the method
   * @throws Error if server is not registered or not running
   */
  async sendMessage<M extends keyof MethodResults>(
    name: string, 
    message: JSONRPCRequest & { method: M; params: MethodParams[M] },
    timeout?: number
  ): Promise<MethodResults[M]>
  
  /**
   * Implementation of sendMessage that handles both typed and untyped requests
   */
  async sendMessage(name: string, message: JSONRPCMessage, timeout: number = 5000): Promise<unknown> {
    const transport = this.transports.get(name);
    if (!transport) {
      throw new Error(`Server ${name} not running`);
    }

    // Ensure message has required JSON-RPC fields
    if (!message.jsonrpc) {
      message.jsonrpc = '2.0';
    }

    // Ensure message has an ID for request-response tracking
    if (!('id' in message)) {
      message = { ...message, id: crypto.randomUUID() };
    }

    const messageId = 'id' in message ? (message.id as string) : crypto.randomUUID();

    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeoutId = setTimeout(() => {
        this.pendingResponses.delete(messageId);
        reject(new Error(`Timeout waiting for response from ${name} after ${timeout}ms`));
      }, timeout);

      // Store the pending response
      this.pendingResponses.set(messageId, { resolve, reject, timeoutId });

      // Send the message
      transport.send(message).catch(error => {
        clearTimeout(timeoutId);
        this.pendingResponses.delete(messageId);
        reject(error);
      });
    });
  }

  /**
   * Get a server's transport
   *
   * @param name - Server name
   * @returns Transport instance
   * @throws Error if server is not registered
   */
  getTransport(name: string): SdkTransport | undefined {
    if (!this.servers.has(name)) {
      throw new Error(`Server with name ${name} not registered`);
    }
    return this.transports.get(name);
  }

  /**
   * Get a server's configuration
   *
   * @param name - Server name
   * @returns Server configuration
   * @throws Error if server is not registered
   */
  getServer(name: string): McpServerConfig | undefined {
    return this.servers.get(name);
  }

  /**
   * Get all registered servers
   *
   * @returns Map of server names to configurations
   */
  getServers(): Map<string, McpServerConfig> {
    return this.servers;
  }

  /**
   * Check if a server is running
   *
   * @param name - Server name
   * @returns True if server is running
   */
  isServerRunning(name: string): boolean {
    return this.transports.has(name);
  }

  /**
   * Get the number of registered servers
   *
   * @returns Number of registered servers
   */
  getServerCount(): number {
    return this.servers.size;
  }

  /**
   * Get the number of running servers
   *
   * @returns Number of running servers
   */
  getRunningServerCount(): number {
    return this.transports.size;
  }
}
