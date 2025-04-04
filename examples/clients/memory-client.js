#!/usr/bin/env node

/**
 * Example client for the Memory Server using the MCP SDK directly
 * This demonstrates proper SDK mechanisms for client-server communication
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'fs/promises';
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

// Path to the memory server
const SERVER_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../servers/scripts/memory-server'
);

// Path to the memory file
const MEMORY_FILE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../servers/memory.json'
);

/**
 * Main client function
 */
async function runClient() {
  console.log(`${colors.blue}===== Memory Server SDK Client Example =====\n${colors.reset}`);

  // Clean up any existing memory file
  try {
    await fs.unlink(MEMORY_FILE_PATH);
    console.log(`${colors.yellow}Removed previous memory file${colors.reset}\n`);
  } catch (error) {
    // File doesn't exist, which is fine
  }

  // Create a transport to the memory server
  console.log(`${colors.yellow}Starting memory server...${colors.reset}`);
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
    console.log(`${colors.green}Connected to memory server${colors.reset}\n`);

    // Test: List available tools
    await runTest('List Available Tools', async () => {
      const tools = await client.listTools();
      return tools;
    });

    // Test: Read initial empty graph
    await runTest('Read Initial Empty Graph', async () => {
      const result = await client.callTool({
        name: 'read_graph',
        arguments: {},
      });
      return result;
    });

    // Test: Create first entity
    await runTest('Create First Entity', async () => {
      const result = await client.callTool({
        name: 'create_entity',
        arguments: {
          entities: [
            {
              name: 'test_entity_1',
              entityType: 'test',
              observations: ['This is a test entity'],
            },
          ],
        },
      });
      return result;
    });

    // Test: Create second entity
    await runTest('Create Second Entity', async () => {
      const result = await client.callTool({
        name: 'create_entity',
        arguments: {
          entities: [
            {
              name: 'test_entity_2',
              entityType: 'test',
              observations: ['This is another test entity'],
            },
          ],
        },
      });
      return result;
    });

    // Test: Create relation
    await runTest('Create Relation', async () => {
      const result = await client.callTool({
        name: 'create_relation',
        arguments: {
          relations: [
            {
              from: 'test_entity_1',
              to: 'test_entity_2',
              relationType: 'is_related_to',
            },
          ],
        },
      });
      return result;
    });

    // Test: Read graph with entities and relations
    await runTest('Read Graph with Entities and Relations', async () => {
      const result = await client.callTool({
        name: 'read_graph',
        arguments: {},
      });
      return result;
    });

    // Test: Search nodes
    await runTest('Search Nodes', async () => {
      const result = await client.callTool({
        name: 'search_nodes',
        arguments: {
          query: 'test',
        },
      });
      return result;
    });
  } catch (error) {
    console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
  } finally {
    // Disconnect from the server
    try {
      if (client.disconnect) {
        await client.disconnect();
        console.log(`${colors.yellow}Disconnected from memory server${colors.reset}`);
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
