import { McpServer as SdkMcpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Transport as SdkTransport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { serializeMessage, deserializeMessage } from '@modelcontextprotocol/sdk/shared/stdio.js';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { EventEmitter } from 'node:events';
import { ResourceRegistry, RegistryEvent as ResourceRegistryEvent } from './resource-registry.js';
import { ResourceConflictConfig, ResourceConflictStrategy, ClientId } from './types.js';
import { MessageRouter } from './message-router.js';
import { ResourceDiscoveryManager } from '../resource-discovery.js';
import { ServerCapabilities } from '../capabilities/server-capabilities.js';
import { ServerRegistry, RegistryEvent } from '../registry/server-registry.js';
import { createContextLogger } from '../../utils/logger.js';
import { Response } from 'express';

const logger = createContextLogger('McpServer');

/**
 * MCP server events
 */
export enum McpServerEvent {
  /** Server started */
  SERVER_STARTED = 'server-started',
  /** Server stopped */
  SERVER_STOPPED = 'server-stopped',
  /** Client connected */
  CLIENT_CONNECTED = 'client-connected',
  /** Client disconnected */
  CLIENT_DISCONNECTED = 'client-disconnected',
  /** Message received from client */
  MESSAGE = 'message',
  /** Error occurred */
  ERROR = 'error',
}

/**
 * Implementation of the MCP server interface for Atrax
 *
 * Aggregates resources, tools, and prompts from configured MCP servers
 * and presents them as a single unified interface.
 *
 * IMPORTANT SECURITY NOTE:
 * This server should only be used internally by Atrax. It should NOT
 * be exposed directly via stdio to external clients for security reasons.
 * Always use the HTTP server interface to expose MCP functionality.
 */
export class McpServer extends EventEmitter {
  private server: SdkMcpServer;
  private resourceRegistry: ResourceRegistry;
  private serverRegistry: ServerRegistry;
  private messageRouter: MessageRouter;
  private discoveryManager: ResourceDiscoveryManager;
  private serverCapabilities: ServerCapabilities;
  private transportConnections: Map<ClientId, SdkTransport> = new Map();
  private running: boolean = false;
  private transport: StdioServerTransport | null = null;

  /**
   * Create a new MCP server
   *
   * @param name - Server name
   * @param version - Server version
   * @param serverRegistry - Server registry
   * @param conflictConfig - Resource conflict configuration
   */
  constructor(
    name: string,
    version: string,
    serverRegistry: ServerRegistry,
    conflictConfig?: ResourceConflictConfig
  ) {
    super();

    this.serverRegistry = serverRegistry;

    // Create resource registry with conflict configuration
    this.resourceRegistry = new ResourceRegistry(
      conflictConfig || {
        strategy: ResourceConflictStrategy.FIRST_WINS,
      }
    );

    // Create server capabilities tracker
    this.serverCapabilities = new ServerCapabilities(this.serverRegistry);

    // Create message router with server capabilities
    this.messageRouter = new MessageRouter(
      this.resourceRegistry,
      this.serverRegistry,
      this.serverCapabilities
    );

    // Create discovery manager with capabilities tracking
    this.discoveryManager = new ResourceDiscoveryManager(
      this.resourceRegistry,
      this.serverRegistry,
      this.serverCapabilities
    );

    // Create MCP server
    this.server = new SdkMcpServer({
      name,
      version,
    });

    // Set up event handlers for the server registry
    this.setupServerRegistryHandlers();

    // Set up resource handlers
    this.setupResourceHandlers();

    // Set up tool handlers
    this.setupToolHandlers();

    // Set up prompt handlers
    this.setupPromptHandlers();
  }

  /**
   * Set up event handlers for the server registry
   */
  private setupServerRegistryHandlers(): void {
    // When a server is added to the registry
    this.serverRegistry.on(RegistryEvent.SERVER_ADDED, async config => {
      logger.info(`Server ${config.name} added to registry`);
      // No action needed, resources will be discovered when server is started
    });

    // When a server is removed from the registry
    this.serverRegistry.on(RegistryEvent.SERVER_REMOVED, async config => {
      logger.info(`Server ${config.name} removed from registry`);

      // Remove server resources, tools, and prompts from the registry
      this.resourceRegistry.removeServerResources(config.name);
      this.resourceRegistry.removeServerTools(config.name);
      this.resourceRegistry.removeServerPrompts(config.name);
    });

    // When a server is started
    this.serverRegistry.on(RegistryEvent.SERVER_STARTED, async serverName => {
      logger.info(`Server ${serverName} started`);

      try {
        // Discover resources, tools, and prompts from the server
        await this.discoverServerResources(serverName);
      } catch (error) {
        logger.error(`Failed to discover resources from server ${serverName}:`, error);
      }
    });

    // When a server is stopped
    this.serverRegistry.on(RegistryEvent.SERVER_STOPPED, async serverName => {
      logger.info(`Server ${serverName} stopped`);

      // Remove server resources, tools, and prompts from the registry
      this.resourceRegistry.removeServerResources(serverName);
      this.resourceRegistry.removeServerTools(serverName);
      this.resourceRegistry.removeServerPrompts(serverName);
    });

    // When a message is received from a server
    this.serverRegistry.on(RegistryEvent.SERVER_MESSAGE, async ({ server, message }) => {
      logger.debug(`Message from server ${server}:`, message);

      // Handle resource, tool, and prompt updates
      // TODO: Implement handling of list_changed notifications for resources, tools, and prompts
    });

    // When an error occurs on a server
    this.serverRegistry.on(RegistryEvent.SERVER_ERROR, async ({ server, error }) => {
      logger.error(`Error from server ${server}:`, error);

      // Emit error event
      this.emit(McpServerEvent.ERROR, { server, error });
    });
  }

  /**
   * Discover resources, tools, and prompts from a server
   *
   * @param serverName - Server name
   */
  private async discoverServerResources(serverName: string): Promise<void> {
    try {
      // Let the discovery manager handle capability-aware discovery
      await this.discoveryManager.discoverServerResources(serverName);

      // For debugging, log all discovered capabilities
      logger.debug(`Capability discovery completed for server ${serverName}`);
      this.serverCapabilities.logAllCapabilities();
    } catch (error) {
      logger.error(`Failed to discover resources from server ${serverName}:`, error);
      throw error;
    }
  }

  /**
   * Set up resource handlers
   */
  private setupResourceHandlers(): void {
    logger.info('Setting up resource handlers');
    // We need to register a catch-all handler for all resources
    // This will match any resource URI pattern and forward the request
    // to the appropriate server
    this.server.resource(
      'all-resources',
      '*', // Match any URI pattern
      async uri => {
        try {
          logger.info(`Resource request received for URI: ${uri.href}`);
          // Get the server for the resource
          const serverName = this.resourceRegistry.getResourceServer(uri.href);

          if (!serverName) {
            logger.warn(`Server not found for resource: ${uri.href}`);
            return { contents: [] };
          }

          // Forward the request to the server using the message router
          const result = await this.messageRouter.forwardResourceRequest(uri.href, { uri });
          logger.debug(`Result for resource ${uri.href}:`, result);
          return result;
        } catch (error) {
          logger.error(`Error handling resource request for ${uri.href}:`, error);
          return { contents: [] };
        }
      }
    );
    logger.info('Resource handlers set up');
  }

  /**
   * Set up tool handlers
   */
  private setupToolHandlers(): void {
    // Tools are registered dynamically as they are discovered from servers
    // We will implement this as we discover tools from servers

    // For each tool in the registry, create a handler that forwards requests to the right server
    for (const [toolName, tool] of this.resourceRegistry.getTools()) {
      this.registerToolHandler(toolName, tool.inputSchema || {});
    }

    // Listen for new tools being added to the registry
    this.resourceRegistry.on(ResourceRegistryEvent.TOOL_ADDED, tool => {
      this.registerToolHandler(tool.name, tool.inputSchema || {});
    });
  }

  /**
   * Register a tool handler for forwarding requests
   *
   * @param toolName - Tool name
   * @param inputSchema - Tool input schema
   */
  private registerToolHandler(toolName: string, inputSchema: Record<string, any>): void {
    // Create a dynamic schema from the input schema
    // This is a simplified version - in a real implementation we would
    // convert the JSON Schema to Zod schema
    const schema = {};

    this.server.tool(toolName, schema, async params => {
      try {
        // Forward the request to the server using the message router
        return await this.messageRouter.forwardToolRequest(toolName, { params });
      } catch (error) {
        logger.error(`Error handling tool request for ${toolName}:`, error);
        throw error;
      }
    });

    logger.debug(`Registered tool handler for ${toolName}`);
  }

  /**
   * Set up prompt handlers
   */
  private setupPromptHandlers(): void {
    // Prompts are registered dynamically as they are discovered from servers
    // We will implement this as we discover prompts from servers

    // For each prompt in the registry, create a handler that forwards requests to the right server
    for (const [promptName, prompt] of this.resourceRegistry.getPrompts()) {
      this.registerPromptHandler(promptName, prompt.inputSchema || {});
    }

    // Listen for new prompts being added to the registry
    this.resourceRegistry.on(ResourceRegistryEvent.PROMPT_ADDED, prompt => {
      this.registerPromptHandler(prompt.name, prompt.inputSchema || {});
    });
  }

  /**
   * Register a prompt handler for forwarding requests
   *
   * @param promptName - Prompt name
   * @param inputSchema - Prompt input schema
   */
  private registerPromptHandler(promptName: string, inputSchema: Record<string, any>): void {
    // Create a dynamic schema from the input schema
    // This is a simplified version - in a real implementation we would
    // convert the JSON Schema to Zod schema
    const schema = z.object({}); // Empty schema to avoid type errors

    this.server.prompt(
      promptName,
      'Prompt description', // Use a string description instead of a schema
      async extra => {
        try {
          // This can be async now
          const promptTemplate = {
            /* TODO: Get prompt template */
          };
          return {
            messages: [],
            description: `Prompt template for ${promptName}`,
          };
        } catch (error) {
          logger.error(`Error handling prompt request for ${promptName}:`, error);
          throw error;
        }
      }
    );

    logger.debug(`Registered prompt handler for ${promptName}`);
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    if (this.running) {
      logger.warn('MCP server is already running');
      return;
    }

    logger.info('Starting MCP server');

    // Initialize capabilities for all servers
    await this.serverCapabilities.initialize();

    // Discover resources from all running servers
    await this.discoverAllResources();

    this.running = true;
    this.emit(McpServerEvent.SERVER_STARTED);
  }

  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    if (!this.running) {
      logger.warn('MCP server is not running');
      return;
    }

    logger.info('Stopping MCP server');

    // Close all transport connections
    for (const [clientId, transport] of this.transportConnections.entries()) {
      try {
        await transport.close();
        logger.debug(`Closed transport for client ${clientId}`);
      } catch (error) {
        logger.error(`Error closing transport for client ${clientId}:`, error);
      }
    }

    this.transportConnections.clear();

    this.running = false;
    this.emit(McpServerEvent.SERVER_STOPPED);
  }

  /**
   * Discover resources from all running servers
   */
  private async discoverAllResources(): Promise<void> {
    logger.info('Discovering resources from all running servers');

    try {
      await this.discoveryManager.discoverAllResources();
    } catch (error) {
      logger.error('Failed to discover resources from all servers:', error);
    }
  }

  /**
   * Connect to a transport
   *
   * @param transport - Transport to connect to
   * @param clientId - Client identifier
   */
  async connect(transport: SdkTransport, clientId: ClientId): Promise<void> {
    if (!this.running) {
      throw new Error('MCP server is not running');
    }

    logger.info(`Connecting to transport for client ${clientId}`);

    // Store the transport
    this.transportConnections.set(clientId, transport);

    // Connect the server to the transport
    await this.server.connect(transport);

    this.emit(McpServerEvent.CLIENT_CONNECTED, clientId);
  }

  /**
   * Connect to a stdio transport
   *
   * SECURITY WARNING: This method should only be used for testing or development.
   * Do not use this in production environments as it exposes the server directly
   * via stdio, which can be a security risk. Instead, use the HTTP-based interface
   * provided by AtraxServer.
   */
  async connectStdio(): Promise<void> {
    if (this.transport) {
      logger.info('Transport already exists, skipping stdio connection');
      return;
    }

    logger.info('Connecting to stdio as an MCP server');

    try {
      // Create the SDK's stdio transport
      const transport = new StdioServerTransport();

      // Set up error handling
      transport.onerror = (error: Error) => {
        logger.error('Error from stdio transport:', {
          error,
          errorMessage: error.message,
          stack: error.stack,
        });
      };

      // Set up message handling
      transport.onmessage = (message: JSONRPCMessage) => {
        logger.debug('Received message from stdio:', {
          message,
          type: typeof message,
          keys: Object.keys(message),
        });

        // Validate message structure
        if (!message || typeof message !== 'object') {
          logger.error('Invalid message received:', {
            message,
            type: typeof message,
          });
          return;
        }

        // Ensure it's a valid JSON-RPC message
        if (!('jsonrpc' in message) || message.jsonrpc !== '2.0') {
          logger.error('Invalid JSON-RPC message:', {
            message,
            hasJsonrpc: 'jsonrpc' in message,
            jsonrpc: message.jsonrpc,
          });
          return;
        }

        // Emit the message event
        this.emit(McpServerEvent.MESSAGE, message);
      };

      // Set up close handling
      transport.onclose = () => {
        logger.info('Stdio transport closed');
        this.transport = null;
      };

      // Start the transport
      await transport.start();

      // Store the transport
      this.transport = transport;

      logger.info('Successfully connected to stdio transport');
    } catch (error) {
      logger.error('Failed to connect to stdio:', {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Connect to an SSE transport
   *
   * @param path - SSE message path
   * @param res - Express response object
   * @param clientId - Client identifier
   * @returns SSE transport
   */
  async connectSSE(path: string, res: Response, clientId: ClientId): Promise<SSEServerTransport> {
    if (!this.running) {
      throw new Error('MCP server is not running');
    }

    logger.info(`Creating SSE transport for client ${clientId}`);

    // Create SSE transport
    const transport = new SSEServerTransport(path, res);

    // Connect to the transport
    await this.connect(transport, clientId);

    return transport;
  }

  /**
   * Disconnect from a transport
   *
   * @param clientId - Client identifier
   */
  async disconnect(clientId: ClientId): Promise<void> {
    const transport = this.transportConnections.get(clientId);

    if (!transport) {
      logger.warn(`Transport for client ${clientId} not found`);
      return;
    }

    logger.info(`Disconnecting from transport for client ${clientId}`);

    try {
      await transport.close();
      this.transportConnections.delete(clientId);

      this.emit(McpServerEvent.CLIENT_DISCONNECTED, clientId);
    } catch (error) {
      logger.error(`Error disconnecting from transport for client ${clientId}:`, error);
      throw error;
    }
  }

  /**
   * Check if the server is running
   *
   * @returns True if the server is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get the number of connected clients
   *
   * @returns Number of connected clients
   */
  getClientCount(): number {
    return this.transportConnections.size;
  }

  /**
   * Get the resource registry
   *
   * @returns Resource registry
   */
  getResourceRegistry(): ResourceRegistry {
    return this.resourceRegistry;
  }
}
