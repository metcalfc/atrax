import { EventEmitter } from 'node:events';
import {
  McpResource,
  McpTool,
  McpPrompt,
  ResourceConflictStrategy,
  ResourceConflictConfig,
} from './types.js';
import { createContextLogger } from '../../utils/logger.js';

const logger = createContextLogger('ResourceRegistry');

/**
 * Registry events
 */
export enum RegistryEvent {
  /** Resource added to registry */
  RESOURCE_ADDED = 'resource-added',
  /** Resource removed from registry */
  RESOURCE_REMOVED = 'resource-removed',
  /** Resource updated in registry */
  RESOURCE_UPDATED = 'resource-updated',
  /** Tool added to registry */
  TOOL_ADDED = 'tool-added',
  /** Tool removed from registry */
  TOOL_REMOVED = 'tool-removed',
  /** Tool updated in registry */
  TOOL_UPDATED = 'tool-updated',
  /** Prompt added to registry */
  PROMPT_ADDED = 'prompt-added',
  /** Prompt removed from registry */
  PROMPT_REMOVED = 'prompt-removed',
  /** Prompt updated in registry */
  PROMPT_UPDATED = 'prompt-updated',
}

/**
 * Resource registry for MCP servers
 *
 * Aggregates resources, tools, and prompts from all MCP servers
 */
export class ResourceRegistry extends EventEmitter {
  private resources: Map<string, McpResource> = new Map();
  private tools: Map<string, McpTool> = new Map();
  private prompts: Map<string, McpPrompt> = new Map();

  // Maps resource URIs to server names
  private resourceToServer: Map<string, string> = new Map();
  // Maps tool names to server names
  private toolToServer: Map<string, string> = new Map();
  // Maps prompt names to server names
  private promptToServer: Map<string, string> = new Map();

  // Conflict resolution
  private conflictConfig: ResourceConflictConfig = {
    strategy: ResourceConflictStrategy.FIRST_WINS,
  };

  /**
   * Create a new resource registry
   *
   * @param conflictConfig - Resource conflict resolution configuration
   */
  constructor(conflictConfig?: ResourceConflictConfig) {
    super();

    if (conflictConfig) {
      this.conflictConfig = conflictConfig;
    }
  }

  /**
   * Add a resource to the registry
   *
   * @param resource - Resource to add
   * @returns True if resource was added, false if skipped due to conflict
   */
  addResource(resource: McpResource): boolean {
    const existingResource = this.resources.get(resource.uri);

    // If resource already exists, handle conflict
    if (existingResource) {
      return this.handleResourceConflict(resource, existingResource);
    }

    // Add new resource
    this.resources.set(resource.uri, resource);
    this.resourceToServer.set(resource.uri, resource.serverName);

    logger.debug(
      `Added resource ${resource.name} (${resource.uri}) from server ${resource.serverName}`
    );
    this.emit(RegistryEvent.RESOURCE_ADDED, resource);

    return true;
  }

  /**
   * Add multiple resources to the registry
   *
   * @param resources - Resources to add
   * @returns Map of resource URIs to add results (true if added, false if skipped)
   */
  addResources(resources: McpResource[]): Map<string, boolean> {
    const results = new Map<string, boolean>();

    for (const resource of resources) {
      results.set(resource.uri, this.addResource(resource));
    }

    return results;
  }

