# Example MCP Servers

This directory contains example MCP server implementations that can be used for testing and demonstrating Atrax functionality.

## Available Servers

### Echo Server

A minimal MCP server that implements a single tool to echo back messages. This server is useful for basic testing and demonstrations.

- **File**: `echo-server.ts`
- **Features**: Single echo tool

### Memory Server

A more complex MCP server that implements a knowledge graph with entity and relation storage. This server demonstrates a more realistic use case with persistent storage and multiple tools.

- **File**: `memory-server.ts`
- **Features**:
  - Entity and relation storage
  - Persistent storage in a JSON file
  - CRUD operations for entities, relations, and observations
  - Search functionality

## Running the Servers

You can run these servers directly with ts-node:

```bash
# Run the Echo server
ts-node --esm echo-server.ts

# Run the Memory server
ts-node --esm memory-server.ts

# Or use the launcher script
ts-node --esm launcher.ts echo
ts-node --esm launcher.ts memory
```

## Environment Variables

### Memory Server

- `MEMORY_FILE_PATH`: Path to the JSON file for persistent storage. Defaults to `memory.json` in the same directory.

## Using with Atrax

These servers can be used with Atrax by including them in your Atrax configuration:

```json
{
  "servers": [
    {
      "name": "echo",
      "type": "process",
      "command": "ts-node",
      "args": ["--esm", "examples/servers/echo-server.ts"]
    },
    {
      "name": "memory",
      "type": "process",
      "command": "ts-node",
      "args": ["--esm", "examples/servers/memory-server.ts"]
    }
  ]
}
```

## Using as Reference

These servers can also serve as reference implementations when building your own MCP servers. They demonstrate:

1. Setting up an MCP server with the SDK
2. Defining and implementing tools
3. Handling request validation
4. Using the stdio transport
5. Implementing resources and prompts with correct response formats

## Prompt Handling

The servers demonstrate the correct implementation of prompt handlers:

```typescript
// Handler for getting a specific prompt
server.setRequestHandler(GetPromptRequestSchema, async request => {
  // The parameter is 'name', not 'id'
  if (request.params.name === 'prompt-name') {
    return {
      // Note this is the direct return format, not wrapped in a 'prompt' object
      description: 'Description of the prompt',
      messages: [
        {
          role: 'assistant', // or 'user'
          content: {
            type: 'text',
            text: 'The content of the prompt message'
          }
        }
        // Can include multiple messages to create a conversation
      ]
    };
  }

  // Error format for prompts not found
  return {
    error: {
      message: `Prompt not found: ${request.params.name}`,
      code: 404
    }
  };
});
