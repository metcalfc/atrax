// Jest setup file for ESM projects
import { TextEncoder, TextDecoder } from 'util';

// Set up global TextEncoder and TextDecoder for Node.js environments
// These are needed for some MCP SDK functionality
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
