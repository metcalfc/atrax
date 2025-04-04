import { ResourceRegistry } from './resource-registry.js';
import { ServerRegistry } from '../registry/server-registry.js';
import { createContextLogger } from '../../utils/logger.js';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { ServerCapabilities, CapabilityType } from '../capabilities/server-capabilities.js';

const logger = createContextLogger('MessageRouter');

/**
 * Message router for MCP servers
 *
 * Routes requests to the appropriate underlying servers based on resource URIs,
 * tool names, and prompt names. This class will be expanded as we implement the
 * MCP server interface.
 */
export class MessageRouter {
  private resourceRegistry: ResourceRegistry;
  private serverRegistry: ServerRegistry;
  private serverCapabilities: ServerCapabilities | null = null;

  /**
   * Create a new message router
   *
   * @param resourceRegistry - Resource registry
   * @param serverRegistry - Server registry
   * @param serverCapabilities - Optional server capabilities tracker
   */
  constructor(
    resourceRegistry: ResourceRegistry,
    serverRegistry: ServerRegistry,
    serverCapabilities?: ServerCapabilities
  ) {
    this.resourceRegistry = resourceRegistry;
    this.serverRegistry = serverRegistry;
    this.serverCapabilities = serverCapabilities || null;
  }

  /**
   * Get the server name for a resource URI
   *
   * @param uri - Resource URI
   * @returns Server name or undefined if resource not found
   */
  getResourceServer(uri: string): string | undefined {
    return this.resourceRegistry.getResourceServer(uri);
  }

  /**
   * Get the server name for a tool
   *
   * @param name - Tool name
   * @returns Server name or undefined if tool not found
   */
  getToolServer(name: string): string | undefined {
    return this.resourceRegistry.getToolServer(name);
  }

  /**
   * Get the server name for a prompt
   *
   * @param name - Prompt name
   * @returns Server name or undefined if prompt not found
   */
  getPromptServer(name: string): string | undefined {
    return this.resourceRegistry.getPromptServer(name);
  }

  /**
   * Forward a resource request to the appropriate server
   *
   * @param uri - Resource URI
   * @param request - Resource request
   * @returns Resource response
   */
  async forwardResourceRequest(uri: string, request: any): Promise<any> {
    logger.info(`Resource request received for URI: ${uri}`);
    logger.debug('Request details:', request);

    const serverName = this.getResourceServer(uri);

    if (!serverName) {
      // If the resource server isn't found, throw an error
      logger.warn(`Server not found for resource: ${uri}`);
      throw new Error(`Server not found for resource: ${uri}`);
    }

    if (!this.serverRegistry.isServerRunning(serverName)) {
      logger.warn(`Server ${serverName} is not running`);
      throw new Error(`Server ${serverName} is not running`);
    }

    // Check if the server has the required capability
    if (
      this.serverCapabilities &&
      !this.serverCapabilities.supportsCapability(serverName, CapabilityType.RESOURCES, 'read')
    ) {
      logger.warn(`Server ${serverName} does not support reading resources`);
      throw new Error(`Server ${serverName} does not support reading resources`);
    }

    logger.info(`Forwarding resource request for ${uri} to server ${serverName}`);

    try {
      // Create a properly formatted JSON-RPC message for the MCP protocol
      const message: JSONRPCMessage = {
        jsonrpc: '2.0',
        id: crypto.randomUUID(),
        method: 'resources/read',
        params: { uri },
      };

      // Send request to the server
      const response = await this.serverRegistry.sendMessage(serverName, message);

      logger.debug(`Received response for resource ${uri}:`, response);
      return response;
    } catch (error) {
      logger.error(`Error forwarding resource request to ${serverName}:`, error);
      return { contents: [] };
    }
  }

  /**
   * Forward a tool request to the appropriate server
   *
   * @param name - Tool name
   * @param request - Tool request
   * @returns Tool response
   */
  async forwardToolRequest(name: string, request: any): Promise<any> {
    const serverName = this.getToolServer(name);

    if (!serverName) {
      // Throw an error when tool server not found
      logger.warn(`Server not found for tool: ${name}`);
      throw new Error(`Server not found for tool: ${name}`);
    }

    if (!this.serverRegistry.isServerRunning(serverName)) {
      logger.warn(`Server ${serverName} is not running`);
      throw new Error(`Server ${serverName} is not running`);
    }

    // Check if the server has the required capability
    if (
      this.serverCapabilities &&
      !this.serverCapabilities.supportsCapability(serverName, CapabilityType.TOOLS, 'call')
    ) {
      logger.warn(`Server ${serverName} does not support calling tools`);
      throw new Error(`Server ${serverName} does not support calling tools`);
    }

    logger.debug(`Forwarding tool request for ${name} to server ${serverName}`);

    try {
      // Create a properly formatted JSON-RPC message for the MCP protocol
      const message: JSONRPCMessage = {
        jsonrpc: '2.0',
        id: crypto.randomUUID(),
        method: 'tools/call',
        params: {
          name,
          arguments: request.params || {},
        },
      };

      // Send request to the server
      return await this.serverRegistry.sendMessage(serverName, message);
    } catch (error) {
      logger.error(`Error forwarding tool request to ${serverName}:`, error);
      return {
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  /**
   * Forward a prompt request to the appropriate server
   *
   * @param name - Prompt name
   * @param request - Prompt request
   * @returns Prompt response
   */
  async forwardPromptRequest(name: string, request: any): Promise<any> {
    const serverName = this.getPromptServer(name);

    if (!serverName) {
      // Throw an error when prompt server not found
      logger.warn(`Server not found for prompt: ${name}`);
      throw new Error(`Server not found for prompt: ${name}`);
    }

    if (!this.serverRegistry.isServerRunning(serverName)) {
      logger.warn(`Server ${serverName} is not running`);
      throw new Error(`Server ${serverName} is not running`);
    }

    // Check if the server has the required capability
    if (
      this.serverCapabilities &&
      !this.serverCapabilities.supportsCapability(serverName, CapabilityType.PROMPTS, 'get')
    ) {
      logger.warn(`Server ${serverName} does not support getting prompts`);
      throw new Error(`Server ${serverName} does not support getting prompts`);
    }

    logger.debug(`Forwarding prompt request for ${name} to server ${serverName}`);

    try {
      // Create a properly formatted JSON-RPC message for the MCP protocol
      const message: JSONRPCMessage = {
        jsonrpc: '2.0',
        id: crypto.randomUUID(),
        method: 'prompts/get',
        params: {
          name,
          arguments: request.params || {},
        },
      };

      // Send request to the server
      return await this.serverRegistry.sendMessage(serverName, message);
    } catch (error) {
      logger.error(`Error forwarding prompt request to ${serverName}:`, error);
      return {
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }
}
