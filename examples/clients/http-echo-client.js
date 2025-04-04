#!/usr/bin/env node

/**
 * Example client for the HTTP Echo Server using HTTP/SSE transport
 * This demonstrates how to use the SSEClientTransport from the MCP SDK
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
};

// Server URL - this should match the HTTP server port in http-echo-server.ts
const SERVER_URL = new URL('http://localhost:4001/sse');

/**
 * Main client function
 */
async function runClient() {
  console.log(`${colors.blue}===== HTTP/SSE Echo Server Client Example =====\n${colors.reset}`);

  // Create a transport to the echo server using SSE
  console.log(`${colors.yellow}Connecting to echo server at ${SERVER_URL}...${colors.reset}`);
  const transport = new SSEClientTransport(SERVER_URL);

  // Handle transport errors
  transport.onerror = (error) => {
    console.error(`${colors.red}Transport error: ${error.message}${colors.reset}`);
  };

  // Create a client
  const client = new Client(
    {
      name: 'http-echo-client',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  try {
    // Connect to the server
    await client.connect(transport);
    console.log(`${colors.green}Connected to HTTP/SSE echo server${colors.reset}\n`);

    // Test: List available tools
    await runTest('List Available Tools', async () => {
      const tools = await client.listTools();
      return tools;
    });

    // Test: Echo basic message
    await runTest('Echo Basic Message', async () => {
      const result = await client.callTool({
        name: 'echo',
        arguments: {
          message: 'Hello, HTTP Echo Server!',
        },
      });
      return result;
    });

    // Test: Echo special characters
    await runTest('Echo Special Characters', async () => {
      const result = await client.callTool({
        name: 'echo',
        arguments: {
          message: '!@#$%^&*()_+{}[]|\\:;"\'<>,.?/',
        },
      });
      return result;
    });

    // Test: Echo long message
    await runTest('Echo Long Message', async () => {
      const longMessage = 'This is a very long message that repeats. '.repeat(20);
      const result = await client.callTool({
        name: 'echo',
        arguments: {
          message: longMessage,
        },
      });
      return {
        content: [
          {
            type: result.content[0].type,
            text: `${result.content[0].text.substring(0, 50)}... (${
              result.content[0].text.length
            } characters)`,
          },
        ],
      };
    });
  } catch (error) {
    console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
    if (error.stack) {
      console.error(`${colors.red}Stack trace: ${error.stack}${colors.reset}`);
    }
  } finally {
    // Disconnect from the server
    try {
      await client.disconnect();
      console.log(`${colors.yellow}Disconnected from HTTP/SSE echo server${colors.reset}`);
    } catch (error) {
      console.error(`${colors.red}Error disconnecting: ${error.message}${colors.reset}`);
    }
  }

  console.log(`\n${colors.blue}===== Client Example Completed =====\n${colors.reset}`);
}

/**
 * Helper function to run a test and display results
 */
async function runTest(testName, testFn) {
  console.log(`${colors.yellow}Test: ${testName}${colors.reset}`);

  try {
    const result = await testFn();
    console.log(`${colors.green}Result:${colors.reset}`);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
    console.error(`${colors.red}Stack: ${error.stack}${colors.reset}`);
  }

  console.log('');
}

// Run the client
runClient().catch(error => {
  console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
  console.error(`${colors.red}Stack: ${error.stack}${colors.reset}`);
  process.exit(1);
});
