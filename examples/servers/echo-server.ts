/**
 * A simple MCP echo server that repeats back whatever it is prompted for testing.
 * It implements a single tool that echoes back the input message.
 *
 * This is an example implementation to demonstrate basic MCP server functionality
 * and for use in testing Atrax's proxy capabilities.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

/**
 * Create an MCP server with capabilities for tools, resources, and prompts.
 */
const server = new Server(
  {
    name: 'echo-server',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
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

/**
 * Handler for listing resources
 */
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'echo://sample-resource',
        name: 'Sample Echo Resource',
        description: 'A sample resource provided by the echo server',
        mimeType: 'text/plain',
      }
    ]
  };
});

/**
 * Handler for reading resources
 */
server.setRequestHandler(ReadResourceRequestSchema, async request => {
  if (request.params.uri === 'echo://sample-resource') {
    return {
      contents: [
        {
          uri: 'echo://sample-resource',
          mimeType: 'text/plain',
          text: 'Hello World from Echo Server Resource!',
        }
      ]
    };
  }

  return {
    error: {
      code: -32601, // MethodNotFound error code per MCP protocol
      message: `Resource not found: ${request.params.uri}`
    }
  };
});

/**
 * Handler for listing prompts
 */
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        id: 'echo-greeting',
        name: 'echo-greeting', // Important: The ID must match the name for MCP Inspector
        description: 'A sample greeting prompt from the echo server',
      }
    ]
  };
});

/**
 * Handler for getting a specific prompt
 */
server.setRequestHandler(GetPromptRequestSchema, async request => {
  // Check if name is missing
  if (!request.params.name) {
    // Return properly formatted error
    return {
      error: {
        message: "Prompt name is required",
        code: -32602 // InvalidParams error code per MCP protocol
      }
    };
  }

  // Handle specific prompt names
  if (request.params.name === 'echo-greeting') {
    // Return format follows the MCP protocol for prompts/get
    return {
      description: 'A sample greeting prompt from the echo server',
      messages: [
        {
          role: 'assistant',
          content: {
            type: 'text',
            text: 'Hello, this is the echo server. How can I assist you today?'
          }
        }
      ]
    };
  }

  // Return properly formatted error for invalid prompt names
  return {
    error: {
      message: `Prompt not found: ${request.params.name}`,
      code: -32601 // MethodNotFound error code per MCP protocol
    }
  };
});

// Note: The get_capabilities handler is automatically provided by the MCP SDK
// based on the capabilities we defined in the server constructor

// Register error handler for improved debugging
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

/**
 * Start the server using stdio transport.
 * This allows the server to communicate via standard input/output streams.
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Echo MCP server running on stdio');
}

main().catch(error => {
  console.error('Server error:', error);
  process.exit(1);
});
