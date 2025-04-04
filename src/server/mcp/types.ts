/**
 * Types and interfaces for the MCP server implementation
 */

import { McpServerConfig } from '../../types/config.js';

/**
 * Client identifier type
 */
export type ClientId = string;

/**
 * Resource information from an MCP server
 */
export interface McpResource {
  /** Unique resource URI */
  uri: string;
  /** Resource name */
  name: string;
  /** Server that provides this resource */
  serverName: string;
  /** Optional description */
  description?: string;
  /** Optional MIME type */
  mimeType?: string;
  /** Optional metadata */
  metadata?: Record<string, any>;
}

/**
 * Tool information from an MCP server
 */
export interface McpTool {
  /** Tool name */
  name: string;
  /** Server that provides this tool */
  serverName: string;
  /** Tool description */
  description?: string;
  /** Input schema (JSON Schema) */
  inputSchema?: Record<string, any>;
  /** Optional metadata */
  metadata?: Record<string, any>;
}

/**
 * Prompt information from an MCP server
 */
export interface McpPrompt {
  /** Prompt name */
  name: string;
  /** Server that provides this prompt */
  serverName: string;
  /** Prompt description */
  description?: string;
  /** Input schema (JSON Schema) */
  inputSchema?: Record<string, any>;
  /** Optional metadata */
  metadata?: Record<string, any>;
}

/**
 * Resource conflict resolution strategies
 */
export enum ResourceConflictStrategy {
  /** Use the first resource found (default) */
  FIRST_WINS = 'first-wins',
  /** Use the last resource found */
  LAST_WINS = 'last-wins',
  /** Prefer resources from a specific server */
  PREFER_SERVER = 'prefer-server',
  /** Rename conflicting resources */
  RENAME = 'rename',
  /** Reject conflicting resources */
  REJECT = 'reject',
}

/**
 * Resource conflict resolution configuration
 */
export interface ResourceConflictConfig {
  /** Resolution strategy */
  strategy: ResourceConflictStrategy;
  /** Preferred server name (when using PREFER_SERVER strategy) */
  preferredServer?: string;
}

/**
 * Aggregated MCP server configuration
 */
export interface AggregatedMcpConfig {
  /** Resource conflict resolution strategy */
  resourceConflict: ResourceConflictConfig;
  /** Map of server names to server configurations */
  servers: Record<string, McpServerConfig>;
}
