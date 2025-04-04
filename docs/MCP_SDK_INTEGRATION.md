# MCP SDK Integration Guidelines

## Overview

Proper integration with the Model Context Protocol (MCP) SDK is critical for the Atrax proxy to maintain protocol compliance. This document outlines best practices and common pitfalls when working with the MCP TypeScript SDK.

## Core SDK Components

### Transport Layer

The SDK provides transport implementations for various communication methods:

- `StdioServerTransport`: For command-line tools using stdin/stdout
- `SSEServerTransport`: For HTTP servers using Server-Sent Events
- `StdioClientTransport`: Client transport for stdio communication
- `FetchClientTransport`: Client transport for HTTP communication

Always use these transport classes instead of creating custom implementations.

### Message Handling

The SDK provides buffer management and message parsing utilities:

- `ReadBuffer`: Handles message boundaries and parsing
- `serializeMessage`: Properly formats messages according to the protocol

Example of correct usage:

```typescript
import { serializeMessage } from "@modelcontextprotocol/sdk/lib/message.js";

// Correctly format a message
const message = serializeMessage({
  jsonrpc: "2.0",
  id: crypto.randomUUID(),
  method: "tools/list",
  params: {}
});
```

### Server and Client Classes

The SDK provides high-level abstractions:

- `Server`: Base server implementation
- `McpServer`: Higher-level server with simplified API
- `Client`: Client implementation for connecting to MCP servers

## Protocol Compliance Checklist

When implementing any component that interacts with the MCP protocol:

### Message Formatting

- [ ] Include `jsonrpc: "2.0"` in every message
- [ ] Generate unique IDs with `crypto.randomUUID()`
- [ ] Include the appropriate method and parameters
- [ ] Use `serializeMessage` for message formatting

### Transport Layer

- [ ] Use SDK transport classes
- [ ] Handle connection lifecycle events correctly
- [ ] Ensure proper line-delimited message parsing for stdio
- [ ] Add explicit error handling

### Request Handlers

- [ ] Validate request parameters
- [ ] Return responses with the correct structure
- [ ] Include appropriate error handling
- [ ] Match request IDs in responses

## Common Pitfalls

### Custom Message Parsing

**Problem**: Implementing custom message parsing instead of using the SDK's buffer management.

**Correct Approach**:
```typescript
import { ReadBuffer } from "@modelcontextprotocol/sdk/lib/buffer.js";

const buffer = new ReadBuffer();
buffer.append(data);

while (buffer.hasMessage()) {
  const message = buffer.readMessage();
  // Process message
}
```

### Direct JSON Serialization

**Problem**: Directly serializing JSON without proper protocol formatting.

**Correct Approach**:
```typescript
import { serializeMessage } from "@modelcontextprotocol/sdk/lib/message.js";

const message = serializeMessage({
  jsonrpc: "2.0",
  id: crypto.randomUUID(),
  method: "resources/list",
  params: {}
});
```

### Missing JSON-RPC Fields

**Problem**: Omitting required JSON-RPC fields like `jsonrpc`, `id`, or `method`.

**Correct Approach**: Always include all required fields:
```typescript
{
  jsonrpc: "2.0",
  id: crypto.randomUUID(),
  method: "tools/call",
  params: {
    name: "example",
    arguments: {}
  }
}
```

### Improper Message Boundaries

**Problem**: Not handling message boundaries correctly for line-delimited protocols.

**Correct Approach**: Always append a newline character and use the SDK's buffer management:
```typescript
// When sending a message
transport.send(serializeMessage(message) + "\n");

// When receiving messages
const buffer = new ReadBuffer();
buffer.append(data);
while (buffer.hasMessage()) {
  processMessage(buffer.readMessage());
}
```

## Proxy-Specific Considerations

When implementing the Atrax proxy:

### Request Forwarding

- Preserve the original request ID when forwarding to maintain the request-response relationship
- Add context to forwarded requests to track which server the request was sent to
- Handle timeout scenarios for unresponsive servers

### Response Aggregation

- Merge responses from multiple servers when appropriate (e.g., for list operations)
- Apply configured conflict resolution strategies for overlapping resources
- Maintain the original request ID in aggregated responses

### Prompt Handling

When implementing prompt handlers (`prompts/get`):

- The request parameter is `name`, not `id`: `request.params.name`
- Return response format must follow this structure:
  ```typescript
  {
    description: "Optional description of the prompt",
    messages: [
      {
        role: "assistant" | "user",
        content: {
          type: "text",
          text: "Message content"
        }
      }
      // Additional messages...
    ]
  }
  ```
- Error responses should use this format:
  ```typescript
  {
    error: {
      message: "Error message",
      code: 404  // Appropriate error code
    }
  }
  ```

### Error Handling

- Gracefully handle scenarios where some servers respond and others don't
- Provide informative error messages that indicate which server(s) failed
- Implement fallbacks where appropriate

## Testing Protocol Compliance

- Use the MCP Inspector for compatibility testing
- Create mock MCP servers for testing complex scenarios
- Test all transport types (stdio, HTTP, Docker)
- Verify all message types and their formatting

## Resources

- [MCP TypeScript SDK Repository](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP Specification](https://spec.modelcontextprotocol.io)
- [MCP Inspector](https://github.com/modelcontextprotocol/inspector)
