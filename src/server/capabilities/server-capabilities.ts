import { ServerRegistry, RegistryEvent } from '../registry/server-registry.js';
import { createContextLogger } from '../../utils/logger.js';
import { McpCapabilities } from '../../types/mcp.js';
import crypto from 'node:crypto';

const logger = createContextLogger('ServerCapabilities');

/**
 * Defines the set of capabilities an MCP server might implement
 */
export enum CapabilityType {
  RESOURCES = 'resources',
  TOOLS = 'tools',
  PROMPTS = 'prompts',
  CORE = 'core',
}

/**
 * Server capability interface for discovery and tracking
 */
export class ServerCapabilities {
  private supportedCapabilities: Map<string, Map<string, boolean>> = new Map();
  private serverRegistry: ServerRegistry;
  private initialized: boolean = false;

  /**
   * Create a new server capabilities tracker
   *
   * @param serverRegistry - Server registry to monitor
   */
  constructor(serverRegistry: ServerRegistry) {
    this.serverRegistry = serverRegistry;

    // Initialize support tracking maps for each capability type
    Object.values(CapabilityType).forEach(type => {
      this.supportedCapabilities.set(type, new Map());
    });

    // Set up event listeners for server registry events
    this.setupRegistryEventHandlers();
  }

  /**
   * Set up registry event handlers
   */
  private setupRegistryEventHandlers(): void {
    // When a server is started, detect its capabilities
    this.serverRegistry.on(RegistryEvent.SERVER_STARTED, (serverName: string) => {
      this.detectServerCapabilities(serverName).catch(error => {
        logger.error(`Failed to detect capabilities for server ${serverName}:`, error);
      });
    });

    // When a server is stopped, clear its capabilities
    this.serverRegistry.on(RegistryEvent.SERVER_STOPPED, (serverName: string) => {
      this.clearServerCapabilities(serverName);
    });
  }

  /**
   * Detect capabilities of a server
   *
   * @param serverName - Server name
   */
  private async detectServerCapabilities(serverName: string): Promise<void> {
    logger.info(`Detecting capabilities for server ${serverName}`);

    try {
      // First try get_capabilities request
      const result = await this.serverRegistry.sendMessage(
        serverName,
        {
          jsonrpc: '2.0',
          id: crypto.randomUUID(),
          method: 'get_capabilities',
          params: {},
        },
        5000 // 5 second timeout
      ) as { capabilities?: McpCapabilities };

      if (result && result.capabilities) {
        // Process capabilities from server response
        this.updateServerCapabilities(serverName, result.capabilities);
        logger.info(`Updated capabilities for server ${serverName} using get_capabilities`);
        return;
      }
    } catch (error) {
      logger.debug(
        `Server ${serverName} does not support get_capabilities method, trying feature detection`
      );
    }

    // If get_capabilities fails, try feature detection
    await this.detectCapabilitiesByFeature(serverName);
  }

  /**
   * Detect capabilities by probing features
   *
   * @param serverName - Server name
   */
  private async detectCapabilitiesByFeature(serverName: string): Promise<void> {
    logger.info(`Detecting capabilities for server ${serverName} using feature detection`);

    try {
      // Test resources/list capability
      try {
        await this.serverRegistry.sendMessage(
          serverName,
          {
            jsonrpc: '2.0',
            id: crypto.randomUUID(),
            method: 'resources/list',
            params: {},
          },
          3000 // 3 second timeout
        );

        this.setCapabilitySupport(serverName, CapabilityType.RESOURCES, 'list', true);
        logger.debug(`Server ${serverName} supports resources/list`);
      } catch (error) {
        this.setCapabilitySupport(serverName, CapabilityType.RESOURCES, 'list', false);
        logger.debug(`Server ${serverName} does not support resources/list`);
      }

      // Test tools/list capability
      try {
        await this.serverRegistry.sendMessage(
          serverName,
          {
            jsonrpc: '2.0',
            id: crypto.randomUUID(),
            method: 'tools/list',
            params: {},
          },
          3000 // 3 second timeout
        );

        this.setCapabilitySupport(serverName, CapabilityType.TOOLS, 'list', true);
        logger.debug(`Server ${serverName} supports tools/list`);
      } catch (error) {
        this.setCapabilitySupport(serverName, CapabilityType.TOOLS, 'list', false);
        logger.debug(`Server ${serverName} does not support tools/list`);
      }

      // Test prompts/list capability
      try {
        await this.serverRegistry.sendMessage(
          serverName,
          {
            jsonrpc: '2.0',
            id: crypto.randomUUID(),
            method: 'prompts/list',
            params: {},
          },
          3000 // 3 second timeout
        );

        this.setCapabilitySupport(serverName, CapabilityType.PROMPTS, 'list', true);
        logger.debug(`Server ${serverName} supports prompts/list`);
      } catch (error) {
        this.setCapabilitySupport(serverName, CapabilityType.PROMPTS, 'list', false);
        logger.debug(`Server ${serverName} does not support prompts/list`);
      }

      logger.info(`Completed capability detection for server ${serverName}`);
    } catch (error) {
      logger.error(`Error during feature detection for server ${serverName}:`, error);
    }
  }

