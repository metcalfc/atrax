# Understanding SSE Session Management in Atrax

This document explains how session management works for Server-Sent Events (SSE) connections in Atrax.

## Session Flow

1. **Client Connects**: When a client connects to the `/sse` endpoint, the server:
   - Creates a unique session ID 
   - Sends an "endpoint" event with the message endpoint URL including the session ID
   - Stores the session information in a session map

2. **Message Handling**: When the client sends a message to the `/message` endpoint:
   - It includes the session ID as a query parameter
   - The server looks up the session by ID
   - Processes the message and sends a response
   - Maintains the long-lived SSE connection for future messages

3. **Connection Termination**: When the client disconnects:
   - The server detects the closed connection
   - Removes the session from the session map
   - Cleans up any associated resources

## Session Storage

Sessions are stored in `app.locals.sessions`, which is a Map where:
- Key: Session ID (string)
- Value: Session object containing:
  - `res`: The Express response object for the SSE connection
  - `messageHandler`: Function to send messages to the client

## SSE Connection Format

The SSE connection sends these events:

1. **Endpoint Event**: Sent when the connection is established
   ```
   event: endpoint
   data: /message?sessionId=<SESSION_ID>
   ```

2. **Data Events**: Sent in response to client requests
   ```
   data: {"jsonrpc":"2.0","result":{...},"id":1}
   ```

3. **Keep-alive Pings**: Sent every 30 seconds to maintain the connection
   ```
   : ping
   ```

## Practical Example

When the MCP Inspector connects:

1. It establishes an SSE connection to `/sse`
2. It receives the endpoint URL with session ID
3. It sends JSON-RPC messages to that endpoint
4. The server processes messages and sends responses via the SSE connection

This session management ensures that:
- Each client has a unique session
- Messages are routed to the correct client
- Resources are properly cleaned up when clients disconnect