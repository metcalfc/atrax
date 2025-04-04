# MCP SSE Protocol Troubleshooting

This document explains the troubleshooting process for HTTP/SSE transport protocol issues with the MCP Inspector, and provides guidance on using our standard-compliant implementation.

## Protocol Issues Identified

After reviewing our custom implementation of the MCP Server-Sent Events (SSE) transport, we identified several areas where our implementation may differ from the standard MCP SDK, potentially causing compatibility issues:

1. **Session ID Handling**:
   - Our custom implementation uses a different approach to session ID generation and management compared to the official SDK.
   - In the `HttpHandler` class, we generate UUIDs, while the SDK has its own session ID generation mechanism.

2. **Event Formatting**:
   - The format of the `endpoint` event and its data differs between implementations.
   - Our implementation sends just the path (`/message`), while the SDK includes the session ID parameter.

3. **Transport Wrapper**:
   - Our `SSEServerTransport` class wraps the SDK's transport, adding extra validation and error handling.
   - This introduces an additional layer that may behave differently than expected by clients.

4. **Error Response Handling**:
   - Our custom `SSETransportError` class may format errors differently than the SDK expects.
   - JSON-RPC error responses might have different codes or structures.

5. **Connection Management**:
   - The connection lifecycle in our implementation includes additional session tracking.
   - We may be missing standard protocol behaviors expected by the MCP Inspector.

## Solution: SDK-Based Implementation

To address these issues, we've created a direct SDK-based implementation that follows the official MCP protocol standards:

1. Uses the SDK's `SSEServerTransport` class directly
2. Follows standard event formatting
3. Includes proper session management
4. Maintains compatibility with the MCP Inspector

## Testing with the SDK-Based Server

We've created scripts to test our theory that protocol differences are causing the incompatibility issues:

1. **`scripts/start-sdk-server.sh`**:
   - Launches a server using the MCP SDK directly
   - Implements a simple echo tool for testing
   - Includes proper authorization with bearer tokens
   - Provides debug endpoints for troubleshooting

2. **`scripts/test-with-inspector.sh`**:
   - Automatically starts the SDK server
   - Gets the authentication token
   - Launches the MCP Inspector with the correct environment variables

## Usage

To test with the MCP Inspector using our SDK-based implementation:

```bash
# Run the SDK server with Inspector test
npm run test:inspector

# Or run just the SDK server
npm run sdk-server
```

You can also use the debug test page at http://localhost:4002/debug/test to verify that the SSE connection, session management, and tool calling work correctly.

## Key Differences in SDK-Based Implementation

The SDK-based implementation differs from our custom implementation in the following ways:

1. **Session Handling**:
   - Uses the SDK's `SSEServerTransport` for session ID generation
   - Passes the session ID in the endpoint event data: `/message?sessionId=SESSION_ID`

2. **Event Formatting**:
   - Sends properly formatted SSE events: `event: endpoint\ndata: /message?sessionId=SESSION_ID\n\n`
   - Ensures proper event parsing by clients

3. **Transport Direct Usage**:
   - Uses the SDK's transport classes directly with no wrappers
   - Maintains compatibility with SDK clients like the MCP Inspector

4. **Error Handling**:
   - Uses standard JSON-RPC error codes and formats
   - Follows the MCP protocol specification for error responses

## Recommendations

For future development, we recommend:

1. Adapt our custom implementation to match the SDK's behavior more closely
2. Refactor our `SSEServerTransport` wrapper to ensure it maintains full compatibility
3. Standardize the session ID handling to match the SDK
4. Update our event formatting to follow the SDK's format
5. Consider simply using the SDK's transport classes directly where possible

## Protocol Flow with MCP Inspector

The correct protocol flow with MCP Inspector should follow these steps:

1. Client connects to the SSE endpoint
2. Server sends `endpoint` event with session ID
3. Client sends `mcp.initialize` message to the provided endpoint
4. Server responds with initialization confirmation
5. Client sends `mcp.listTools` message
6. Server responds with available tools
7. Client calls tools as needed

Our SDK-based implementation ensures this flow works correctly, allowing for proper testing with the MCP Inspector.