  /**
   * Handle resource conflict according to configured strategy
   *
   * @param newResource - New resource
   * @param existingResource - Existing resource
   * @returns True if resource was added/updated, false if skipped
   */
  private handleResourceConflict(newResource: McpResource, existingResource: McpResource): boolean {
    switch (this.conflictConfig.strategy) {
      case ResourceConflictStrategy.FIRST_WINS:
        // Keep existing resource
        logger.debug(
          `Skipped resource ${newResource.name} (${newResource.uri}) from server ${newResource.serverName} (first-wins strategy)`
        );
        return false;

      case ResourceConflictStrategy.LAST_WINS:
        // Replace with new resource
        this.resources.set(newResource.uri, newResource);
        this.resourceToServer.set(newResource.uri, newResource.serverName);

        logger.debug(
          `Updated resource ${newResource.name} (${newResource.uri}) from server ${newResource.serverName} (last-wins strategy)`
        );
        this.emit(RegistryEvent.RESOURCE_UPDATED, newResource, existingResource);
        return true;

      case ResourceConflictStrategy.PREFER_SERVER:
        // Use preferred server
        if (this.conflictConfig.preferredServer) {
          if (newResource.serverName === this.conflictConfig.preferredServer) {
            // Replace with new resource from preferred server
            this.resources.set(newResource.uri, newResource);
            this.resourceToServer.set(newResource.uri, newResource.serverName);

            logger.debug(
              `Updated resource ${newResource.name} (${newResource.uri}) from preferred server ${newResource.serverName}`
            );
            this.emit(RegistryEvent.RESOURCE_UPDATED, newResource, existingResource);
            return true;
          } else if (existingResource.serverName !== this.conflictConfig.preferredServer) {
            // Replace if existing is not from preferred server
            this.resources.set(newResource.uri, newResource);
            this.resourceToServer.set(newResource.uri, newResource.serverName);

            logger.debug(
              `Updated resource ${newResource.name} (${newResource.uri}) from server ${newResource.serverName} (neither is preferred)`
            );
            this.emit(RegistryEvent.RESOURCE_UPDATED, newResource, existingResource);
            return true;
          }
        }

        // Default to first-wins
        logger.debug(
          `Skipped resource ${newResource.name} (${newResource.uri}) from server ${newResource.serverName} (prefer-server strategy)`
        );
        return false;

      case ResourceConflictStrategy.RENAME:
        // Rename new resource
        const originalUri = newResource.uri;
        const newUri = `${newResource.uri}#${newResource.serverName}`;

        newResource.uri = newUri;

        this.resources.set(newUri, newResource);
        this.resourceToServer.set(newUri, newResource.serverName);

        logger.debug(
          `Added renamed resource ${newResource.name} (${newUri}, was ${originalUri}) from server ${newResource.serverName}`
        );
        this.emit(RegistryEvent.RESOURCE_ADDED, newResource);
        return true;

      case ResourceConflictStrategy.REJECT:
        // Reject new resource
        logger.debug(
          `Rejected resource ${newResource.name} (${newResource.uri}) from server ${newResource.serverName} due to conflict`
        );
        return false;

      default:
        // Default to first-wins
        logger.debug(
          `Skipped resource ${newResource.name} (${newResource.uri}) from server ${newResource.serverName} (unknown strategy)`
        );
        return false;
    }
  }

  /**
   * Remove resources from a specific server
   *
   * @param serverName - Server name
   * @returns Number of resources removed
   */
  removeServerResources(serverName: string): number {
    let count = 0;

    // Find resources from the server
    for (const [uri, resource] of this.resources.entries()) {
      if (resource.serverName === serverName) {
        this.resources.delete(uri);
        this.resourceToServer.delete(uri);

        logger.debug(`Removed resource ${resource.name} (${uri}) from server ${serverName}`);
        this.emit(RegistryEvent.RESOURCE_REMOVED, resource);

        count++;
      }
    }

    return count;
  }

  /**
   * Get all resources
   *
   * @returns Map of resource URIs to resources
   */
  getResources(): Map<string, McpResource> {
    return new Map(this.resources);
  }

  /**
   * Get a specific resource
   *
   * @param uri - Resource URI
   * @returns Resource or undefined if not found
   */
  getResource(uri: string): McpResource | undefined {
    return this.resources.get(uri);
  }

  /**
   * Get resources from a specific server
   *
   * @param serverName - Server name
   * @returns Map of resource URIs to resources
   */
  getServerResources(serverName: string): Map<string, McpResource> {
    const serverResources = new Map<string, McpResource>();

    for (const [uri, resource] of this.resources.entries()) {
      if (resource.serverName === serverName) {
        serverResources.set(uri, resource);
      }
    }

    return serverResources;
  }

  /**
   * Get the server for a specific resource
   *
   * @param uri - Resource URI
   * @returns Server name or undefined if not found
   */
  getResourceServer(uri: string): string | undefined {
    return this.resourceToServer.get(uri);
  }

  /**
   * Add a tool to the registry
   *
   * @param tool - Tool to add
   * @returns True if tool was added, false if skipped due to conflict
   */
  addTool(tool: McpTool): boolean {
    const existingTool = this.tools.get(tool.name);

    // Handle tool conflict (simpler than resource - we just use the first tool by default)
    if (existingTool) {
      logger.debug(`Skipped tool ${tool.name} from server ${tool.serverName} (duplicate name)`);
      return false;
    }

    // Add new tool
    this.tools.set(tool.name, tool);
    this.toolToServer.set(tool.name, tool.serverName);

    logger.debug(`Added tool ${tool.name} from server ${tool.serverName}`);
    this.emit(RegistryEvent.TOOL_ADDED, tool);

    return true;
  }

  /**
   * Add multiple tools to the registry
   *
   * @param tools - Tools to add
   * @returns Map of tool names to add results (true if added, false if skipped)
   */
  addTools(tools: McpTool[]): Map<string, boolean> {
    const results = new Map<string, boolean>();

    for (const tool of tools) {
      results.set(tool.name, this.addTool(tool));
    }

    return results;
  }

  /**
   * Remove tools from a specific server
   *
   * @param serverName - Server name
   * @returns Number of tools removed
   */
  removeServerTools(serverName: string): number {
    let count = 0;

    // Find tools from the server
    for (const [name, tool] of this.tools.entries()) {
      if (tool.serverName === serverName) {
        this.tools.delete(name);
        this.toolToServer.delete(name);

        logger.debug(`Removed tool ${name} from server ${serverName}`);
        this.emit(RegistryEvent.TOOL_REMOVED, tool);

        count++;
      }
    }

    return count;
  }

