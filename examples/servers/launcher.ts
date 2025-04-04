/**
 * Launcher for example MCP servers.
 * This script can launch both the echo and memory servers.
 *
 * Usage:
 *   ts-node --esm launcher.ts echo
 *   ts-node --esm launcher.ts memory
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serverMap = {
  echo: path.join(__dirname, 'echo-server.ts'),
  memory: path.join(__dirname, 'memory-server.ts'),
};

async function main() {
  const serverType = process.argv[2];

  if (!serverType || !['echo', 'memory'].includes(serverType)) {
    console.error('Please specify a valid server type: echo or memory');
    process.exit(1);
  }

  // Use type assertion to tell TypeScript that serverType is a valid key
  const serverPath = serverMap[serverType as keyof typeof serverMap];

  console.log(`Launching ${serverType} server from ${serverPath}`);

  // Run the specified server
  const server = spawn('ts-node', ['--esm', serverPath], {
    stdio: 'inherit',
  });

  server.on('error', err => {
    console.error(`Failed to start ${serverType} server:`, err);
    process.exit(1);
  });

  server.on('exit', code => {
    if (code !== 0) {
      console.error(`${serverType} server exited with code ${code}`);
      process.exit(code);
    }
  });
}

main().catch(error => {
  console.error('Error running launcher:', error);
  process.exit(1);
});
