# Atrax: MCP Server Aggregation Proxy

[![pre-commit](https://img.shields.io/badge/pre--commit-enabled-brightgreen?logo=pre-commit)](https://github.com/pre-commit/pre-commit)

Atrax is a proxy for Model Context Protocol (MCP) servers that aggregates multiple MCP servers and presents them as a single unified interface. The name comes from the funnel-web spider, reflecting how it funnels resources from multiple servers into one.

## Features

- **Resource Aggregation**: Combine resources from multiple servers with configurable conflict resolution
- **Transparent Proxying**: Present a unified MCP server interface to clients
- **Protocol Compliance**: Strict adherence to the MCP protocol specification
- **Modular Design**: Clear separation of concerns between components
- **Multiple Transport Types**: Support for STDIO, HTTP/SSE, and Docker transports
- **Enhanced Error Handling**: Detailed error reporting with contextual information
- **Web Integration**: HTTP/SSE transport for browser and web-based clients
- **Authentication Support**: Token-based authentication for securing server access

## Quick Start

```bash
# Clone the repository
git clone https://github.com/yourusername/atrax.git
cd atrax

# Setup development environment
direnv allow  # Sets up Python venv and pre-commit
npm install

# Build the project
npm run build

# Run the server (no authentication)
npm run serve

# Run with token authentication
npm run serve:auth

# Run smoke tests
npm run test:smoke
```

## Documentation Map

- **[DEVELOPMENT.md](./docs/DEVELOPMENT.md)**: Development environment setup and workflow
- **[GUIDELINES.md](./docs/GUIDELINES.md)**: Project guidelines and coding standards
- **[MCP_SDK_INTEGRATION.md](./docs/MCP_SDK_INTEGRATION.md)**: MCP SDK integration guide
- **[HTTP_SSE_TRANSPORT.md](./docs/HTTP_SSE_TRANSPORT.md)**: HTTP/SSE transport implementation and usage
- **[TOKEN_AUTH.md](./docs/TOKEN_AUTH.md)**: Token authentication guide and usage
- **[DIRENV.md](./docs/DIRENV.md)**: Using direnv for environment management
- **[CLAUDE.md](./CLAUDE.md)**: Quick reference for common commands

## Examples

The `examples/` directory contains example server implementations:
- Memory server: A simple MCP server that stores a knowledge graph in memory
- Echo server: A basic MCP server that echoes back requests
- HTTP Echo server: An MCP server that uses HTTP/SSE transport to communicate

Run examples with:
```bash
# STDIO-based servers
npm run memory-server
npm run echo-server

# HTTP/SSE-based server
npm run http-echo-server

# Client examples
npm run echo-client      # Connect to STDIO Echo server
npm run memory-client    # Connect to STDIO Memory server  
npm run http-echo-client # Connect to HTTP/SSE Echo server
```

## License

MIT