  /**
   * Get all tools
   *
   * @returns Map of tool names to tools
   */
  getTools(): Map<string, McpTool> {
    return new Map(this.tools);
  }

  /**
   * Get a specific tool
   *
   * @param name - Tool name
   * @returns Tool or undefined if not found
   */
  getTool(name: string): McpTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get tools from a specific server
   *
   * @param serverName - Server name
   * @returns Map of tool names to tools
   */
  getServerTools(serverName: string): Map<string, McpTool> {
    const serverTools = new Map<string, McpTool>();

    for (const [name, tool] of this.tools.entries()) {
      if (tool.serverName === serverName) {
        serverTools.set(name, tool);
      }
    }

    return serverTools;
  }

  /**
   * Get the server for a specific tool
   *
   * @param name - Tool name
   * @returns Server name or undefined if not found
   */
  getToolServer(name: string): string | undefined {
    return this.toolToServer.get(name);
  }

  /**
   * Add a prompt to the registry
   *
   * @param prompt - Prompt to add
   * @returns True if prompt was added, false if skipped due to conflict
   */
  addPrompt(prompt: McpPrompt): boolean {
    const existingPrompt = this.prompts.get(prompt.name);

    // Handle prompt conflict (simpler than resource - we just use the first prompt by default)
    if (existingPrompt) {
      logger.debug(
        `Skipped prompt ${prompt.name} from server ${prompt.serverName} (duplicate name)`
      );
      return false;
    }

    // Add new prompt
    this.prompts.set(prompt.name, prompt);
    this.promptToServer.set(prompt.name, prompt.serverName);

    logger.debug(`Added prompt ${prompt.name} from server ${prompt.serverName}`);
    this.emit(RegistryEvent.PROMPT_ADDED, prompt);

    return true;
  }

  /**
   * Add multiple prompts to the registry
   *
   * @param prompts - Prompts to add
   * @returns Map of prompt names to add results (true if added, false if skipped)
   */
  addPrompts(prompts: McpPrompt[]): Map<string, boolean> {
    const results = new Map<string, boolean>();

    for (const prompt of prompts) {
      results.set(prompt.name, this.addPrompt(prompt));
    }

    return results;
  }

  /**
   * Remove prompts from a specific server
   *
   * @param serverName - Server name
   * @returns Number of prompts removed
   */
  removeServerPrompts(serverName: string): number {
    let count = 0;

    // Find prompts from the server
    for (const [name, prompt] of this.prompts.entries()) {
      if (prompt.serverName === serverName) {
        this.prompts.delete(name);
        this.promptToServer.delete(name);

        logger.debug(`Removed prompt ${name} from server ${serverName}`);
        this.emit(RegistryEvent.PROMPT_REMOVED, prompt);

        count++;
      }
    }

    return count;
  }

  /**
   * Get all prompts
   *
   * @returns Map of prompt names to prompts
   */
  getPrompts(): Map<string, McpPrompt> {
    return new Map(this.prompts);
  }

  /**
   * Get a specific prompt
   *
   * @param name - Prompt name
   * @returns Prompt or undefined if not found
   */
  getPrompt(name: string): McpPrompt | undefined {
    return this.prompts.get(name);
  }

  /**
   * Get prompts from a specific server
   *
   * @param serverName - Server name
   * @returns Map of prompt names to prompts
   */
  getServerPrompts(serverName: string): Map<string, McpPrompt> {
    const serverPrompts = new Map<string, McpPrompt>();

    for (const [name, prompt] of this.prompts.entries()) {
      if (prompt.serverName === serverName) {
        serverPrompts.set(name, prompt);
      }
    }

    return serverPrompts;
  }

  /**
   * Get the server for a specific prompt
   *
   * @param name - Prompt name
   * @returns Server name or undefined if not found
   */
  getPromptServer(name: string): string | undefined {
    return this.promptToServer.get(name);
  }

  /**
   * Remove all resources, tools, and prompts
   */
  clear(): void {
    this.resources.clear();
    this.tools.clear();
    this.prompts.clear();

    this.resourceToServer.clear();
    this.toolToServer.clear();
    this.promptToServer.clear();

    logger.debug('Cleared all resources, tools, and prompts from registry');
  }

  /**
   * Get the number of resources
   *
   * @returns Number of resources
   */
  getResourceCount(): number {
    return this.resources.size;
  }

  /**
   * Get the number of tools
   *
   * @returns Number of tools
   */
  getToolCount(): number {
    return this.tools.size;
  }

  /**
   * Get the number of prompts
   *
   * @returns Number of prompts
   */
  getPromptCount(): number {
    return this.prompts.size;
  }
}
