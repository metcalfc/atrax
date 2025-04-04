import { EventEmitter } from 'node:events';
import { Transport } from '../transport/transport.js';
import { ServerRegistry, RegistryEvent } from '../registry/server-registry.js';
import { createContextLogger } from '../../utils/logger.js';
import {
  JSONRPCMessage,
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCNotification,
  JSONRPCErrorObject,
  McpCapabilities,
  JSONRPCErrorData,
  MethodParams,
} from '../../types/mcp.js';
import {
  createErrorResponse,
  createSuccessResponse,
  executeWithErrorHandling,
  McpError,
  ErrorCode,
  toolNotFoundError,
  promptNotFoundError,
  methodNotFoundError,
  serverUnavailableError,
  toMcpError,
} from '../../utils/errors.js';
import crypto from 'node:crypto';

// Resource/Tool/Prompt types for collection operations
interface CollectionItem {
  _serverName?: string;
  [key: string]: unknown;
}

// Interface for standard list operation responses
interface ListResponse {
  [key: string]: unknown[];
}

const logger = createContextLogger('McpProxy');

/**
 * Gets the list of all running servers
 *
 * @param registry - Server registry
 * @returns Array of server IDs for running servers
 */
function getRunningServers(registry: ServerRegistry): string[] {
  return Array.from(registry.getServers().entries())
    .filter(([_, config]) => registry.isServerRunning(config.name))
    .map(([serverId]) => serverId);
}

/**
 * Utility function to create a JSON-RPC request to a server
 *
 * @param method - Method name
 * @param params - Method parameters
 * @returns JSON-RPC request object
 */
function createServerRequest(method: string, params: Record<string, unknown> = {}): JSONRPCRequest {
  return {
    jsonrpc: '2.0',
    id: crypto.randomUUID(),
    method,
    params,
  };
}

/**
 * Aggregates items (resources, tools, prompts) from all servers
 *
 * @param registry - Server registry
 * @param method - Method to call on servers (e.g., "tools/list")
 * @param collectionKey - Key in the response that contains the items (e.g., "tools")
 * @param params - Method parameters
 * @returns Array of items from all servers with server names
 */
async function aggregateCollection(
  registry: ServerRegistry,
  method: string,
  collectionKey: string,
  params: Record<string, unknown> = {}
): Promise<CollectionItem[]> {
  const allItems: CollectionItem[] = [];
  const runningServers = getRunningServers(registry);

  logger.info(`Requesting ${collectionKey} from servers: ${runningServers.join(', ')}`);

  // Request items from each server
  for (const serverId of runningServers) {
    try {
      const request = createServerRequest(method, params);
      const serverResponse = await registry.sendMessage(serverId, request);

      // Extract items from response with safe type checking
      if (
        serverResponse &&
        typeof serverResponse === 'object' &&
        collectionKey in serverResponse &&
        Array.isArray(serverResponse[collectionKey])
      ) {
        // Add server identifier to each item for routing
        const serverItems = (serverResponse[collectionKey] as Array<Record<string, unknown>>).map(
          item => ({
            ...item,
            _serverName: serverId, // Use underscore to hide from clients
          })
        );

        allItems.push(...serverItems);
        logger.info(`Found ${serverItems.length} ${collectionKey} from server ${serverId}`);
      }
    } catch (error) {
      // Log but continue - we want items from all servers even if some fail
      logger.warn(`Error getting ${collectionKey} from server ${serverId}:`, error);
    }
  }

  return allItems;
}

/**
 * Finds a server that has a specific tool by name
 *
 * @param registry - Server registry
 * @param toolName - Tool name to find
 * @returns Server ID or throws McpError if no server supports the tool
 */
async function findServerForTool(registry: ServerRegistry, toolName: string): Promise<string> {
  const runningServers = getRunningServers(registry);

  if (runningServers.length === 0) {
    throw new McpError(ErrorCode.SERVER_UNAVAILABLE, 'No running servers available', {
      details: 'No servers are running to handle tool requests',
    });
  }

  // Iterate through servers to find one with this tool
  for (const serverId of runningServers) {
    try {
      // Get tools from this server
      const request = createServerRequest('tools/list', {});
      const toolsResponse = await registry.sendMessage(serverId, request);

      // Check if this server has the requested tool
      if (
        toolsResponse &&
        typeof toolsResponse === 'object' &&
        'tools' in toolsResponse &&
        Array.isArray(toolsResponse.tools)
      ) {
        const hasTool = (toolsResponse.tools as Array<Record<string, unknown>>).some(
          tool => tool.name === toolName
        );

        if (hasTool) {
          return serverId;
        }
      }
    } catch (error) {
      // Log but continue checking other servers
      const mcpError = toMcpError(error, ErrorCode.INTERNAL_ERROR);
      mcpError.log('McpProxy', 'warn');
      logger.warn(`Error checking tools for server ${serverId}`);
    }
  }

  // If we get here, no server was found for this tool
  throw toolNotFoundError(toolName);
}

/**
 * Finds a server that has a specific prompt by name
 *
 * @param registry - Server registry
 * @param promptName - Prompt name to find
 * @returns Server ID or throws McpError if no server supports the prompt
 */
