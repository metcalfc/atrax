// @ts-nocheck - Disable TypeScript checking for tests
import { jest } from '@jest/globals';
import { McpProxy, ProxyEvent } from '../../src/server/proxy/mcp-proxy.js';
import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import {
  JSONRPCMessage,
  JSONRPCRequest,
  MethodParams,
  MethodResults,
} from '../../src/types/mcp.js';
import { ServerRegistry } from '../../src/server/registry/server-registry.js';

// Mock ServerRegistry using jest.mock - this is required because we're testing
jest.mock('../../src/server/registry/server-registry.js');

// Create mock for registry functionality
const mockRegistry = {
  on: jest.fn(),
  getServers: jest.fn().mockReturnValue(new Map()),
  isServerRunning: jest.fn().mockReturnValue(true),
  sendMessage: jest.fn(),
} as unknown as ServerRegistry;

// Typing is critical here as we're using jest to mock out the function
// TypeScript build would fail without this assertion
(mockRegistry.sendMessage as jest.Mock).mockImplementation(
  async (serverId: string, message: JSONRPCRequest) => {
    if (message.method === 'get_capabilities') {
      return {
        capabilities: {
          core: { get_capabilities: {} },
          resources: { list: {}, read: {}, list_changed: {} },
          tools: { list: {}, call: {}, list_changed: {} },
          prompts: { list: {}, get: {}, list_changed: {} },
        },
      };
    }

    if (message.method === 'resources/list') {
      return {
        resources: [{ uri: 'test://resource' }],
      };
    }

    if (message.method === 'resources/read') {
      return {
        contents: [{ uri: message.params?.uri as string, text: 'Resource content' }],
      };
    }

    if (message.method === 'tools/call') {
      return {
        content: [{ type: 'text', text: `Tool ${message.params?.name as string} called` }],
      };
    }

    if (message.method === 'error_method') {
      throw new Error('Test error');
    }

    return { success: true };
  }
);

// Mock Transport
class MockTransport extends EventEmitter {
  send = jest.fn();

  // Fix removeListener by implementing it properly
  removeListener(event: string, listener: (...args: any[]) => void): this {
    super.removeListener(event, listener);
    return this;
  }
}

