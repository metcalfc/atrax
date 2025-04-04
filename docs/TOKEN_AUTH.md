# Token Authentication in Atrax

This document explains how to use token authentication in Atrax.

## Configuration

To enable token authentication, modify your configuration file to include the following:

```json
{
  "port": 4000,
  "host": "localhost",
  "auth": {
    "type": "token",
    "options": {
      "token": "your-secret-token"
    }
  },
  "mcpServers": {
    // Your MCP server configurations
  }
}
```

## Running with Token Authentication

Start Atrax with your configuration file:

```bash
npx ts-node --esm src/cli.ts serve -f your-config.json
```

For security reasons, you may prefer to set the token via environment variable instead of in the config file:

```json
{
  "auth": {
    "type": "token",
    "options": {
      "token": "${MCP_TOKEN}"
    }
  }
}
```

Then run:

```bash
MCP_TOKEN=your-secret-token npx ts-node --esm src/cli.ts serve -f your-config.json
```

## Connecting to an Authenticated Server

When connecting to an Atrax server with token authentication, you need to provide the token:

### Via HTTP Bearer Authentication

```
Authorization: Bearer your-secret-token
```

### Via Query Parameter

```
http://localhost:4000/sse?token=your-secret-token
```

## Example Usage with MCP Inspector

When using MCP Inspector with a token-authenticated Atrax server:

1. Set transport type to SSE
2. Set SSE URL to: `http://localhost:4000/sse`
3. Add Authorization header: `Bearer your-secret-token`

Alternatively, you can use: `http://localhost:4000/sse?token=your-secret-token`

## Security Model

Atrax implements the following security model for endpoints:

- Public endpoints (no authentication required):
  - `/health` - Health check endpoint
  - `/status` - Server status information
  - `/auth` - Authentication endpoint (for obtaining tokens)

- Protected endpoints (require authentication):
  - `/sse` - Server-sent events endpoint for MCP communication
  - `/message` - Message endpoint for MCP
  - `/servers/*` - Server management endpoints
  - All other endpoints

- Debug endpoints:
  - `/debug/*` - Debug endpoints are only accessible in development mode
  - When `NODE_ENV=development`, these are accessible without authentication
  - In production, these endpoints are disabled completely

## Security Considerations

- Use HTTPS in production to prevent token interception
- Rotate tokens regularly
- Use environment variables instead of hardcoding tokens in config files
- Never expose development instances to the public internet
- Consider setting up OAuth2 authentication for production environments (coming soon)
