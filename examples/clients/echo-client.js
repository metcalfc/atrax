#!/usr/bin/env node

/**
 * Example client for the Echo Server using the MCP SDK directly
 * This demonstrates proper SDK mechanisms for client-server communication
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';
import { fileURLToPath } from 'url';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
};

// Path to the echo server
const SERVER_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../servers/scripts/echo-server'
);

/**
 * Main client function
 */
async function runClient() {
  console.log(`${colors.blue}===== Echo Server SDK Client Example =====\n${colors.reset}`);

  // Create a transport to the echo server
  console.log(`${colors.yellow}Starting echo server...${colors.reset}`);
  const transport = new StdioClientTransport({
    command: 'node',
    args: [SERVER_PATH],
  });

  // Create a client
  const client = new Client(
    {
      name: 'test-client',
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
    console.log(`${colors.green}Connected to echo server${colors.reset}\n`);

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
          message: 'Hello, Echo Server!',
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

    // Test: Echo empty message
    await runTest('Echo Empty Message', async () => {
      const result = await client.callTool({
        name: 'echo',
        arguments: {
          message: '',
        },
      });
      return result;
    });

    // Test: Echo long message
    await runTest('Echo Long Message', async () => {
      const longMessage = 'This is a very long message that repeats. '.repeat(100);
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
  } finally {
    // Disconnect from the server
    try {
      if (client.disconnect) {
        await client.disconnect();
        console.log(`${colors.yellow}Disconnected from echo server${colors.reset}`);
      }
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
  }

  console.log('');
}

// Run the client
runClient().catch(error => {
  console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
  process.exit(1);
});
