#!/usr/bin/env node

import { findAndLoadConfig } from './config/config-loader.js';
import { AtraxServer } from './server/server.js';
import { logger } from './utils/logger.js';

/**
 * Start the Atrax proxy server
 */
async function start(): Promise<void> {
  try {
    // Load configuration
    const config = await findAndLoadConfig();

    // Create and start server
    const server = new AtraxServer(config);
    await server.start();

    // Start all MCP servers
    await server.startAllServers();

    // Handle process termination
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT. Shutting down...');
      await server.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM. Shutting down...');
      await server.stop();
      process.exit(0);
    });

    logger.info('Atrax proxy server started');
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}

export { start };
