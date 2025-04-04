/**
 * Type definitions for the Model Context Protocol (MCP)
 * Includes both standard types from the SDK and additional types needed for Atrax
 */

import {
  JSONRPCMessage,
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCNotification
} from '@modelcontextprotocol/sdk/types.js';

/**
 * Standard MCP resource type
 */
export interface McpResource {
  uri: string;
  text: string;
  binary?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Standard MCP tool result
 */
export interface McpToolResult {
  content: Array<{
    type: string;
    text?: string;
    binary?: string;
    [key: string]: unknown;
  }>;
  isError?: boolean;
}

/**
 * Standard MCP resource list result
 */
export interface McpResourceList {
  resources: Array<{
    uri: string;
    type?: string;
    metadata?: Record<string, unknown>;
  }>;
}

/**
 * Define JSON-RPC error object structure (not exported by SDK)
 */
export interface JSONRPCErrorData {
  details?: string;
  serverInfo?: { name: string; version: string };
  [key: string]: unknown;
}

/**
 * JSON-RPC error response object
 */
export interface JSONRPCErrorObject {
  jsonrpc: '2.0';
  id: string | number | null;
  error: {
    code: number;
    message: string;
    data?: JSONRPCErrorData;
  };
}

/**
 * MCP capabilities structure
 */
export interface McpCapabilities {
  core: {
    get_capabilities: Record<string, unknown>;
  };
  resources?: {
    list: Record<string, unknown>;
    read: Record<string, unknown>;
    list_changed: Record<string, unknown>;
  };
  tools?: {
    list: Record<string, unknown>;
    call: Record<string, unknown>;
    list_changed: Record<string, unknown>;
  };
  prompts?: {
    list: Record<string, unknown>;
    get: Record<string, unknown>;
    list_changed: Record<string, unknown>;
  };
  [key: string]: unknown; // Allow for extension capabilities
}

/**
 * Parameter types for each MCP method
 */
export type ResourceListParams = Record<string, never>;
export type ResourceReadParams = { uri: string };
export type ToolListParams = Record<string, never>;
export type ToolCallParams = { name: string; arguments: Record<string, unknown> };
export type PromptListParams = Record<string, never>;
export type PromptGetParams = { name: string; arguments: Record<string, unknown> };
export type GetCapabilitiesParams = Record<string, never>;
export type InitializeParams = { 
  protocolVersion?: string; 
  capabilities?: Record<string, unknown>;
  clientInfo?: { name: string; version: string };
};

/**
 * Map of method names to their parameter types
 */
export type MethodParams = {
  'resources/list': ResourceListParams;
  'resources/read': ResourceReadParams;
  'tools/list': ToolListParams;
  'tools/call': ToolCallParams;
  'prompts/list': PromptListParams;
  'prompts/get': PromptGetParams;
  'get_capabilities': GetCapabilitiesParams;
  'initialize': InitializeParams;
};

/**
 * Map of method names to their result types
 */
export interface MethodResults {
  'get_capabilities': { capabilities: McpCapabilities };
  'resources/list': { resources: Array<{ uri: string; type?: string; metadata?: Record<string, unknown> }> };
  'resources/read': { contents: McpResource[] };
  'tools/list': { tools: Array<{ name: string; description?: string; metadata?: Record<string, unknown> }> };
  'tools/call': McpToolResult;
  'prompts/list': { prompts: Array<{ name: string; description?: string; metadata?: Record<string, unknown> }> };
  'prompts/get': { messages: Array<Record<string, unknown>>; description?: string };
  'initialize': { 
    protocolVersion: string; 
    serverInfo: { name: string; version: string }; 
    capabilities: McpCapabilities;
  };
}

/**
 * Re-export SDK types for convenience
 * Using 'export type' since isolatedModules is enabled
 */
export type {
  JSONRPCMessage,
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCNotification
};
