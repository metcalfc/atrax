# Atrax Examples

This directory contains examples and configuration files to help you get started with Atrax.

## Directory Structure

- **servers/**: Example MCP server implementations
  - `echo-server.ts`: A simple echo server that implements a single tool
  - `http-echo-server.ts`: HTTP/SSE version of the echo server
  - `memory-server.ts`: A more complex server with knowledge graph capabilities
  - `launcher.ts`: Script to launch example servers directly
  - **scripts/**: Launcher scripts for the example servers
    - `echo-server.js`: Launcher for echo server
    - `memory-server.js`: Launcher for memory server

- **clients/**: Example MCP client implementations
  - `echo-client.js`: Client for the echo server
  - `memory-client.js`: Client for the memory server
  - `http-echo-client.js`: Client for the HTTP/SSE echo server

- **test-config.json**: Example configuration for Atrax using pre-built scripts
- **dev-config.json**: Example configuration for development mode (direct TypeScript execution)
- **atrax.config.json**: A minimal configuration template
- **inspector-config.json**: Configuration for use with MCP Inspector via SSE
- **token-middleware.js**: Express middleware for token authentication
- **token-server.js**: Custom server launcher with token authentication

## Running Examples

### Running Atrax with Example Servers

To run Atrax with the example configuration:

```bash
# Build and run with the test configuration
npm run build
node dist/src/cli.js serve -f examples/test-config.json

# Or use the npm script
npm run serve

# For development mode (direct TypeScript)
node dist/src/cli.js serve -f examples/dev-config.json

# Test with the MCP Inspector
npm run inspect
```

### Running Example Servers Directly

```bash
# Run Echo Server
npm run echo-server

# Run Memory Server
npm run memory-server

# Run HTTP Echo Server
npm run http-echo-server
```

### Running Example Clients

```bash
# Run Echo Client (automatically starts echo server)
npm run echo-client

# Run Memory Client (automatically starts memory server)
npm run memory-client

# Run HTTP Echo Client (requires HTTP server to be running)
npm run http-echo-server  # In a separate terminal
npm run http-echo-client
```

## MCP Inspector Integration

Atrax supports connecting to MCP Inspector via SSE transport with token authentication.
To run the MCP Inspector integration example:

```bash
# From the project root
./scripts/start-for-inspector.sh
```

This script will:
1. Build the project
2. Generate a unique token
3. Start the HTTP echo server on port 4001
4. Start Atrax on port 4000 with token authentication
5. Display instructions for connecting MCP Inspector

In your MCP Inspector:
- Set the transport type to "SSE"
- Set the SSE URL to: `http://localhost:4000/sse`
- Add the Authorization header: `Bearer <TOKEN>` (shown when running the script)
- Or use the token as a query parameter: `http://localhost:4000/sse?token=<TOKEN>`

## Example Servers

The included example servers demonstrate different aspects of the MCP protocol:

1. **Echo Server**: A minimal implementation to demonstrate basic functionality
   - Single tool (`echo`) that returns the input text
   - Good for testing basic connectivity

2. **HTTP Echo Server**: Same functionality as the Echo Server but using HTTP/SSE transport
   - Demonstrates HTTP and SSE communication patterns
   - Useful for testing web-based clients like the MCP Inspector

3. **Memory Server**: A more complex example with persistent storage
   - Knowledge graph with entities and relations
   - CRUD operations for graph elements
   - Search capabilities
   - Persistent storage in a JSON file

See the README in the `servers/` directory for more details on each server.

## Configuration Examples

- **test-config.json**: Uses the pre-built server scripts (suitable for production)
- **dev-config.json**: Runs the TypeScript implementations directly (for development)
- **atrax.config.json**: A minimal template for creating your own configurations
- **inspector-config.json**: Configuration specifically for MCP Inspector with token auth

## Adding Your Own Examples

To add your own example server:

1. Create a new TypeScript file in the `servers/` directory
2. Implement your MCP server using the SDK
3. Update the configuration files to include your server
4. Add a simple client or test script to demonstrate its functionality