async function findServerForPrompt(registry: ServerRegistry, promptName: string): Promise<string> {
  const runningServers = getRunningServers(registry);

  if (runningServers.length === 0) {
    throw new McpError(ErrorCode.SERVER_UNAVAILABLE, 'No running servers available', {
      details: 'No servers are running to handle prompt requests',
    });
  }

  // Try to find the server with this prompt
  for (const serverId of runningServers) {
    try {
      // Get prompts from this server
      const request = createServerRequest('prompts/list', {});
      const promptsResponse = await registry.sendMessage(serverId, request);

      // Check if this server has the requested prompt
      if (
        promptsResponse &&
        typeof promptsResponse === 'object' &&
        'prompts' in promptsResponse &&
        Array.isArray(promptsResponse.prompts)
      ) {
        const hasPrompt = (promptsResponse.prompts as Array<Record<string, unknown>>).some(
          prompt => {
            // Match by name, id or both
            return prompt.name === promptName || prompt.id === promptName;
          }
        );

        if (hasPrompt) {
          return serverId;
        }
      }
    } catch (error) {
      // Log but continue checking other servers
      const mcpError = toMcpError(error, ErrorCode.INTERNAL_ERROR);
      mcpError.log('McpProxy', 'warn');
      logger.warn(`Error checking if server ${serverId} has prompt ${promptName}`);
    }
  }

  // If we get here, no server was found for this prompt
  throw promptNotFoundError(promptName);
}

/**
 * Proxy events
 */
export enum ProxyEvent {
  /** Client connected */
  CLIENT_CONNECTED = 'client-connected',
  /** Client disconnected */
  CLIENT_DISCONNECTED = 'client-disconnected',
  /** Client message received */
  CLIENT_MESSAGE = 'client-message',
  /** Server message received */
  SERVER_MESSAGE = 'server-message',
  /** Error occurred */
  ERROR = 'error',
}

/**
 * Proxy for MCP servers
 *
 * Handles communication between clients and MCP servers
 */
export class McpProxy extends EventEmitter {
  private registry: ServerRegistry;
  private clientTransports: Map<string, Transport> = new Map();
  private methodParamsMap: Record<string, keyof MethodParams> = {
    'resources/list': 'resources/list',
    'resources/read': 'resources/read',
    'tools/list': 'tools/list',
    'tools/call': 'tools/call',
    'prompts/list': 'prompts/list',
    'prompts/get': 'prompts/get',
    get_capabilities: 'get_capabilities',
    initialize: 'initialize',
  };

  /**
   * Create a new MCP proxy
   *
   * @param registry - Server registry
   */
  constructor(registry: ServerRegistry) {
    super();
    this.registry = registry;

    // Set up event listeners for server messages
    this.registry.on(RegistryEvent.SERVER_MESSAGE, ({ server, message }) => {
      logger.debug(`Received message from server ${server}:`, message);
      this.emit(ProxyEvent.SERVER_MESSAGE, { server, message });
    });

    this.registry.on(RegistryEvent.SERVER_ERROR, ({ server, error }) => {
      logger.error(`Error from server ${server}:`, error);
      this.emit(ProxyEvent.ERROR, { server, error });
    });
  }

  /**
   * Add a client transport
   *
   * @param clientId - Client ID
   * @param transport - Transport for the client
   */
  addClientTransport(clientId: string, transport: Transport): void {
    if (this.clientTransports.has(clientId)) {
      throw new McpError(ErrorCode.INVALID_REQUEST, `Client ${clientId} already connected`, {
        details: 'Client ID already exists in the transport registry',
      });
    }

    logger.info(`Adding client transport for ${clientId}`);

    // Set up event handlers
    transport.on('message', (message: JSONRPCMessage) => {
      logger.debug(`Received message from client ${clientId}:`, message);
      this.handleClientMessage(clientId, message);
    });

    transport.on('error', (error: Error) => {
      // Convert to McpError if not already
      const mcpError = toMcpError(error, ErrorCode.TRANSPORT_ERROR);
      mcpError.log('McpProxy');
      this.emit(ProxyEvent.ERROR, { clientId, error: mcpError });
    });

    transport.on('close', () => {
      logger.info(`Client ${clientId} disconnected`);
      this.removeClientTransport(clientId);
    });

    this.clientTransports.set(clientId, transport);
    this.emit(ProxyEvent.CLIENT_CONNECTED, clientId);
  }

  /**
   * Remove a client transport
   *
   * @param clientId - Client ID
   */
  removeClientTransport(clientId: string): void {
    logger.info(`Removing client transport for ${clientId}`);
    const transport = this.clientTransports.get(clientId);
    if (transport) {
      transport.removeListener('message', () => {});
      transport.removeListener('error', () => {});
      transport.removeListener('close', () => {});
      this.clientTransports.delete(clientId);
      this.emit(ProxyEvent.CLIENT_DISCONNECTED, clientId);
      logger.info(`Client transport for ${clientId} successfully removed`);
    } else {
      logger.warn(`No transport found for client ${clientId}`);
    }
  }

