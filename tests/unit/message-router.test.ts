import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { MessageRouter } from '../../src/server/mcp/message-router.js';
import { ResourceRegistry } from '../../src/server/mcp/resource-registry.js';
import { ServerRegistry } from '../../src/server/registry/server-registry.js';
import { McpResource, McpTool, McpPrompt } from '../../src/server/mcp/types.js';

// Mock dependencies
jest.mock('../../src/server/mcp/resource-registry.js', () => {
  return {
    ResourceRegistry: jest.fn().mockImplementation(() => ({
      getResourceServer: jest.fn(),
      getToolServer: jest.fn(),
      getPromptServer: jest.fn(),
    })),
  };
});

jest.mock('../../src/server/registry/server-registry.js', () => {
  return {
    ServerRegistry: jest.fn().mockImplementation(() => ({
      isServerRunning: jest.fn(),
    })),
  };
});

describe('MessageRouter', () => {
  let router: MessageRouter;
  let resourceRegistry: ResourceRegistry;
  let serverRegistry: ServerRegistry;

  beforeEach(() => {
    resourceRegistry = new ResourceRegistry();
    serverRegistry = new ServerRegistry();
    router = new MessageRouter(resourceRegistry, serverRegistry);
  });

  describe('getResourceServer', () => {
    it('should return the server for a resource', () => {
      jest.spyOn(resourceRegistry, 'getResourceServer').mockReturnValue('test-server');

      const result = router.getResourceServer('test://resource');

      expect(result).toBe('test-server');
      expect(resourceRegistry.getResourceServer).toHaveBeenCalledWith('test://resource');
    });

    it('should return undefined if resource not found', () => {
      jest.spyOn(resourceRegistry, 'getResourceServer').mockReturnValue(undefined);

      const result = router.getResourceServer('test://resource');

      expect(result).toBeUndefined();
      expect(resourceRegistry.getResourceServer).toHaveBeenCalledWith('test://resource');
    });
  });

  describe('getToolServer', () => {
    it('should return the server for a tool', () => {
      jest.spyOn(resourceRegistry, 'getToolServer').mockReturnValue('test-server');

      const result = router.getToolServer('test-tool');

      expect(result).toBe('test-server');
      expect(resourceRegistry.getToolServer).toHaveBeenCalledWith('test-tool');
    });

    it('should return undefined if tool not found', () => {
      jest.spyOn(resourceRegistry, 'getToolServer').mockReturnValue(undefined);

      const result = router.getToolServer('test-tool');

      expect(result).toBeUndefined();
      expect(resourceRegistry.getToolServer).toHaveBeenCalledWith('test-tool');
    });
  });

  describe('getPromptServer', () => {
    it('should return the server for a prompt', () => {
      jest.spyOn(resourceRegistry, 'getPromptServer').mockReturnValue('test-server');

      const result = router.getPromptServer('test-prompt');

      expect(result).toBe('test-server');
      expect(resourceRegistry.getPromptServer).toHaveBeenCalledWith('test-prompt');
    });

    it('should return undefined if prompt not found', () => {
      jest.spyOn(resourceRegistry, 'getPromptServer').mockReturnValue(undefined);

      const result = router.getPromptServer('test-prompt');

      expect(result).toBeUndefined();
      expect(resourceRegistry.getPromptServer).toHaveBeenCalledWith('test-prompt');
    });
  });

  describe('forwardResourceRequest', () => {
    it('should throw if server not found', async () => {
      jest.spyOn(resourceRegistry, 'getResourceServer').mockReturnValue(undefined);

      await expect(router.forwardResourceRequest('test://resource', {})).rejects.toThrow(
        'Server not found for resource: test://resource'
      );
      expect(resourceRegistry.getResourceServer).toHaveBeenCalledWith('test://resource');
    });

    it('should throw if server is not running', async () => {
      jest.spyOn(resourceRegistry, 'getResourceServer').mockReturnValue('test-server');
      jest.spyOn(serverRegistry, 'isServerRunning').mockReturnValue(false);

      await expect(router.forwardResourceRequest('test://resource', {})).rejects.toThrow(
        'Server test-server is not running'
      );
      expect(resourceRegistry.getResourceServer).toHaveBeenCalledWith('test://resource');
      expect(serverRegistry.isServerRunning).toHaveBeenCalledWith('test-server');
    });

    // Additional tests would be implemented once the forwarding mechanism is complete
  });

  describe('forwardToolRequest', () => {
    it('should throw if server not found', async () => {
      jest.spyOn(resourceRegistry, 'getToolServer').mockReturnValue(undefined);

      await expect(router.forwardToolRequest('test-tool', {})).rejects.toThrow(
        'Server not found for tool: test-tool'
      );
      expect(resourceRegistry.getToolServer).toHaveBeenCalledWith('test-tool');
    });

    it('should throw if server is not running', async () => {
      jest.spyOn(resourceRegistry, 'getToolServer').mockReturnValue('test-server');
      jest.spyOn(serverRegistry, 'isServerRunning').mockReturnValue(false);

      await expect(router.forwardToolRequest('test-tool', {})).rejects.toThrow(
        'Server test-server is not running'
      );
      expect(resourceRegistry.getToolServer).toHaveBeenCalledWith('test-tool');
      expect(serverRegistry.isServerRunning).toHaveBeenCalledWith('test-server');
    });

    // Additional tests would be implemented once the forwarding mechanism is complete
  });

  describe('forwardPromptRequest', () => {
    it('should throw if server not found', async () => {
      jest.spyOn(resourceRegistry, 'getPromptServer').mockReturnValue(undefined);

      await expect(router.forwardPromptRequest('test-prompt', {})).rejects.toThrow(
        'Server not found for prompt: test-prompt'
      );
      expect(resourceRegistry.getPromptServer).toHaveBeenCalledWith('test-prompt');
    });

    it('should throw if server is not running', async () => {
      jest.spyOn(resourceRegistry, 'getPromptServer').mockReturnValue('test-server');
      jest.spyOn(serverRegistry, 'isServerRunning').mockReturnValue(false);

      await expect(router.forwardPromptRequest('test-prompt', {})).rejects.toThrow(
        'Server test-server is not running'
      );
      expect(resourceRegistry.getPromptServer).toHaveBeenCalledWith('test-prompt');
      expect(serverRegistry.isServerRunning).toHaveBeenCalledWith('test-server');
    });

    // Additional tests would be implemented once the forwarding mechanism is complete
  });
});
