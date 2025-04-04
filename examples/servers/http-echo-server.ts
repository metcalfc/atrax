/**
 * A simple MCP echo server using HTTP/SSE transport.
 * It implements a single tool that echoes back the input message.
 *
 * This demonstrates how to use the HTTP/SSE transport for MCP servers.
 */

import express from 'express';
import cors from 'cors';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

// Create Express app
const app = express();
app.use(cors());
app.use(express.json());

// Server port
const PORT = process.env.PORT || 4001;

// Declare transport variable in broader scope
let transport: SSEServerTransport;

/**
 * Create an MCP server with capabilities for tools (to echo messages).
 */
const server = new Server(
  {
    name: 'http-echo-server',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'echo',
        description: 'Echoes back the input message',
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
      },
    ],
  };
});

/**
 * Handler for the echo tool.
 * Simply returns the input message.
 */
server.setRequestHandler(CallToolRequestSchema, async request => {
  switch (request.params.name) {
    case 'echo': {
      const message = String(request.params.arguments?.message || '');

      if (!message) {
        return {
          content: [
            {
              type: 'text',
              text: "You didn't provide a message to echo!",
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: message,
          },
        ],
      };
    }

    default:
      throw new Error('Unknown tool');
  }
});

// Express endpoints for SSE connection
app.get('/sse', async (req, res) => {
  try {
    console.log('New SSE connection request');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Type', 'text/event-stream');
    
    // Create and start SSE transport
    transport = new SSEServerTransport('/message', res);
    await server.connect(transport);
    
    // Get the session ID from the transport
    const sessionId = transport.sessionId;
    
    // Send the message endpoint with session ID for proper association
    res.write(`event: endpoint\ndata: /message?sessionId=${sessionId}\n\n`);
    
    console.log(`SSE connection established with session ID ${sessionId}`);
  } catch (error) {
    console.error('Error establishing SSE connection:', error);
    res.status(500).end();
  }
});

// Express endpoint for receiving messages
app.post('/message', express.json(), async (req, res) => {
  try {
    const sessionId = req.query.sessionId as string;
    console.log(`Received message for session ${sessionId}:`, req.body);
    
    // Validation for session ID
    if (!sessionId) {
      console.error('Missing sessionId parameter');
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32602,
          message: 'Missing sessionId parameter',
          data: { details: 'A sessionId query parameter is required' }
        },
        id: req.body?.id || null
      });
      return;
    }
    
    // Direct handling of the Express request/response
    await transport.handlePostMessage(req, res);
    console.log(`Handled HTTP request for session ${sessionId}`);
  } catch (error) {
    console.error('Error handling HTTP request:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start the HTTP server
app.listen(PORT, () => {
  console.log(`HTTP Echo MCP server running on http://localhost:${PORT}`);
  console.log(`SSE endpoint: http://localhost:${PORT}/sse`);
  console.log(`Message endpoint: http://localhost:${PORT}/message`);
});

// Register error handler for improved debugging
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});