  /**
   * Handle a direct message without a client session
   *
   * @param message - Message to handle
   * @returns Response message
   */
  async handleDirectMessage(
    message: JSONRPCRequest
  ): Promise<JSONRPCResponse | JSONRPCErrorObject> {
    logger.debug('Handling direct message:', message);

    // Ensure message has an ID (required for JSON-RPC requests)
    const msgId = message.id ?? crypto.randomUUID();

    // Ensure the message has the required fields
    if (!message.jsonrpc || message.jsonrpc !== '2.0') {
      return {
        jsonrpc: '2.0',
        id: msgId,
        error: {
          code: -32600,
          message: 'Invalid request',
          data: {
            details: 'Message does not have valid jsonrpc field set to "2.0"',
          } as JSONRPCErrorData,
        },
      };
    }

    try {
      // Route based on method
      if (!('method' in message) || !message.method) {
        return {
          jsonrpc: '2.0',
          id: msgId,
          error: {
            code: -32600,
            message: 'Method is required',
            data: {
              details: 'Message missing required method field',
            } as JSONRPCErrorData,
          },
        };
      }

      // Handle special methods directly
      if (message.method === 'get_capabilities') {
        const response = await this.handleGetCapabilities(message);

        // Convert null IDs to the generated msgId if needed
        if ('error' in response && response.id === null) {
          response.id = msgId;
        } else if ('result' in response && response.id === null) {
          response.id = msgId;
        }

        return response as JSONRPCResponse;
      }

      // Handle initialize request directly
      if (message.method === 'initialize') {
        const response = await this.handleInitialize(message);

        // Convert null IDs to the generated msgId if needed
        if ('error' in response && response.id === null) {
          response.id = msgId;
        } else if ('result' in response && response.id === null) {
          response.id = msgId;
        }

        return response as JSONRPCResponse;
      }

      // Handle tools/list requests - gather tools from all servers
      if (message.method === 'tools/list') {
        logger.info('Handling tools/list request');

        try {
          // Use the aggregateCollection utility to get tools from all servers
          const allTools = await aggregateCollection(
            this.registry,
            'tools/list',
            'tools',
            (message.params as Record<string, unknown>) || {}
          );

          // Return all discovered tools
          return createSuccessResponse(msgId, { tools: allTools });
        } catch (error) {
          logger.error('Error handling tools/list request:', error);
          return createErrorResponse(
            msgId,
            -32603,
            error instanceof Error ? error.message : 'Unknown error',
            error instanceof Error ? error.stack : 'Unknown error'
          );
        }
      }

      // Handle resources/list - aggregate from all servers
      if (message.method === 'resources/list') {
        logger.info('Handling resources/list request');

        try {
          // Use the aggregateCollection utility to get resources from all servers
          const allResources = await aggregateCollection(
            this.registry,
            'resources/list',
            'resources',
            (message.params as Record<string, unknown>) || {}
          );

          // Create result with optional pagination parameters
          const result = {
            resources: allResources,
            // Pass along nextCursor if it was in the request params
            ...('nextCursor' in (message.params || {})
              ? { nextCursor: message.params?.nextCursor }
              : {}),
          };

          return createSuccessResponse(msgId, result);
        } catch (error) {
          logger.error('Error handling resources/list request:', error);
          return createErrorResponse(
            msgId,
            -32603,
            error instanceof Error ? error.message : 'Unknown error',
            error instanceof Error ? error.stack : 'Unknown error'
          );
        }
      }

      // Handle prompts/list - aggregate from all servers
      if (message.method === 'prompts/list') {
        logger.info('Handling prompts/list request');

        try {
          // Use the aggregateCollection utility to get prompts from all servers
          const allPrompts = await aggregateCollection(
            this.registry,
            'prompts/list',
            'prompts',
            (message.params as Record<string, unknown>) || {}
          );

          // Create result with optional pagination parameters
          const result = {
            prompts: allPrompts,
            // Pass along nextCursor if it was in the request params
            ...('nextCursor' in (message.params || {})
              ? { nextCursor: message.params?.nextCursor }
              : {}),
          };

          return createSuccessResponse(msgId, result);
        } catch (error) {
          logger.error('Error handling prompts/list request:', error);
          return createErrorResponse(
            msgId,
            -32603,
            error instanceof Error ? error.message : 'Unknown error',
            error instanceof Error ? error.stack : 'Unknown error'
          );
        }
      }

      // Route tools/call to the appropriate server
      if (
        message.method === 'tools/call' &&
        message.params &&
        typeof message.params === 'object' &&
        'name' in message.params
      ) {
        // Get the tool name
        const toolName = String(message.params.name);
        logger.info(`Handling tool call for ${toolName}`);

        return await executeWithErrorHandling(
          async () => {
            // Special case for echo tool (always available)
            if (toolName === 'echo') {
              logger.info('Handling echo tool call directly');

              // Extract the message from the arguments with proper type checking
              const args =
                'arguments' in message.params &&
                message.params.arguments &&
                typeof message.params.arguments === 'object'
                  ? message.params.arguments
                  : {};

              const echoMessage = 'message' in args ? String(args.message) : 'No message provided';

              // Return the echo response
              return {
                content: [
                  {
                    type: 'text',
                    text: echoMessage,
                  },
                ],
              };
            }

            try {
              // Find a server that can handle this tool (will throw if not found)
              const serverId = await findServerForTool(this.registry, toolName);

              // Forward the request to the appropriate server
              logger.info(`Forwarding tool ${toolName} to server ${serverId}`);
              const result = await this.registry.sendMessage(serverId, message);

              // Return result
              return result as Record<string, unknown>;
            } catch (error) {
              if (error instanceof McpError && error.code === ErrorCode.TOOL_NOT_FOUND) {
                // Rethrow tool not found errors to be handled by executeWithErrorHandling
                throw error;
              }

              // For other errors, convert and log
              const mcpError = toMcpError(error, ErrorCode.INTERNAL_ERROR);
              mcpError.log('McpProxy');
              throw mcpError;
            }
          },
          msgId,
          'McpProxy'
        );
      }

      // Handle other methods by determining the appropriate server
      const serverId = this.determineServerForMethod(message.method, message.params);

      if (!serverId) {
        return {
          jsonrpc: '2.0',
          id: msgId,
          error: {
            code: -32601,
            message: `Method ${message.method} not supported by any server`,
            data: {
              details: 'No available server found to handle this method',
            } as JSONRPCErrorData,
          },
        };
      }

      // Forward the message to the server
      const response = await this.registry.sendMessage(serverId, message);

      // Ensure response is the correct shape before returning
      const typedResponse = response as Record<string, unknown>;

      return {
        jsonrpc: '2.0',
        id: msgId,
        result: typedResponse,
      };
    } catch (error) {
      logger.error('Error handling direct message:', error);

      return {
        jsonrpc: '2.0',
        id: msgId,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Internal error',
          data: {
            details: error instanceof Error ? error.stack : 'Unknown error',
          } as JSONRPCErrorData,
        },
      };
    }
  }

  /**
   * Handle an initialize request
   *
   * @param message - Request message
   * @returns Response message with server info and capabilities
   */
  private async handleInitialize(
    message: JSONRPCRequest
  ): Promise<JSONRPCResponse | JSONRPCErrorObject> {
    logger.info('Handling initialize request:', message);

    // Ensure message has an ID (required for JSON-RPC requests)
    const msgId = message.id ?? crypto.randomUUID();

    try {
      // Extract requested protocol version with safe type checking
      const protocolVersion =
        message.params && typeof message.params === 'object' && 'protocolVersion' in message.params
          ? String(message.params.protocolVersion)
          : '2024-11-05';

      // Get all running servers to check their capabilities
      const runningServers = Array.from(this.registry.getServers().entries())
        .filter(([_, config]) => this.registry.isServerRunning(config.name))
        .map(([serverId]) => serverId);

      logger.info(`Getting capabilities from servers: ${runningServers.join(', ')}`);

      // Create capabilities object with core features always available
      const capabilities: McpCapabilities = {
        core: {
          get_capabilities: {},
        },
        // Always add tools capabilities since that's what the inspector needs
        tools: {
          list: {},
          call: {},
          list_changed: {},
        },
      };

      // Check for resources and prompts capabilities from all servers
      let hasResources = false;
      let hasPrompts = false;

      // Directly check for capabilities via initialize method
      // This is more reliable than get_capabilities for MCP servers
      for (const serverId of runningServers) {
        try {
          // Try to get server initialize response
          const serverResponse = await this.registry.sendMessage(serverId, {
            jsonrpc: '2.0',
            id: crypto.randomUUID(),
            method: 'initialize',
            params: {
              protocolVersion,
              capabilities: message.params?.capabilities || {},
              clientInfo: message.params?.clientInfo || { name: 'atrax-proxy', version: '0.1.0' },
            },
          });

          // Check if server supports resources
          if (
            serverResponse &&
            typeof serverResponse === 'object' &&
            'capabilities' in serverResponse &&
            typeof serverResponse.capabilities === 'object'
          ) {
            const serverCapabilities = serverResponse.capabilities as Record<string, unknown>;

            // Check for resources capability
            if (serverCapabilities && 'resources' in serverCapabilities) {
              hasResources = true;
              logger.info(`Server ${serverId} supports resources`);
            }

            // Check for prompts capability
            if (serverCapabilities && 'prompts' in serverCapabilities) {
              hasPrompts = true;
              logger.info(`Server ${serverId} supports prompts`);
            }
          }
        } catch (error) {
          // Skip errors - server might be in the process of starting
          logger.warn(`Error checking capabilities for server ${serverId}:`, error);
        }
      }

      // Add resources capability if any server supports it
      if (hasResources) {
        capabilities.resources = {
          list: {},
          read: {},
          list_changed: {},
        };
        logger.info('Adding resources capability to proxy response');
      }

      // Add prompts capability if any server supports it
      if (hasPrompts) {
        capabilities.prompts = {
          list: {},
          get: {},
          list_changed: {},
        };
        logger.info('Adding prompts capability to proxy response');
      }

      // Create the initialize response
      logger.info(`Sending initialize response with protocol version ${protocolVersion}`);
      return {
        jsonrpc: '2.0',
        id: msgId,
        result: {
          protocolVersion,
          serverInfo: {
            name: 'atrax',
            version: '0.1.0',
          },
          capabilities,
        },
      };
    } catch (error) {
      logger.error('Error handling initialize request:', error);
      return {
        jsonrpc: '2.0',
        id: msgId,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Internal error',
          data: {
            details: error instanceof Error ? error.stack : 'Unknown error',
          } as JSONRPCErrorData,
        },
      };
    }
  }

  /**
   * Handle a get_capabilities request
   *
   * @param message - Request message
   * @returns Response message with aggregated capabilities
   */
  private async handleGetCapabilities(
    message: JSONRPCRequest
  ): Promise<JSONRPCResponse | JSONRPCErrorObject> {
    // Ensure message has an ID (required for JSON-RPC requests)
    const msgId = message.id ?? crypto.randomUUID();

    // Aggregate capabilities from all servers
    const capabilities: McpCapabilities = {
      core: {
        get_capabilities: {},
      },
    };

    // Add capabilities for resources, tools, and prompts if any server supports them
    let hasResources = false;
    let hasTools = false;
    let hasPrompts = false;

    // Get all running servers
    const runningServers = Array.from(this.registry.getServers().entries())
      .filter(([_, config]) => this.registry.isServerRunning(config.name))
      .map(([serverId]) => serverId);

    logger.info(`Getting capabilities from servers: ${runningServers.join(', ')}`);

    // First try to use initialize to check capabilities (more reliable)
    for (const serverId of runningServers) {
      try {
        // Try to get server initialize response
        const serverResponse = await this.registry.sendMessage(serverId, {
          jsonrpc: '2.0',
          id: crypto.randomUUID(),
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'atrax-proxy', version: '0.1.0' },
          },
        });

        // Check if server supports various capabilities
        if (
          serverResponse &&
          typeof serverResponse === 'object' &&
          'capabilities' in serverResponse &&
          typeof serverResponse.capabilities === 'object'
        ) {
          const serverCapabilities = serverResponse.capabilities as Record<string, unknown>;

          // Check for resources capability
          if (serverCapabilities && 'resources' in serverCapabilities) {
            hasResources = true;
            logger.info(`Server ${serverId} supports resources (via initialize)`);
          }

          // Check for tools capability
          if (serverCapabilities && 'tools' in serverCapabilities) {
            hasTools = true;
            logger.info(`Server ${serverId} supports tools (via initialize)`);
          }

          // Check for prompts capability
          if (serverCapabilities && 'prompts' in serverCapabilities) {
            hasPrompts = true;
            logger.info(`Server ${serverId} supports prompts (via initialize)`);
          }
        }
      } catch (error) {
        // Skip errors - try get_capabilities as fallback
        logger.debug(`Server ${serverId} initialize check failed, trying get_capabilities:`, error);

        // Try get_capabilities as fallback
        try {
          const serverResponse = await this.registry.sendMessage(serverId, {
            jsonrpc: '2.0',
            id: crypto.randomUUID(),
            method: 'get_capabilities',
            params: {},
          });

          // Extract capabilities with proper type checking
          const serverCaps =
            serverResponse && typeof serverResponse === 'object' && 'capabilities' in serverResponse
              ? serverResponse
              : { capabilities: undefined };

          // Check if response has capabilities
          if (serverCaps?.capabilities && typeof serverCaps.capabilities === 'object') {
            // Check for resources
            if ('resources' in serverCaps.capabilities) {
              hasResources = true;
              logger.info(`Server ${serverId} supports resources (via get_capabilities)`);
            }

            // Check for tools
            if ('tools' in serverCaps.capabilities) {
              hasTools = true;
              logger.info(`Server ${serverId} supports tools (via get_capabilities)`);
            }

            // Check for prompts
            if ('prompts' in serverCaps.capabilities) {
              hasPrompts = true;
              logger.info(`Server ${serverId} supports prompts (via get_capabilities)`);
            }
          }
        } catch (capError) {
          // Skip errors - server might not support get_capabilities
          logger.debug(`Server ${serverId} does not support get_capabilities:`, capError);
        }
      }
    }

    // Always include tools for the Inspector
    capabilities.tools = {
      list: {},
      call: {},
      list_changed: {},
    };

    // Add other capabilities that are supported by at least one server
    if (hasResources) {
      capabilities.resources = {
        list: {},
        read: {},
        list_changed: {},
      };
      logger.info('Adding resources capability to get_capabilities response');
    }

    if (hasPrompts) {
      capabilities.prompts = {
        list: {},
        get: {},
        list_changed: {},
      };
      logger.info('Adding prompts capability to get_capabilities response');
    }

    return {
      jsonrpc: '2.0',
      id: msgId,
      result: { capabilities },
    };
  }

  /**
   * Determine which server should handle a method
   * This is a simplified implementation that would need to be expanded
   * based on the specific method and parameters
   *
   * @param method - Method to handle
   * @param params - Method parameters
   * @returns Server ID or undefined if no server can handle the method
   */
  private determineServerForMethod(method: string, params?: unknown): string | undefined {
    // Convert to a properly typed method if possible
    if (this.isKnownMethod(method)) {
      return this.determineServerForTypedMethod(method, params as MethodParams[typeof method]);
    }
    // Otherwise, treat as a generic method
    return this.determineServerForGenericMethod(method, params as Record<string, unknown>);
  }

  /**
   * Check if a method is one of our known MCP methods with proper typing
   *
   * @param method - Method to check
   */
  private isKnownMethod(method: string): method is keyof MethodParams {
    return Object.keys(this.methodParamsMap).includes(method);
  }

  /**
   * Determine which server should handle a method with proper typing
   *
   * @param method - Typed method name
   * @param params - Method parameters with proper type
   */
  private determineServerForTypedMethod<M extends keyof MethodParams>(
    method: M,
    params?: MethodParams[M]
  ): string | undefined {
    // For now, just pick the first running server
    // In a real implementation, this would be more sophisticated based on the method and parameters
    for (const [serverId] of this.registry.getServers()) {
      if (this.registry.isServerRunning(serverId)) {
        return serverId;
      }
    }

    return undefined;
  }

  /**
   * Determine which server should handle a method that's not in our type definitions
   *
   * @param method - Method name
   * @param params - Method parameters
   */
  private determineServerForGenericMethod(
    method: string,
    params?: Record<string, unknown>
  ): string | undefined {
    // Use the same logic as typed methods for now
    // This allows for extension methods not in our type definitions
    for (const [serverId] of this.registry.getServers()) {
      if (this.registry.isServerRunning(serverId)) {
        return serverId;
      }
    }

    return undefined;
  }

  /**
   * Handle a message from a client
   *
   * @param clientId - Client ID
   * @param message - Message to handle
   */
  private async handleClientMessage(clientId: string, message: JSONRPCMessage): Promise<void> {
    try {
      // Log all client messages for debugging
      logger.info(`Client message from ${clientId}:`, message);

      this.emit(ProxyEvent.CLIENT_MESSAGE, { clientId, message });

      // Handle messages with methods (requests)
      if ('method' in message) {
        const request = message as JSONRPCRequest;

        // Ensure message has an ID (required for JSON-RPC requests)
        const msgId = request.id ?? crypto.randomUUID();

        // Handle special methods directly
        if (request.method === 'tools/list') {
          logger.info(`Handling tools/list request from client ${clientId}`);

          try {
            // Use the aggregateCollection utility to get tools from all servers
            const allTools = await aggregateCollection(
              this.registry,
              'tools/list',
              'tools',
              (request.params as Record<string, unknown>) || {}
            );

            // Always add the echo tool (built-in)
            allTools.push({
              name: 'echo',
              description: 'Echoes back the input text',
              inputSchema: {
                type: 'object',
                properties: {
                  message: {
                    type: 'string',
                    description: 'The message to echo back',
                  },
                },
                required: ['message'],
              },
              _serverName: 'atrax',
            });

            logger.info(`Responding with ${allTools.length} tools for client ${clientId}`);

            // Remove server info before sending to client
            const responseTools = allTools.map(({ _serverName, ...tool }) => tool);

            // Create success response with the tools
            const response = createSuccessResponse(msgId, { tools: responseTools });
            await this.sendMessage(clientId, response);
          } catch (error) {
            logger.error(`Error handling tools/list request from client ${clientId}:`, error);
            const errorResponse = createErrorResponse(
              msgId,
              -32603,
              error instanceof Error ? error.message : 'Unknown error',
              error instanceof Error ? error.stack : 'Unknown error'
            );
            await this.sendMessage(clientId, errorResponse);
          }
          return;
        }

        // Handle resources/list like tools/list - aggregate resources from all servers
        if (request.method === 'resources/list') {
          logger.info(`Handling resources/list request from client ${clientId}`);

          try {
            // Use the aggregateCollection utility to get resources from all servers
            const allResources = await aggregateCollection(
              this.registry,
              'resources/list',
              'resources',
              (request.params as Record<string, unknown>) || {}
            );

            logger.info(`Responding with ${allResources.length} resources for client ${clientId}`);

            // Remove server info before sending to client
            const responseResources = allResources.map(({ _serverName, ...resource }) => resource);

            // Create result with optional pagination parameters
            const result = {
              resources: responseResources,
              // Pass along nextCursor if it was in the request params
              ...('nextCursor' in (request.params || {})
                ? { nextCursor: request.params?.nextCursor }
                : {}),
            };

            // Create success response with the resources
            const response = createSuccessResponse(msgId, result);
            await this.sendMessage(clientId, response);
          } catch (error) {
            logger.error(`Error handling resources/list request from client ${clientId}:`, error);
            const errorResponse = createErrorResponse(
              msgId,
              -32603,
              error instanceof Error ? error.message : 'Unknown error',
              error instanceof Error ? error.stack : 'Unknown error'
            );
            await this.sendMessage(clientId, errorResponse);
          }
          return;
        }

        // Handle prompts/list like tools/list - aggregate prompts from all servers
        if (request.method === 'prompts/list') {
          logger.info(`Handling prompts/list request from client ${clientId}`);

          try {
            // Use the aggregateCollection utility to get prompts from all servers
            const allPrompts = await aggregateCollection(
              this.registry,
              'prompts/list',
              'prompts',
              (request.params as Record<string, unknown>) || {}
            );

            logger.info(`Responding with ${allPrompts.length} prompts for client ${clientId}`);

            // Remove server info before sending to client
            const responsePrompts = allPrompts.map(({ _serverName, ...prompt }) => prompt);

            // Create result with optional pagination parameters
            const result = {
              prompts: responsePrompts,
              // Pass along nextCursor if it was in the request params
              ...('nextCursor' in (request.params || {})
                ? { nextCursor: request.params?.nextCursor }
                : {}),
            };

            // Create success response with the prompts
            const response = createSuccessResponse(msgId, result);
            await this.sendMessage(clientId, response);
          } catch (error) {
            logger.error(`Error handling prompts/list request from client ${clientId}:`, error);
            const errorResponse = createErrorResponse(
              msgId,
              -32603,
              error instanceof Error ? error.message : 'Unknown error',
              error instanceof Error ? error.stack : 'Unknown error'
            );
            await this.sendMessage(clientId, errorResponse);
          }
          return;
        }

        // Handle prompts/get - route to appropriate server based on prompt name
        if (
          request.method === 'prompts/get' &&
          request.params &&
          typeof request.params === 'object' &&
          'name' in request.params
        ) {
          const promptName = String(request.params.name);
          logger.info(
            `Handling prompts/get request from client ${clientId} for prompt ${promptName}`
          );

          try {
            // Find a server that has this prompt
            const targetServer = await findServerForPrompt(this.registry, promptName);

            // If we found a server, forward the request
            if (targetServer) {
              logger.info(`Forwarding prompt ${promptName} request to server ${targetServer}`);
              const result = await this.registry.sendMessage(targetServer, request);

              // Process result to ensure it follows the MCP protocol format
              let processedResult = result;

              // Convert from {prompt: {template: "..."}} format to {messages: [{role: "assistant", ...}]} format if needed
              if (result && typeof result === 'object' && 'prompt' in result) {
                const prompt = result.prompt as Record<string, unknown>;
                if (prompt && typeof prompt === 'object' && 'template' in prompt) {
                  const template = prompt.template as string;
                  const description = prompt.description as string | undefined;

                  // Transform to the format expected by clients
                  processedResult = {
                    description: description,
                    messages: [
                      {
                        role: 'assistant',
                        content: {
                          type: 'text',
                          text: template,
                        },
                      },
                    ],
                  };
                  logger.info(
                    `Transformed prompt response for ${promptName} to MCP-compliant format`
                  );
                }
              }

              // Create successful response with the processed result
              const response = createSuccessResponse(
                msgId,
                processedResult as Record<string, unknown>
              );
              await this.sendMessage(clientId, response);
              return;
            }

            // If no server was found for this prompt
            logger.warn(`No server found to handle prompt ${promptName}`);
            const errorResponse = createErrorResponse(
              msgId,
              -32601,
              `Prompt ${promptName} not found on any server`,
              'No server found that can handle this prompt'
            );

            await this.sendMessage(clientId, errorResponse);
          } catch (error) {
            logger.error(`Error handling prompts/get request for ${promptName}:`, error);
            const errorResponse = createErrorResponse(
              msgId,
              -32603,
              error instanceof Error ? error.message : 'Unknown error',
              error instanceof Error ? error.stack : 'Unknown error'
            );

            await this.sendMessage(clientId, errorResponse);
          }
          return;
        }

        // Handle tools/call - route to appropriate server
        if (
          request.method === 'tools/call' &&
          request.params &&
          typeof request.params === 'object' &&
          'name' in request.params
        ) {
          const toolName = String(request.params.name);
          logger.info(`Handling tool call from client ${clientId} for tool ${toolName}`);

          try {
            // Special case for the built-in echo tool
            if (toolName === 'echo') {
              // Extract the message from the arguments with proper type checking
              const args =
                'arguments' in request.params &&
                request.params.arguments &&
                typeof request.params.arguments === 'object'
                  ? request.params.arguments
                  : {};

              const echoMessage = 'message' in args ? String(args.message) : 'No message provided';

              // Create success response for echo tool
              const response = createSuccessResponse(msgId, {
                content: [
                  {
                    type: 'text',
                    text: echoMessage,
                  },
                ],
              });

              await this.sendMessage(clientId, response);
              return;
            }

            // Find a server that can handle this tool
            const targetServer = await findServerForTool(this.registry, toolName);

            // If we found a server, forward the request
            if (targetServer) {
              logger.info(`Forwarding tool ${toolName} call to server ${targetServer}`);
              const result = await this.registry.sendMessage(targetServer, request);

              // Create success response with the result
              const response = createSuccessResponse(msgId, result as Record<string, unknown>);
              await this.sendMessage(clientId, response);
              return;
            }

            // If no server was found for this tool
            logger.warn(`No server found to handle tool ${toolName}`);
            const errorResponse = createErrorResponse(
              msgId,
              -32601,
              `Tool ${toolName} not found on any server`,
              'No server found that can handle this tool'
            );

            await this.sendMessage(clientId, errorResponse);
          } catch (error) {
            logger.error(`Error handling tool call for ${toolName}:`, error);
            const errorResponse = createErrorResponse(
              msgId,
              -32603,
              error instanceof Error ? error.message : 'Unknown error',
              error instanceof Error ? error.stack : 'Unknown error'
            );

            await this.sendMessage(clientId, errorResponse);
          }
          return;
        }

        // Handle initialize requests directly
        if (request.method === 'initialize') {
          logger.info(`Handling initialize request from client ${clientId}`);
          const response = await this.handleInitialize(request);

          // Convert null IDs to the generated msgId
          if ('error' in response && response.id === null) {
            response.id = msgId;
          }

          await this.sendMessage(clientId, response);
          return;
        }

        // Handle get_capabilities requests directly
        if (request.method === 'get_capabilities') {
          logger.info(`Handling get_capabilities request from client ${clientId}`);
          const response = await this.handleGetCapabilities(request);

          // Convert null IDs to the generated msgId
          if ('error' in response && response.id === null) {
            response.id = msgId;
          }

          await this.sendMessage(clientId, response);
          return;
        }

        // For other requests, determine which server should handle it
        const serverId = this.determineServerForMethod(request.method, request.params);

        if (serverId) {
          logger.info(`Forwarding ${request.method} request to server ${serverId}`);
          const result = await this.registry.sendMessage(serverId, request);

          // Send response back to client with proper typing
          const response: JSONRPCResponse = {
            jsonrpc: '2.0',
            id: msgId,
            result: result as Record<string, unknown>,
          };

          await this.sendMessage(clientId, response);
        } else {
          logger.warn(`No server found to handle method ${request.method}`);

          // Send error response
          const errorResponse: JSONRPCErrorObject = {
            jsonrpc: '2.0',
            id: msgId,
            error: {
              code: -32601,
              message: `Method ${request.method} not supported by any server`,
              data: {
                details: 'No available server found to handle this method',
              } as JSONRPCErrorData,
            },
          };

          await this.sendMessage(clientId, errorResponse);
        }
      }
      // Handle other message types if needed (notifications, etc.)
    } catch (error) {
      logger.error(`Error handling client message from ${clientId}:`, error);

      // If it's a request, send an error response
      if ('id' in message) {
        try {
          // Ensure id is never null when sending
          const msgId = message.id ?? crypto.randomUUID();

          // Create error response
          const errorResponse: JSONRPCErrorObject = {
            jsonrpc: '2.0',
            id: msgId,
            error: {
              code: -32603,
              message: error instanceof Error ? error.message : 'Internal error',
              data: {
                details: error instanceof Error ? error.stack : 'Unknown error',
              } as JSONRPCErrorData,
            },
          };

          await this.sendMessage(clientId, errorResponse);
        } catch (sendError) {
          logger.error(`Failed to send error response to client ${clientId}:`, sendError);
        }
      }
    }
  }

  /**
   * Send a message to a client
   *
   * @param clientId - Client ID
   * @param message - Message to send
   */
  async sendMessage(
    clientId: string,
    message: JSONRPCResponse | JSONRPCErrorObject | JSONRPCNotification
  ): Promise<void> {
    const transport = this.clientTransports.get(clientId);
    if (!transport) {
      throw new McpError(ErrorCode.TRANSPORT_ERROR, `Client ${clientId} not connected`, {
        details: 'Unable to send message to client: transport not found',
      });
    }
    // Ensure the id is never null when sending to the client
    if ('error' in message && message.id === null) {
      message.id = crypto.randomUUID();
    } else if ('result' in message && message.id === null) {
      message.id = crypto.randomUUID();
    }

    try {
      await transport.send(message as JSONRPCMessage);
    } catch (error) {
      // Convert to McpError and rethrow
      const mcpError = toMcpError(error, ErrorCode.TRANSPORT_ERROR);
      mcpError.log('McpProxy');
      throw mcpError;
    }
  }

  /**
   * Check if a client is connected
   *
   * @param clientId - Client ID
   * @returns true if client is connected
   */
  isClientConnected(clientId: string): boolean {
    return this.clientTransports.has(clientId);
  }

  /**
   * Get the number of connected clients
   *
   * @returns Number of connected clients
   */
  getClientCount(): number {
    return this.clientTransports.size;
  }

  /**
   * Get all connected client IDs
   *
   * @returns Array of client IDs
   */
  getClientIds(): string[] {
    return Array.from(this.clientTransports.keys());
  }

  /**
   * Close the proxy
   */
  async close(): Promise<void> {
    // Close all client transports
    for (const [clientId] of this.clientTransports) {
      this.removeClientTransport(clientId);
    }
  }
}
