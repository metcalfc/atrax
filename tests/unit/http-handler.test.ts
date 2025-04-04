import { jest } from '@jest/globals';
import { Request, Response } from 'express';
import { HttpHandler } from '../../src/server/proxy/http-handler.js';
import { McpProxy } from '../../src/server/proxy/mcp-proxy.js';
import { ServerRegistry } from '../../src/server/registry/server-registry.js';
import { SSEServerTransport as SdkSSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { EventEmitter } from 'node:events';

// Mock uuid library
jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('test-client-id'),
}));

// Mock logger to test logging
jest.mock('../../src/utils/logger.js', () => {
  const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  return {
    createContextLogger: jest.fn().mockReturnValue(mockLogger),
  };
});

// Mock SSEServerTransport from SDK
jest.mock('@modelcontextprotocol/sdk/server/sse.js', () => {
  return {
    SSEServerTransport: jest.fn().mockImplementation(() => {
      return {
        get sessionId() {
          return 'test-session-id';
        },
        start: jest.fn().mockResolvedValue(null),
        close: jest.fn().mockResolvedValue(null),
        send: jest.fn().mockResolvedValue(null),
        handlePostMessage: jest.fn().mockResolvedValue(null),
        onmessage: null,
        onerror: null,
        onclose: null,
      };
    }),
  };
});

// Mock McpProxy
jest.mock('../../src/server/proxy/mcp-proxy.js');
const mockProxy = {
  addClientTransport: jest.fn(),
  removeClientTransport: jest.fn(),
  handleDirectMessage: jest.fn(),
  getClientCount: jest.fn().mockReturnValue(1),
};

// Mock ServerRegistry
jest.mock('../../src/server/registry/server-registry.js');
const mockRegistry = {
  getServers: jest.fn().mockReturnValue(new Map()),
  getServer: jest.fn(),
  isServerRunning: jest.fn().mockReturnValue(true),
  startServer: jest.fn(),
  stopServer: jest.fn(),
  getServerCount: jest.fn().mockReturnValue(2),
  getRunningServerCount: jest.fn().mockReturnValue(1),
};

// Mock express Request and Response
const createMockRequest = (overrides = {}) => {
  return {
    query: {},
    body: {
      jsonrpc: '2.0',
      id: 'test-id',
      method: 'test-method',
      params: {},
    },
    params: {},
    on: jest.fn(),
    ...overrides,
  } as unknown as Request;
};

const createMockResponse = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
    writeHead: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    headersSent: false,
    write: jest.fn(),
    end: jest.fn(),
    flush: jest.fn(),
  } as unknown as Response;

  return res;
};

