# HTTP/SSE Transport for MCP

This document describes how to use the HTTP/SSE transport implementation in Atrax for connecting MCP clients and servers.

## Overview

The Model Context Protocol (MCP) supports different transport mechanisms, including:

1. **STDIO** - For command-line tools using stdin/stdout
2. **HTTP/SSE** - For web-based clients using Server-Sent Events
3. **Docker** - For containerized MCP servers

Atrax now includes a robust implementation of HTTP/SSE transport that enables:

- HTTP-based MCP communication
- Long-lived client-server connections via Server-Sent Events (SSE)
- Enhanced error handling with detailed error reporting
- Client session management
- Cross-origin resource sharing (CORS) support

## Components

### SSEServerTransport

The `SSEServerTransport` class implements the Transport interface and provides Server-Sent Events capabilities:

- It wraps the MCP SDK's SSEServerTransport class
- Provides enhanced error handling with detailed context
- Includes client tracing via client IDs
- Validates messages before sending
- Includes extensive logging for debugging and monitoring

### HttpHandler

The `HttpHandler` in the proxy module manages:

- Client session creation and tracking
- SSE connection establishment
- Message forwarding for both SSE clients and direct API calls
- Error handling with proper JSON-RPC error responses

## Error Handling

The HTTP/SSE transport includes comprehensive error handling:

- Custom `SSETransportError` class with:
  - Original error as cause
  - HTTP status code for appropriate responses
  - Context object with additional debugging information

- JSON-RPC compliant error responses:
  - Error code between -32000 and -32099 for server errors
  - Error code -32600 for invalid requests
  - Detailed error messages in the response
  - Error data with additional context for debugging

## Usage Examples

### Running HTTP/SSE Server Example

1. Start the HTTP/SSE Echo Server:

```bash
npm run http-echo-server
```

This server will:
- Start an HTTP server on port 4001
- Expose an SSE endpoint at `/sse`
- Expose a message endpoint at `/message`
- Provide an echo tool that returns any message sent to it

2. Run the HTTP/SSE client example:

```bash
npm run http-echo-client
```

This client will:
- Connect to the server using SSE
- List available tools
- Send test messages to the echo tool
- Display the responses

## Integration with Atrax Proxy

The Atrax proxy server integrates HTTP/SSE transport by:

1. Exposing SSE endpoints for clients to connect to
2. Managing client sessions
3. Forwarding client requests to the appropriate MCP servers
4. Aggregating responses from multiple servers when needed
5. Handling error conditions with proper error responses

### Client Session Flow

When a client connects via SSE:

1. Client establishes SSE connection to `/sse` endpoint
2. Server creates a client session with a unique ID
3. Server sends the message endpoint path via an SSE event
4. Client sends JSON-RPC requests to the message endpoint
5. Server forwards requests to appropriate MCP servers
6. Server sends responses back to the client via the SSE connection

## Implementing Custom HTTP/SSE Clients

To implement a custom client using HTTP/SSE transport:

1. Use the SDK's `SSEClientTransport` to connect to the SSE endpoint
2. Create a client instance with the desired capabilities
3. Connect the client to the transport
4. Send requests and receive responses from the server

Example:

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

// Create transport to server's SSE endpoint
const transport = new SSEClientTransport(new URL('http://localhost:4000/sse'));

// Create client
const client = new Client(
  { name: 'custom-client', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// Connect to server
await client.connect(transport);

// Use tools
const tools = await client.listTools();
const result = await client.callTool({
  name: 'tool-name',
  arguments: { param: 'value' }
});

// Disconnect when done
await client.disconnect();
```

## Debugging

When troubleshooting HTTP/SSE connections:

1. Check server logs for transport errors
2. Verify proper headers are set for SSE connections
3. Ensure the client and server are using compatible MCP SDK versions
4. Check for CORS issues if connecting from a browser
5. Verify the server is sending the proper endpoint event
6. Check for proper error handling in both client and server code

## Best Practices

1. Always provide client IDs for better tracing and debugging
2. Implement timeouts for long-running operations
3. Handle connection errors gracefully
4. Follow JSON-RPC protocol specifications
5. Use proper validation before sending messages
6. Include detailed context in error messages
7. Implement reconnection logic in clients for robustness
