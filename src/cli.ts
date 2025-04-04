#!/usr/bin/env node

import { program } from 'commander';
import { loadConfig } from './config/config-loader.js';
import { createContextLogger } from './utils/logger.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import { McpServerEvent } from './server/mcp/mcp-server.js';
import { AtraxConfig } from './types/config.js';
import { ServerRegistry } from './server/registry/server-registry.js';
import { ResourceConflictStrategy } from './server/mcp/types.js';
import { McpServer } from './server/mcp/mcp-server.js';
import { AtraxServer } from './server/server.js';

const logger = createContextLogger('CLI');

/**
 * Run the HTTP server (only)
 *
 * @param configPath - Path to configuration file
 */
async function serveHttp(configPath: string): Promise<void> {
  try {
    logger.info(`Loading configuration from ${configPath}`);
    // Load configuration
    const config = await loadConfig(configPath);

    // Override port from environment if provided
    if (process.env.PORT) {
      const port = parseInt(process.env.PORT, 10);
      if (!isNaN(port)) {
        config.port = port;
        logger.info(`Using port ${port} from environment variable`);
      }
    }

    // Create and start server
    const server = new AtraxServer(config);
    await server.start();

    // Start all MCP servers
    await server.startAllServers();

    // Keep the process running
    process.on('SIGINT', async () => {
      logger.info('Shutting down HTTP server...');
      await server.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Shutting down HTTP server...');
      await server.stop();
      process.exit(0);
    });
  } catch (error) {
    logger.error('Failed to start HTTP server:', error);
    process.exit(1);
  }
}

/**
 * Generate a default configuration file
 *
 * @param outputPath - Path to output file
 */
async function generateConfig(outputPath: string): Promise<void> {
  try {
    const defaultConfig = {
      port: 3000,
      host: 'localhost',
      auth: {
        type: 'none',
      },
      mcpServers: {
        example: {
          transportType: 'stdio',
          command: 'echo',
          args: ['{"jsonrpc":"2.0","id":"1","result":"Hello from Example MCP Server"}'],
          description: 'Example MCP server',
          tags: ['example'],
        },
      },
    };

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    await fs.mkdir(outputDir, { recursive: true });

    // Write configuration file
    await fs.writeFile(outputPath, JSON.stringify(defaultConfig, null, 2));

    logger.info(`Generated configuration file at ${outputPath}`);
  } catch (error) {
    logger.error('Failed to generate configuration:', error);
    process.exit(1);
  }
}

// Set up command-line interface
program.name('atrax').description('Atrax - MCP Proxy Server').version('0.1.0');

program
  .command('serve')
  .description('Run the HTTP server')
  .option('-c, --config <path>', 'Path to configuration file', 'atrax.config.json')
  .option('-f, --file <path>', 'Alternative path to configuration file')
  .option('-p, --port <number>', 'Override port from configuration')
  .action(options => {
    // Set PORT environment variable if provided via command line
    if (options.port) {
      process.env.PORT = options.port;
    }
    serveHttp(options.file || options.config);
  });

program
  .command('generate-config')
  .description('Generate a default configuration file')
  .option('-o, --output <path>', 'Output path for configuration file', 'atrax.config.json')
  .action(options => {
    generateConfig(options.output);
  });

program
  .command('serve:mcp')
  .description('WARNING: Insecure! Run as an MCP server on stdio (for development only)')
  .action(() => {
    logger.error('SECURITY WARNING: Running as an MCP server on stdio is insecure!');
    logger.error('This command is only for testing and development.');
    logger.error('For production use, use the "serve" command instead, which exposes');
    logger.error('the MCP functionality via a secure HTTP server.');
    process.exit(1);
  });

// Parse command-line arguments
program.parse();