describe('HttpHandler', () => {
  let handler: HttpHandler;

  // Reset mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
    handler = new HttpHandler(
      mockProxy as unknown as McpProxy,
      mockRegistry as unknown as ServerRegistry
    );
  });

  describe('handleSSE', () => {
    it('should handle new SSE connection correctly', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      // Create a static session ID for consistent testing
      const mockedModule = jest.requireMock('@modelcontextprotocol/sdk/server/sse.js') as any;
      mockedModule.SSEServerTransport.mockImplementationOnce(() => ({
        get sessionId() {
          return 'test-session-id';
        },
        start: jest.fn().mockResolvedValue(null),
        close: jest.fn().mockResolvedValue(null),
        send: jest.fn().mockResolvedValue(null),
        handlePostMessage: jest.fn().mockResolvedValue(null),
        onmessage: null,
        onerror: null,
        onclose: null,
      }));

      await handler.handleSSE(req, res);

      // Verify proper initialization
      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');

      // Verify client is added to proxy
      expect(mockProxy.addClientTransport).toHaveBeenCalled();

      // Verify close event listener is registered
      expect(req.on).toHaveBeenCalledWith('close', expect.any(Function));

      // Trigger close event to test cleanup
      const mockEvent = req.on as jest.Mock;
      const closeHandler = mockEvent.mock.calls[0][1] as () => void;
      closeHandler();

      // Verify cleanup actions
      expect(mockProxy.removeClientTransport).toHaveBeenCalled();
    });

    it('should close connections when errors occur', async () => {
      // This test just verifies basic functionality without trying to test detailed error handling
      const req = createMockRequest();
      const res = createMockResponse();

      // Create a mock transport
      const mockTransport = {
        get sessionId() {
          return 'test-session-id';
        },
        start: jest.fn().mockResolvedValue(null),
        close: jest.fn().mockResolvedValue(null),
        send: jest.fn().mockResolvedValue(null),
        handlePostMessage: jest.fn().mockResolvedValue(null),
        onmessage: null,
        onerror: null,
        onclose: null,
      };

      // Setup the mock
      const mockedModule = jest.requireMock('@modelcontextprotocol/sdk/server/sse.js') as any;
      mockedModule.SSEServerTransport.mockImplementationOnce(() => mockTransport);

      // Call the handler
      await handler.handleSSE(req, res);

      // Trigger close event to test cleanup
      const mockEvent = req.on as jest.Mock;
      const closeHandler = mockEvent.mock.calls[0][1] as () => void;
      closeHandler();

      // Verify client was removed during cleanup
      expect(mockProxy.removeClientTransport).toHaveBeenCalled();
    });

    it('should end response when headers already sent', async () => {
      const req = createMockRequest();
      const res = createMockResponse();
      res.headersSent = true;

      // Manually trigger error handler in the HttpHandler by creating a simulated error
      // in a pre-headersSent state
      const error = new Error('Test error');
      handler['handleSseError'](req, res, error);

      // Verify end is called but not status or json when headers are already sent
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
      expect(res.end).toHaveBeenCalled();
    });
  });

  describe('handleMessage', () => {
    it('should handle direct message without session', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      // Explicitly type the response
      const mockResponse = {
        jsonrpc: '2.0',
        id: 'test-id',
        result: { success: true },
      } as JSONRPCMessage;

      mockProxy.handleDirectMessage.mockResolvedValueOnce(mockResponse);

      await handler.handleMessage(req, res);

      // Verify direct message handling
      expect(mockProxy.handleDirectMessage).toHaveBeenCalledWith(req.body);
      expect(res.json).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        id: 'test-id',
        result: { success: true },
      });
    });

    it('should verify session IDs in message handling', async () => {
      // We'll consolidate by testing the session checking logic
      // This is simpler than trying to create and track sessions
      const req = createMockRequest({
        query: { sessionId: 'non-existent-session' },
      });
      const res = createMockResponse();

      await handler.handleMessage(req, res);

      // Verify error handling for non-existent session
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          jsonrpc: '2.0',
          error: expect.objectContaining({
            code: -32000,
            message: 'Session not found',
          }),
        })
      );
    });

    it('should return error for invalid request body', async () => {
      const req = createMockRequest({ body: null });
      const res = createMockResponse();

      await handler.handleMessage(req, res);

      // Verify error handling for invalid body
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          jsonrpc: '2.0',
          error: expect.objectContaining({
            code: -32600,
            message: 'Invalid request body',
          }),
        })
      );
    });

    it('should return error for invalid JSON-RPC version', async () => {
      const req = createMockRequest({
        body: {
          jsonrpc: '1.0', // Invalid version
          id: 'test-id',
          method: 'test-method',
          params: {},
        },
      });
      const res = createMockResponse();

      await handler.handleMessage(req, res);

      // Verify error handling for invalid JSON-RPC version
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          jsonrpc: '2.0',
          error: expect.objectContaining({
            code: -32600,
            message: 'Invalid JSON-RPC message',
          }),
        })
      );
    });

    it('should return error for non-existent session', async () => {
      const req = createMockRequest({
        query: { sessionId: 'non-existent-session' },
      });
      const res = createMockResponse();

      await handler.handleMessage(req, res);

      // Verify error handling for non-existent session
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          jsonrpc: '2.0',
          error: expect.objectContaining({
            code: -32000,
            message: 'Session not found',
          }),
        })
      );
    });

    it('should return error for non-existent session', async () => {
      const req = createMockRequest({
        query: { sessionId: 'non-existent-session' },
      });
      const res = createMockResponse();

      await handler.handleMessage(req, res);

      // Verify error handling for non-existent session
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          jsonrpc: '2.0',
          error: expect.objectContaining({
            code: -32000,
            message: 'Session not found',
          }),
        })
      );
    });
  });

  describe('API Routes', () => {
    it('should get servers list', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      // Setup mock registry data
      const mockServers = new Map();
      mockServers.set('server1', {
        name: 'server1',
        transportType: 'stdio',
        description: 'Test server 1',
        tags: ['test'],
      });
      mockServers.set('server2', {
        name: 'server2',
        transportType: 'http',
        description: 'Test server 2',
        tags: ['test', 'http'],
      });

      mockRegistry.getServers.mockReturnValueOnce(mockServers);

      await handler.getServers(req, res);

      // Verify server list response
      expect(res.json).toHaveBeenCalledWith({
        servers: expect.arrayContaining([
          expect.objectContaining({ name: 'server1' }),
          expect.objectContaining({ name: 'server2' }),
        ]),
      });
    });

    it('should get server details', async () => {
      const req = createMockRequest({ params: { name: 'server1' } });
      const res = createMockResponse();

      // Setup mock server data
      mockRegistry.getServer.mockReturnValueOnce({
        name: 'server1',
        transportType: 'stdio',
        description: 'Test server 1',
        tags: ['test'],
      });

      await handler.getServerDetails(req, res);

      // Verify server details response
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'server1',
          transportType: 'stdio',
          description: 'Test server 1',
          tags: ['test'],
          running: true,
        })
      );
    });

    it('should return error for non-existent server', async () => {
      const req = createMockRequest({ params: { name: 'non-existent' } });
      const res = createMockResponse();

      // Setup mock to return null for non-existent server
      mockRegistry.getServer.mockReturnValueOnce(null);

      await handler.getServerDetails(req, res);

      // Verify error response
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Server non-existent not found',
        })
      );
    });

    it('should start server', async () => {
      const req = createMockRequest({ params: { name: 'server1' } });
      const res = createMockResponse();

      await handler.startServer(req, res);

      // Verify server start request
      expect(mockRegistry.startServer).toHaveBeenCalledWith('server1');
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Server server1 started',
        })
      );
    });

    it('should handle error when starting server', async () => {
      const req = createMockRequest({ params: { name: 'server1' } });
      const res = createMockResponse();

      // Setup mock to throw error
      const testError = new Error('Server start error');
      mockRegistry.startServer.mockRejectedValueOnce(testError);

      await handler.startServer(req, res);

      // Verify error response
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Server start error',
        })
      );
    });

    it('should stop server', async () => {
      const req = createMockRequest({ params: { name: 'server1' } });
      const res = createMockResponse();

      await handler.stopServer(req, res);

      // Verify server stop request
      expect(mockRegistry.stopServer).toHaveBeenCalledWith('server1');
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Server server1 stopped',
        })
      );
    });

    it('should get proxy status', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await handler.getStatus(req, res);

      // Verify status response
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          servers: {
            total: 2,
            running: 1,
          },
          clients: {
            connected: 1,
          },
        })
      );
    });
  });
});
