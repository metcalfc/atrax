#!/usr/bin/env node

// This is a standalone wrapper script for the memory-server
// It runs the memory-server directly without requiring npm run
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execPath } from 'node:process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(dirname(dirname(dirname(__dirname))));

// Use the compiled JS file instead of ts-node with TS file
const nodeExecutable = execPath;
const serverScript = join(rootDir, 'dist', 'examples', 'servers', 'memory-server.js');

// CRITICAL: We write this to stderr, not stdout, to avoid interfering with MCP JSON-RPC protocol
console.error(`Starting memory-server from ${serverScript}`);

// For MCP, we need to pass stdin/stdout directly so we use 'inherit'
// This makes the child process connect directly to parent's stdio
const serverProcess = spawn(nodeExecutable, [serverScript], {
  stdio: 'inherit', // This makes Atrax → child_process → memory-server work correctly
  shell: true // Use shell for cross-platform compatibility
});

serverProcess.on('error', err => {
  console.error('Failed to start memory-server:', err);
});

serverProcess.on('exit', code => {
  if (code !== 0) {
    console.error(`memory-server exited with code ${code}`);
  }
});