  /**
   * Update capabilities of a server from get_capabilities response
   *
   * @param serverName - Server name
   * @param capabilities - Capabilities object from get_capabilities response
   */
  private updateServerCapabilities(serverName: string, capabilities: McpCapabilities): void {
    // Process each capability type
    Object.values(CapabilityType).forEach(type => {
      const capabilityObj = capabilities[type];
      if (capabilityObj && typeof capabilityObj === 'object') {
        Object.keys(capabilityObj).forEach(method => {
          this.setCapabilitySupport(serverName, type, method, true);
        });
      }
    });
  }

  /**
   * Set whether a server supports a capability
   *
   * @param serverName - Server name
   * @param capabilityType - Capability type
   * @param method - Capability method
   * @param supported - Whether the capability is supported
   */
  private setCapabilitySupport(
    serverName: string,
    capabilityType: string,
    method: string,
    supported: boolean
  ): void {
    const key = `${serverName}:${capabilityType}:${method}`;
    const capabilityMap = this.supportedCapabilities.get(capabilityType);

    if (capabilityMap) {
      capabilityMap.set(key, supported);
    }
  }

  /**
   * Clear capabilities for a server
   *
   * @param serverName - Server name
   */
  private clearServerCapabilities(serverName: string): void {
    logger.info(`Clearing capabilities for server ${serverName}`);

    // Clear all capability entries for this server
    Object.values(CapabilityType).forEach(type => {
      const capabilityMap = this.supportedCapabilities.get(type);

      if (capabilityMap) {
        // Remove all keys that start with the server name
        for (const key of capabilityMap.keys()) {
          if (key.startsWith(`${serverName}:`)) {
            capabilityMap.delete(key);
          }
        }
      }
    });
  }

  /**
   * Check if a server supports a capability method
   *
   * @param serverName - Server name
   * @param capabilityType - Capability type
   * @param method - Capability method
   * @returns Whether the server supports the capability
   */
  public supportsCapability(serverName: string, capabilityType: string, method: string): boolean {
    const key = `${serverName}:${capabilityType}:${method}`;
    const capabilityMap = this.supportedCapabilities.get(capabilityType);

    if (capabilityMap) {
      return capabilityMap.get(key) === true;
    }

    return false;
  }

  /**
   * Get servers that support a capability method
   *
   * @param capabilityType - Capability type
   * @param method - Capability method
   * @returns Array of server names that support the capability
   */
  public getServersWithCapability(capabilityType: string, method: string): string[] {
    const capabilityMap = this.supportedCapabilities.get(capabilityType);

    if (!capabilityMap) {
      return [];
    }

    const servers: string[] = [];

    // Check all entries in the capability map
    for (const [key, supported] of capabilityMap.entries()) {
      if (supported && key.endsWith(`:${capabilityType}:${method}`)) {
        const serverName = key.split(':')[0];
        servers.push(serverName);
      }
    }

    return servers;
  }

  /**
   * Initialize capabilities for all registered servers
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    logger.info('Initializing capabilities for all servers');

    const servers = Array.from(this.serverRegistry.getServers().keys());

    for (const serverName of servers) {
      if (this.serverRegistry.isServerRunning(serverName)) {
        try {
          await this.detectServerCapabilities(serverName);
        } catch (error) {
          logger.error(`Failed to detect capabilities for server ${serverName}:`, error);
        }
      }
    }

    this.initialized = true;
    logger.info('Capabilities initialization complete');
  }

  /**
   * Debug function to log all discovered capabilities
   */
  public logAllCapabilities(): void {
    logger.info('All discovered server capabilities:');

    Object.values(CapabilityType).forEach(type => {
      const capabilityMap = this.supportedCapabilities.get(type);

      if (capabilityMap && capabilityMap.size > 0) {
        logger.info(`Capability type: ${type}`);

        for (const [key, supported] of capabilityMap.entries()) {
          logger.info(`  ${key}: ${supported ? 'supported' : 'not supported'}`);
        }
      }
    });
  }
}
