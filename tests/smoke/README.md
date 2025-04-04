# Atrax Smoke Tests

These are quick smoke tests for the example MCP servers provided with Atrax. They're designed to be run directly from the command line for rapid verification of functionality.

## Available Tests

- `test-echo-server.sh`: Tests the basic Echo server functionality
- `test-memory-server.sh`: Tests the Memory server functionality with creating entities, relations, and searching

## How to Run

From the `tests/smoke` directory:

```bash
# Make tests executable (if needed)
chmod +x *.sh

# Run echo server test
./test-echo-server.sh

# Run memory server test
./test-memory-server.sh
```

## What These Tests Verify

These tests send raw JSON-RPC messages directly to the servers using their stdio interface and verify that:

1. The servers are properly running
2. They can receive and process JSON-RPC messages
3. They return expected responses
4. The basic functionality works as expected

## Notes

- These tests are for quick verification only and don't replace the full Jest test suite
- They're useful for checking server behavior directly without the Jest framework
- The tests assume the example servers are in the path or accessible via the relative paths
