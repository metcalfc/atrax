# MCP Client Examples

These examples demonstrate how to create clients that interact with MCP servers using the SDK. They serve as both functional examples and as development tools.

## Available Clients

- `echo-client.js`: Client for the Echo server, demonstrates basic tool calling
- `memory-client.js`: Client for the Memory server, demonstrates more complex tool interactions
- `http-echo-client.js`: Client for the HTTP Echo server, demonstrates HTTP/SSE transport

## How to Run

From the project root directory:

```bash
# Make scripts executable
chmod +x examples/clients/*.js

# Run echo client
node examples/clients/echo-client.js

# Run memory client
node examples/clients/memory-client.js

# Run HTTP echo client (requires starting the HTTP server separately)
npm run http-echo-server  # In a separate terminal
node examples/clients/http-echo-client.js
```

## What These Examples Demonstrate

These clients show:

1. How to properly set up an MCP client using the SDK
2. How to establish connections using different transports:
   - StdioClientTransport for stdio-based servers
   - SSEClientTransport for HTTP/SSE-based servers
3. How to call tools with proper JSON-RPC formatting
4. How to handle responses and errors

## Notes

- These clients use the proper MCP SDK abstractions
- They're useful for both testing and as examples for implementers
- The clients reference server scripts in the `examples/servers/scripts` directory
