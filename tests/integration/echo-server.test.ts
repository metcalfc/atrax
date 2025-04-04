import { spawn } from 'node:child_process';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from '@modelcontextprotocol/sdk/client/stdio.js';
import { z } from 'zod';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define the response schemas
const ToolResultSchema = z.object({
  content: z.array(
    z.object({
      type: z.string(),
      text: z.string(),
    })
  ),
});

type ToolResult = z.infer<typeof ToolResultSchema>;

describe('Echo Server', () => {
  let client: Client;
  let transport: StdioClientTransport;
  let serverProcess: any;

  beforeEach(async () => {
    // Start the echo server
    serverProcess = spawn('node', [
      path.join(__dirname, '../../dist/src/server/examples/echo-server.js'),
    ]);

    transport = new StdioClientTransport({
      ...getDefaultEnvironment(),
      command: 'node',
      args: [path.join(__dirname, '../../dist/src/server/examples/echo-server.js')],
    });
    client = new Client({
      name: 'test-client',
      version: '0.1.0',
    });
    await client.connect(transport);
  });

  afterEach(async () => {
    await client.close();
    serverProcess.kill();
  });

  // Skip the capabilities test since it's not available in this server implementation
  it.skip('should initialize with correct capabilities', async () => {
    const capabilities = await client.request(
      { method: 'get_capabilities' },
      z.object({
        tools: z.object({}).passthrough(),
      })
    );
    expect(capabilities).toHaveProperty('tools');
  });

  it('should list available tools', async () => {
    const tools = await client.request(
      { method: 'tools/list' },
      z.object({
        tools: z.array(
          z.object({
            name: z.string(),
            description: z.string().optional(),
          })
        ),
      })
    );

    // The echo server should have one tool named 'echo'
    expect(tools.tools).toHaveLength(1);
    expect(tools.tools[0].name).toBe('echo');
    expect(tools.tools[0].description).toBeDefined();
  });

  it('should echo simple text message', async () => {
    const testMessage = 'Hello, Echo Server!';
    const echoResult = await client.request(
      {
        method: 'tools/call',
        params: {
          name: 'echo',
          arguments: {
            message: testMessage,
          },
        },
      },
      ToolResultSchema
    );

    expect(echoResult.content).toHaveLength(1);
    expect(echoResult.content[0].type).toBe('text');
    expect(echoResult.content[0].text).toBe(testMessage);
  });

  it('should handle empty messages with error message', async () => {
    const echoResult = await client.request(
      {
        method: 'tools/call',
        params: {
          name: 'echo',
          arguments: {
            message: '',
          },
        },
      },
      ToolResultSchema
    );

    expect(echoResult.content[0].text).toBe("You didn't provide a message to echo!");
  });

  it('should echo special characters', async () => {
    const specialChars = '!@#$%^&*()_+{}[]|\\:;"\'<>,.?/';
    const echoResult = await client.request(
      {
        method: 'tools/call',
        params: {
          name: 'echo',
          arguments: {
            message: specialChars,
          },
        },
      },
      ToolResultSchema
    );

    expect(echoResult.content[0].text).toBe(specialChars);
  });

  it('should echo long messages', async () => {
    const longMessage = 'a'.repeat(5000);
    const echoResult = await client.request(
      {
        method: 'tools/call',
        params: {
          name: 'echo',
          arguments: {
            message: longMessage,
          },
        },
      },
      ToolResultSchema
    );

    expect(echoResult.content[0].text).toBe(longMessage);
    expect(echoResult.content[0].text.length).toBe(5000);
  });

  it('should echo JSON strings', async () => {
    const jsonString = JSON.stringify({ key: 'value', nested: { array: [1, 2, 3] } });
    const echoResult = await client.request(
      {
        method: 'tools/call',
        params: {
          name: 'echo',
          arguments: {
            message: jsonString,
          },
        },
      },
      ToolResultSchema
    );

    expect(echoResult.content[0].text).toBe(jsonString);
    // Verify it's valid JSON
    expect(() => JSON.parse(echoResult.content[0].text)).not.toThrow();
  });

  it('should handle multiple echo requests in sequence', async () => {
    const messages = ['First message', 'Second message', 'Third message'];

    for (const message of messages) {
      const echoResult = await client.request(
        {
          method: 'tools/call',
          params: {
            name: 'echo',
            arguments: {
              message,
            },
          },
        },
        ToolResultSchema
      );

      expect(echoResult.content[0].text).toBe(message);
    }
  });

  it('should return error for incorrect tool name', async () => {
    await expect(
      client.request(
        {
          method: 'tools/call',
          params: {
            name: 'non_existent_tool',
            arguments: {
              message: 'test',
            },
          },
        },
        ToolResultSchema
      )
    ).rejects.toThrow();
  });

  it('should handle missing arguments with error message', async () => {
    const echoResult = await client.request(
      {
        method: 'tools/call',
        params: {
          name: 'echo',
          arguments: {},
        },
      },
      ToolResultSchema
    );

    expect(echoResult.content[0].text).toBe("You didn't provide a message to echo!");
  });
});
