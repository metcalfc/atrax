import { jest } from '@jest/globals';
import { ResourceRegistry, RegistryEvent } from '../../src/server/mcp/resource-registry.js';
import {
  McpResource,
  McpTool,
  McpPrompt,
  ResourceConflictStrategy,
} from '../../src/server/mcp/types.js';

describe('ResourceRegistry', () => {
  let registry: ResourceRegistry;

  beforeEach(() => {
    registry = new ResourceRegistry();
  });

  describe('resources', () => {
    it('should add a resource', () => {
      const resource: McpResource = {
        uri: 'test://resource',
        name: 'Test Resource',
        serverName: 'test-server',
      };

      const result = registry.addResource(resource);

      expect(result).toBe(true);
      expect(registry.getResourceCount()).toBe(1);
      expect(registry.getResource('test://resource')).toEqual(resource);
      expect(registry.getResourceServer('test://resource')).toBe('test-server');
    });

    it('should handle resource conflicts with first-wins strategy', () => {
      const resource1: McpResource = {
        uri: 'test://resource',
        name: 'Test Resource 1',
        serverName: 'server-1',
      };

      const resource2: McpResource = {
        uri: 'test://resource',
        name: 'Test Resource 2',
        serverName: 'server-2',
      };

      registry.addResource(resource1);
      const result = registry.addResource(resource2);

      expect(result).toBe(false);
      expect(registry.getResourceCount()).toBe(1);
      expect(registry.getResource('test://resource')).toEqual(resource1);
      expect(registry.getResourceServer('test://resource')).toBe('server-1');
    });

    it('should handle resource conflicts with last-wins strategy', () => {
      const registry = new ResourceRegistry({ strategy: ResourceConflictStrategy.LAST_WINS });

      const resource1: McpResource = {
        uri: 'test://resource',
        name: 'Test Resource 1',
        serverName: 'server-1',
      };

      const resource2: McpResource = {
        uri: 'test://resource',
        name: 'Test Resource 2',
        serverName: 'server-2',
      };

      registry.addResource(resource1);
      const result = registry.addResource(resource2);

      expect(result).toBe(true);
      expect(registry.getResourceCount()).toBe(1);
      expect(registry.getResource('test://resource')).toEqual(resource2);
      expect(registry.getResourceServer('test://resource')).toBe('server-2');
    });

    it('should handle resource conflicts with prefer-server strategy', () => {
      const registry = new ResourceRegistry({
        strategy: ResourceConflictStrategy.PREFER_SERVER,
        preferredServer: 'server-2',
      });

      const resource1: McpResource = {
        uri: 'test://resource',
        name: 'Test Resource 1',
        serverName: 'server-1',
      };

      const resource2: McpResource = {
        uri: 'test://resource',
        name: 'Test Resource 2',
        serverName: 'server-2',
      };

      registry.addResource(resource1);
      const result = registry.addResource(resource2);

      expect(result).toBe(true);
      expect(registry.getResourceCount()).toBe(1);
      expect(registry.getResource('test://resource')).toEqual(resource2);
      expect(registry.getResourceServer('test://resource')).toBe('server-2');
    });

    it('should handle resource conflicts with rename strategy', () => {
      const registry = new ResourceRegistry({ strategy: ResourceConflictStrategy.RENAME });

      const resource1: McpResource = {
        uri: 'test://resource',
        name: 'Test Resource',
        serverName: 'server-1',
      };

      const resource2: McpResource = {
        uri: 'test://resource',
        name: 'Test Resource',
        serverName: 'server-2',
      };

      registry.addResource(resource1);
      const result = registry.addResource(resource2);

      expect(result).toBe(true);
      expect(registry.getResourceCount()).toBe(2);
      expect(registry.getResource('test://resource')).toEqual(resource1);
      expect(registry.getResource('test://resource#server-2')).toEqual({
        ...resource2,
        uri: 'test://resource#server-2',
      });
    });

    it('should remove resources from a server', () => {
      const resource1: McpResource = {
        uri: 'test://resource1',
        name: 'Test Resource 1',
        serverName: 'server-1',
      };

      const resource2: McpResource = {
        uri: 'test://resource2',
        name: 'Test Resource 2',
        serverName: 'server-1',
      };

      const resource3: McpResource = {
        uri: 'test://resource3',
        name: 'Test Resource 3',
        serverName: 'server-2',
      };

      registry.addResource(resource1);
      registry.addResource(resource2);
      registry.addResource(resource3);

      const count = registry.removeServerResources('server-1');

      expect(count).toBe(2);
      expect(registry.getResourceCount()).toBe(1);
      expect(registry.getResource('test://resource1')).toBeUndefined();
      expect(registry.getResource('test://resource2')).toBeUndefined();
      expect(registry.getResource('test://resource3')).toEqual(resource3);
    });

    it('should get resources from a server', () => {
      const resource1: McpResource = {
        uri: 'test://resource1',
        name: 'Test Resource 1',
        serverName: 'server-1',
      };

      const resource2: McpResource = {
        uri: 'test://resource2',
        name: 'Test Resource 2',
        serverName: 'server-1',
      };

      const resource3: McpResource = {
        uri: 'test://resource3',
        name: 'Test Resource 3',
        serverName: 'server-2',
      };

      registry.addResource(resource1);
      registry.addResource(resource2);
      registry.addResource(resource3);

      const serverResources = registry.getServerResources('server-1');

      expect(serverResources.size).toBe(2);
      expect(serverResources.get('test://resource1')).toEqual(resource1);
      expect(serverResources.get('test://resource2')).toEqual(resource2);
    });
  });

  describe('tools', () => {
    it('should add a tool', () => {
      const tool: McpTool = {
        name: 'test-tool',
        serverName: 'test-server',
      };

      const result = registry.addTool(tool);

      expect(result).toBe(true);
      expect(registry.getToolCount()).toBe(1);
      expect(registry.getTool('test-tool')).toEqual(tool);
      expect(registry.getToolServer('test-tool')).toBe('test-server');
    });

    it('should handle tool conflicts (first tool wins)', () => {
      const tool1: McpTool = {
        name: 'test-tool',
        serverName: 'server-1',
      };

      const tool2: McpTool = {
        name: 'test-tool',
        serverName: 'server-2',
      };

      registry.addTool(tool1);
      const result = registry.addTool(tool2);

      expect(result).toBe(false);
      expect(registry.getToolCount()).toBe(1);
      expect(registry.getTool('test-tool')).toEqual(tool1);
      expect(registry.getToolServer('test-tool')).toBe('server-1');
    });

    it('should remove tools from a server', () => {
      const tool1: McpTool = {
        name: 'test-tool1',
        serverName: 'server-1',
      };

      const tool2: McpTool = {
        name: 'test-tool2',
        serverName: 'server-1',
      };

      const tool3: McpTool = {
        name: 'test-tool3',
        serverName: 'server-2',
      };

      registry.addTool(tool1);
      registry.addTool(tool2);
      registry.addTool(tool3);

      const count = registry.removeServerTools('server-1');

      expect(count).toBe(2);
      expect(registry.getToolCount()).toBe(1);
      expect(registry.getTool('test-tool1')).toBeUndefined();
      expect(registry.getTool('test-tool2')).toBeUndefined();
      expect(registry.getTool('test-tool3')).toEqual(tool3);
    });

    it('should get tools from a server', () => {
      const tool1: McpTool = {
        name: 'test-tool1',
        serverName: 'server-1',
      };

      const tool2: McpTool = {
        name: 'test-tool2',
        serverName: 'server-1',
      };

      const tool3: McpTool = {
        name: 'test-tool3',
        serverName: 'server-2',
      };

      registry.addTool(tool1);
      registry.addTool(tool2);
      registry.addTool(tool3);

      const serverTools = registry.getServerTools('server-1');

      expect(serverTools.size).toBe(2);
      expect(serverTools.get('test-tool1')).toEqual(tool1);
      expect(serverTools.get('test-tool2')).toEqual(tool2);
    });
  });

  describe('prompts', () => {
    it('should add a prompt', () => {
      const prompt: McpPrompt = {
        name: 'test-prompt',
        serverName: 'test-server',
      };

      const result = registry.addPrompt(prompt);

      expect(result).toBe(true);
      expect(registry.getPromptCount()).toBe(1);
      expect(registry.getPrompt('test-prompt')).toEqual(prompt);
      expect(registry.getPromptServer('test-prompt')).toBe('test-server');
    });

    it('should handle prompt conflicts (first prompt wins)', () => {
      const prompt1: McpPrompt = {
        name: 'test-prompt',
        serverName: 'server-1',
      };

      const prompt2: McpPrompt = {
        name: 'test-prompt',
        serverName: 'server-2',
      };

      registry.addPrompt(prompt1);
      const result = registry.addPrompt(prompt2);

      expect(result).toBe(false);
      expect(registry.getPromptCount()).toBe(1);
      expect(registry.getPrompt('test-prompt')).toEqual(prompt1);
      expect(registry.getPromptServer('test-prompt')).toBe('server-1');
    });

    it('should remove prompts from a server', () => {
      const prompt1: McpPrompt = {
        name: 'test-prompt1',
        serverName: 'server-1',
      };

      const prompt2: McpPrompt = {
        name: 'test-prompt2',
        serverName: 'server-1',
      };

      const prompt3: McpPrompt = {
        name: 'test-prompt3',
        serverName: 'server-2',
      };

      registry.addPrompt(prompt1);
      registry.addPrompt(prompt2);
      registry.addPrompt(prompt3);

      const count = registry.removeServerPrompts('server-1');

      expect(count).toBe(2);
      expect(registry.getPromptCount()).toBe(1);
      expect(registry.getPrompt('test-prompt1')).toBeUndefined();
      expect(registry.getPrompt('test-prompt2')).toBeUndefined();
      expect(registry.getPrompt('test-prompt3')).toEqual(prompt3);
    });

    it('should get prompts from a server', () => {
      const prompt1: McpPrompt = {
        name: 'test-prompt1',
        serverName: 'server-1',
      };

      const prompt2: McpPrompt = {
        name: 'test-prompt2',
        serverName: 'server-1',
      };

      const prompt3: McpPrompt = {
        name: 'test-prompt3',
        serverName: 'server-2',
      };

      registry.addPrompt(prompt1);
      registry.addPrompt(prompt2);
      registry.addPrompt(prompt3);

      const serverPrompts = registry.getServerPrompts('server-1');

      expect(serverPrompts.size).toBe(2);
      expect(serverPrompts.get('test-prompt1')).toEqual(prompt1);
      expect(serverPrompts.get('test-prompt2')).toEqual(prompt2);
    });
  });

  describe('events', () => {
    it('should emit events when resources are added', () => {
      const resource: McpResource = {
        uri: 'test://resource',
        name: 'Test Resource',
        serverName: 'test-server',
      };

      const listener = jest.fn();
      registry.on(RegistryEvent.RESOURCE_ADDED, listener);

      registry.addResource(resource);

      expect(listener).toHaveBeenCalledWith(resource);
    });

    it('should emit events when resources are updated', () => {
      const registry = new ResourceRegistry({ strategy: ResourceConflictStrategy.LAST_WINS });

      const resource1: McpResource = {
        uri: 'test://resource',
        name: 'Test Resource 1',
        serverName: 'server-1',
      };

      const resource2: McpResource = {
        uri: 'test://resource',
        name: 'Test Resource 2',
        serverName: 'server-2',
      };

      const listener = jest.fn();
      registry.on(RegistryEvent.RESOURCE_UPDATED, listener);

      registry.addResource(resource1);
      registry.addResource(resource2);

      expect(listener).toHaveBeenCalledWith(resource2, resource1);
    });

    it('should emit events when resources are removed', () => {
      const resource: McpResource = {
        uri: 'test://resource',
        name: 'Test Resource',
        serverName: 'test-server',
      };

      const listener = jest.fn();
      registry.on(RegistryEvent.RESOURCE_REMOVED, listener);

      registry.addResource(resource);
      registry.removeServerResources('test-server');

      expect(listener).toHaveBeenCalledWith(resource);
    });

    it('should emit events when tools are added', () => {
      const tool: McpTool = {
        name: 'test-tool',
        serverName: 'test-server',
      };

      const listener = jest.fn();
      registry.on(RegistryEvent.TOOL_ADDED, listener);

      registry.addTool(tool);

      expect(listener).toHaveBeenCalledWith(tool);
    });

    it('should emit events when tools are removed', () => {
      const tool: McpTool = {
        name: 'test-tool',
        serverName: 'test-server',
      };

      const listener = jest.fn();
      registry.on(RegistryEvent.TOOL_REMOVED, listener);

      registry.addTool(tool);
      registry.removeServerTools('test-server');

      expect(listener).toHaveBeenCalledWith(tool);
    });

    it('should emit events when prompts are added', () => {
      const prompt: McpPrompt = {
        name: 'test-prompt',
        serverName: 'test-server',
      };

      const listener = jest.fn();
      registry.on(RegistryEvent.PROMPT_ADDED, listener);

      registry.addPrompt(prompt);

      expect(listener).toHaveBeenCalledWith(prompt);
    });

    it('should emit events when prompts are removed', () => {
      const prompt: McpPrompt = {
        name: 'test-prompt',
        serverName: 'test-server',
      };

      const listener = jest.fn();
      registry.on(RegistryEvent.PROMPT_REMOVED, listener);

      registry.addPrompt(prompt);
      registry.removeServerPrompts('test-server');

      expect(listener).toHaveBeenCalledWith(prompt);
    });
  });

  describe('clear', () => {
    it('should clear all resources, tools, and prompts', () => {
      const resource: McpResource = {
        uri: 'test://resource',
        name: 'Test Resource',
        serverName: 'test-server',
      };

      const tool: McpTool = {
        name: 'test-tool',
        serverName: 'test-server',
      };

      const prompt: McpPrompt = {
        name: 'test-prompt',
        serverName: 'test-server',
      };

      registry.addResource(resource);
      registry.addTool(tool);
      registry.addPrompt(prompt);

      registry.clear();

      expect(registry.getResourceCount()).toBe(0);
      expect(registry.getToolCount()).toBe(0);
      expect(registry.getPromptCount()).toBe(0);
      expect(registry.getResource('test://resource')).toBeUndefined();
      expect(registry.getTool('test-tool')).toBeUndefined();
      expect(registry.getPrompt('test-prompt')).toBeUndefined();
    });
  });
});
