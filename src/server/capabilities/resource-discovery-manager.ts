import { ServerRegistry } from '../registry/server-registry.js';
import { ResourceRegistry } from '../mcp/resource-registry.js';
import { createContextLogger } from '../../utils/logger.js';
import { ServerCapabilities, CapabilityType } from './server-capabilities.js';
import crypto from 'node:crypto';

const logger = createContextLogger('ResourceDiscoveryManager');

/**
 * Enhanced ResourceDiscoveryManager that uses capability detection
 * to discover resources, tools, and prompts from MCP servers
 */
export class ResourceDiscoveryManager {
  private serverRegistry: ServerRegistry;
  private resourceRegistry: ResourceRegistry;
  private serverCapabilities: ServerCapabilities;

  /**
   * Create a new resource discovery manager
   *
   * @param resourceRegistry - Resource registry
   * @param serverRegistry - Server registry
   * @param serverCapabilities - Server capabilities tracker
   */
  constructor(
    resourceRegistry: ResourceRegistry,
    serverRegistry: ServerRegistry,
    serverCapabilities: ServerCapabilities
  ) {
    this.resourceRegistry = resourceRegistry;
    this.serverRegistry = serverRegistry;
    this.serverCapabilities = serverCapabilities;
  }

  /**
   * Discover all resources from all running servers
   */
  public async discoverAllResources(): Promise<void> {
    logger.info('Discovering all resources from running servers');

    // Make sure capabilities are initialized
    await this.serverCapabilities.initialize();

    // Get the list of servers
    const servers = Array.from(this.serverRegistry.getServers().keys());

    // Discover resources from each running server
    for (const serverName of servers) {
      if (this.serverRegistry.isServerRunning(serverName)) {
        await this.discoverServerResources(serverName);
      }
    }

    logger.info('Resource discovery complete');
  }

  /**
   * Discover resources from a specific server
   *
   * @param serverName - Server name
   */
  public async discoverServerResources(serverName: string): Promise<void> {
    logger.info(`Discovering resources from server ${serverName}`);

    try {
      // Discover resources
      if (
        this.serverCapabilities.supportsCapability(serverName, CapabilityType.RESOURCES, 'list')
      ) {
        await this.discoverResources(serverName);
      } else {
        logger.debug(`Server ${serverName} does not support resource listing`);
      }

      // Discover tools
      if (this.serverCapabilities.supportsCapability(serverName, CapabilityType.TOOLS, 'list')) {
        await this.discoverTools(serverName);
      } else {
        logger.debug(`Server ${serverName} does not support tool listing`);
      }

      // Discover prompts
      if (this.serverCapabilities.supportsCapability(serverName, CapabilityType.PROMPTS, 'list')) {
        await this.discoverPrompts(serverName);
      } else {
        logger.debug(`Server ${serverName} does not support prompt listing`);
      }
    } catch (error) {
      logger.error(`Error discovering resources from server ${serverName}:`, error);
      throw error;
    }
  }

  /**
   * Discover resources from a server
   *
   * @param serverName - Server name
   */
  private async discoverResources(serverName: string): Promise<void> {
    logger.info(`Discovering resources from server ${serverName}`);

    try {
      // Request resources from the server
      const result = (await this.serverRegistry.sendMessage(serverName, {
        jsonrpc: '2.0',
        id: crypto.randomUUID(),
        method: 'list_resources',
        params: {},
      })) as { resources?: ResourceResponse[] };

      // Define resource interface
      interface ResourceResponse {
        uri: string;
        name: string;
        description?: string;
        mimeType?: string;
      }

      // Extract resources from the response
      const resources = (result.resources || []) as ResourceResponse[];

      // Register each resource as a batch
      this.resourceRegistry.addResources(
        resources.map((resource: ResourceResponse) => ({
          uri: resource.uri,
          name: resource.name,
          description: resource.description,
          mimeType: resource.mimeType,
          serverName,
        }))
      );

      logger.info(`Discovered ${resources.length} resources from server ${serverName}`);
    } catch (error) {
      logger.error(`Error discovering resources from server ${serverName}:`, error);
      throw error;
    }
  }

  /**
   * Discover tools from a server
   *
   * @param serverName - Server name
   */
  private async discoverTools(serverName: string): Promise<void> {
    logger.info(`Discovering tools from server ${serverName}`);

    try {
      // Request tools from the server
      const result = (await this.serverRegistry.sendMessage(serverName, {
        jsonrpc: '2.0',
        id: crypto.randomUUID(),
        method: 'list_tools',
        params: {},
      })) as { tools?: ToolResponse[] };

      // Define tool interface
      interface ToolResponse {
        name: string;
        description?: string;
        inputSchema?: any;
      }

      // Extract tools from the response
      const tools = (result.tools || []) as ToolResponse[];

      // Register tools as a batch
      this.resourceRegistry.addTools(
        tools.map((tool: ToolResponse) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          serverName,
        }))
      );

      logger.info(`Discovered ${tools.length} tools from server ${serverName}`);
    } catch (error) {
      logger.error(`Error discovering tools from server ${serverName}:`, error);
      throw error;
    }
  }

  /**
   * Discover prompts from a server
   *
   * @param serverName - Server name
   */
  private async discoverPrompts(serverName: string): Promise<void> {
    logger.info(`Discovering prompts from server ${serverName}`);

    try {
      // Request prompts from the server
      const result = (await this.serverRegistry.sendMessage(serverName, {
        jsonrpc: '2.0',
        id: crypto.randomUUID(),
        method: 'list_prompts',
        params: {},
      })) as { prompts?: PromptResponse[] };

      // Define prompt interface
      interface PromptResponse {
        name: string;
        description?: string;
        arguments?: any;
      }

      // Extract prompts from the response
      const prompts = (result.prompts || []) as PromptResponse[];

      // Register prompts as a batch
      this.resourceRegistry.addPrompts(
        prompts.map((prompt: PromptResponse) => ({
          name: prompt.name,
          description: prompt.description,
          inputSchema: prompt.arguments ? { type: 'object', properties: {} } : undefined,
          serverName,
        }))
      );

      logger.info(`Discovered ${prompts.length} prompts from server ${serverName}`);
    } catch (error) {
      logger.error(`Error discovering prompts from server ${serverName}:`, error);
      throw error;
    }
  }
}