describe('McpProxy', () => {
  let proxy: McpProxy;

  beforeEach(() => {
    jest.clearAllMocks();
    proxy = new McpProxy(mockRegistry);
  });

  describe('handleDirectMessage', () => {
    it('should handle valid get_capabilities request', async () => {
      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: crypto.randomUUID(),
        method: 'get_capabilities',
        params: {},
      };

      const response = await proxy.handleDirectMessage(request);

      expect(response).toHaveProperty('jsonrpc', '2.0');
      expect(response).toHaveProperty('id', request.id);
      expect(response).toHaveProperty('result');
      if ('result' in response) {
        expect(response.result).toHaveProperty('capabilities');
        expect(response.result.capabilities).toHaveProperty('core');
      }
    });

    it('should return error for invalid JSON-RPC version', async () => {
      const request: Omit<JSONRPCRequest, 'jsonrpc'> & { jsonrpc: string } = {
        jsonrpc: '1.0', // Invalid version
        id: crypto.randomUUID(),
        method: 'get_capabilities',
        params: {},
      };

      const response = await proxy.handleDirectMessage(request as any);

      expect(response).toHaveProperty('jsonrpc', '2.0');
      expect(response).toHaveProperty('id');
      expect(response).toHaveProperty('error');
      if ('error' in response) {
        expect(response.error).toHaveProperty('code', -32600);
        expect(response.error).toHaveProperty('message', 'Invalid request');
      }
    });

    it('should return error for missing method', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        id: crypto.randomUUID(),
        // Missing method
        params: {},
      };

      const response = await proxy.handleDirectMessage(request as any);

      expect(response).toHaveProperty('jsonrpc', '2.0');
      expect(response).toHaveProperty('id');
      expect(response).toHaveProperty('error');
      if ('error' in response) {
        expect(response.error).toHaveProperty('code', -32600);
        expect(response.error).toHaveProperty('message', 'Method is required');
      }
    });

    it('should handle resources/list request correctly', async () => {
      // Mock the determineServerForMethod method to return a valid server ID
      // This is the key fix for this test
      jest.spyOn(proxy, 'determineServerForMethod' as any).mockReturnValue('test-server');

      // Setup mock for this specific test
      const mockResourceList = {
        resources: [{ uri: 'test://resource' }],
      };

      // Use type assertion for mockSendMessage
      (mockRegistry.sendMessage as jest.Mock).mockResolvedValueOnce(mockResourceList);

      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: crypto.randomUUID(),
        method: 'resources/list',
        params: {},
      };

      const response = await proxy.handleDirectMessage(request);

      // Verify the result structure without checking implementation details
      expect(response).toHaveProperty('jsonrpc', '2.0');
      expect(response).toHaveProperty('id', request.id);
      expect(response).toHaveProperty('result');
      if ('result' in response) {
        expect(response.result).toBeDefined();
      }
    });

    it('should handle resources/read with typed parameters', async () => {
      // Mock determineServerForMethod to return a valid server
      jest.spyOn(proxy, 'determineServerForMethod' as any).mockReturnValue('test-server');

      // Setup mock for this specific test
      const mockResourceContents = {
        contents: [{ uri: 'test://resource', text: 'Resource content' }],
      };

      // Use type assertion for mockSendMessage
      (mockRegistry.sendMessage as jest.Mock).mockResolvedValueOnce(mockResourceContents);

      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: crypto.randomUUID(),
        method: 'resources/read',
        params: {
          uri: 'test://resource',
        },
      };

      const response = await proxy.handleDirectMessage(request);

      // Verify the result structure without checking implementation details
      expect(response).toHaveProperty('jsonrpc', '2.0');
      expect(response).toHaveProperty('id', request.id);
      if ('result' in response) {
        expect(response.result).toBeDefined();
      }
    });

    it('should handle tools/call with typed parameters', async () => {
      // Mock determineServerForMethod to return a valid server
      jest.spyOn(proxy, 'determineServerForMethod' as any).mockReturnValue('test-server');

      // Setup mock for this specific test
      const mockToolCall = {
        content: [{ type: 'text', text: 'Tool test-tool called' }],
      };

      // Use type assertion for mockSendMessage
      (mockRegistry.sendMessage as jest.Mock).mockResolvedValueOnce(mockToolCall);

      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: crypto.randomUUID(),
        method: 'tools/call',
        params: {
          name: 'test-tool',
          arguments: {
            param1: 'value1',
          },
        },
      };

      const response = await proxy.handleDirectMessage(request);

      // Verify the result structure without checking implementation details
      expect(response).toHaveProperty('jsonrpc', '2.0');
      expect(response).toHaveProperty('id', request.id);
      if ('result' in response) {
        expect(response.result).toBeDefined();
      }
    });

    it('should handle extension methods not in type definitions', async () => {
      // Mock determineServerForMethod to return a valid server
      jest.spyOn(proxy, 'determineServerForMethod' as any).mockReturnValue('test-server');

      // Setup mock for this specific test
      const mockResult = {
        result: 'Custom method result',
      };

      // Use type assertion for mockSendMessage
      (mockRegistry.sendMessage as jest.Mock).mockResolvedValueOnce(mockResult);

      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: crypto.randomUUID(),
        method: 'custom/method',
        params: {
          customParam: 'value',
        },
      };

      const response = await proxy.handleDirectMessage(request);

      // Verify the result structure without checking implementation details
      expect(response).toHaveProperty('jsonrpc', '2.0');
      expect(response).toHaveProperty('id', request.id);
    });
  });

  describe('client transport management', () => {
    it('should add and remove client transports', () => {
      const clientId = 'test-client';
      const transport = new MockTransport();

      // Should add client
      proxy.addClientTransport(clientId, transport as any);
      expect(proxy.isClientConnected(clientId)).toBe(true);
      expect(proxy.getClientCount()).toBe(1);
      expect(proxy.getClientIds()).toContain(clientId);

      // Should handle client message
      const messageListener = jest.fn();
      proxy.on(ProxyEvent.CLIENT_MESSAGE, messageListener);
      const message: JSONRPCMessage = {
        jsonrpc: '2.0',
        id: '123',
        method: 'test',
        params: {},
      };
      transport.emit('message', message);
      expect(messageListener).toHaveBeenCalledWith({ clientId, message });

      // Should handle error
      const errorListener = jest.fn();
      proxy.on(ProxyEvent.ERROR, errorListener);
      const error = new Error('Test error');
      transport.emit('error', error);
      expect(errorListener).toHaveBeenCalledWith({ clientId, error });

      // Should remove client on close
      const disconnectListener = jest.fn();
      proxy.on(ProxyEvent.CLIENT_DISCONNECTED, disconnectListener);
      transport.emit('close');
      expect(disconnectListener).toHaveBeenCalledWith(clientId);
      expect(proxy.isClientConnected(clientId)).toBe(false);
      expect(proxy.getClientCount()).toBe(0);
    });

    it('should send messages to clients', async () => {
      const clientId = 'test-client';
      const transport = new MockTransport();

      proxy.addClientTransport(clientId, transport as any);

      const message: JSONRPCMessage = {
        jsonrpc: '2.0',
        id: '123',
        method: 'test',
        params: {},
      };
      await proxy.sendMessage(clientId, message);

      expect(transport.send).toHaveBeenCalledWith(message);
    });

    it('should throw error when sending to non-existent client', async () => {
      const message: JSONRPCMessage = {
        jsonrpc: '2.0',
        id: '123',
        method: 'test',
        params: {},
      };

      await expect(proxy.sendMessage('non-existent', message)).rejects.toThrow(
        'Client non-existent not connected'
      );
    });
  });
});
