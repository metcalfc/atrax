import { JSONRPCErrorObject, JSONRPCErrorData } from '../types/mcp.js';
import { createContextLogger } from './logger.js';
import crypto from 'node:crypto';

const logger = createContextLogger('ErrorUtils');

/**
 * Standard error codes defined in the JSON-RPC 2.0 specification and MCP extensions
 * https://www.jsonrpc.org/specification#error_object
 */
export enum ErrorCode {
  // JSON-RPC standard error codes (required by spec)
  PARSE_ERROR = -32700,           // Invalid JSON was received
  INVALID_REQUEST = -32600,       // The JSON sent is not a valid request object
  METHOD_NOT_FOUND = -32601,      // The method does not exist / is not available
  INVALID_PARAMS = -32602,        // Invalid method parameter(s)
  INTERNAL_ERROR = -32603,        // Internal JSON-RPC error
  
  // Server error codes (reserved from -32000 to -32099 by JSON-RPC)
  // MCP SDK uses these codes
  CONNECTION_CLOSED = -32000,     // Connection was closed
  REQUEST_TIMEOUT = -32001,       // Request timed out
  SERVER_NOT_INITIALIZED = -32002, // Server has not been initialized
  
  // Atrax-specific error codes (use range below -32100 to avoid conflicts)
  RESOURCE_NOT_FOUND = -32100,    // Resource not found
  TOOL_NOT_FOUND = -32101,        // Tool not found
  PROMPT_NOT_FOUND = -32102,      // Prompt not found
  SERVER_UNAVAILABLE = -32103,    // Server is not available or running
  TRANSPORT_ERROR = -32104,       // Transport error
  CONFIGURATION_ERROR = -32105,   // Configuration error
  AUTHORIZATION_ERROR = -32106,   // Authorization/authentication error
}

/**
 * MCP-compatible error class for Atrax
 * Used for creating standardized errors
 */
export class McpError extends Error {
  /** Error code from ErrorCode enum */
  code: ErrorCode;
  
  /** Optional additional data about the error */
  data?: JSONRPCErrorData;

  /**
   * Create a new McpError
   * 
   * @param code - Error code (from ErrorCode enum)
   * @param message - Error message
   * @param data - Additional error data (optional)
   */
  constructor(
    code: ErrorCode,
    message: string,
    data?: JSONRPCErrorData
  ) {
    super(message);
    this.name = 'McpError';
    this.code = code;
    this.data = data;
    
    // Maintain proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, McpError);
    }
  }

  /**
   * Convert the error to a JSON-RPC error object
   * 
   * @param msgId - The ID from the request that caused the error
   * @returns A properly formatted JSON-RPC error object
   */
  toJsonRpcError(msgId: string | number | null): JSONRPCErrorObject {
    return {
      jsonrpc: '2.0',
      id: msgId ?? crypto.randomUUID(),
      error: {
        code: this.code,
        message: this.message,
        data: this.data
      }
    };
  }

  /**
   * Log the error with the appropriate level and context
   * 
   * @param context - Context for the log (optional)
   * @param level - Log level (default: 'error')
   */
  log(context?: string, level: 'error' | 'warn' | 'info' = 'error'): void {
    const contextLogger = context ? createContextLogger(context) : logger;
    contextLogger[level](this.message, { 
      code: this.code,
      ...this.data
    });
  }
}

/**
 * Create a standard JSON-RPC error response object
 * 
 * @param msgId - Message ID from the request
 * @param code - Error code
 * @param message - Error message
 * @param details - Additional error details (optional)
 * @param additionalData - Additional data to include (optional)
 * @returns JSON-RPC error response object
 */
export function createErrorResponse(
  msgId: string | number | null,
  code: number,
  message: string,
  details?: string,
  additionalData?: Record<string, unknown>
): JSONRPCErrorObject {
  return {
    jsonrpc: '2.0',
    id: msgId ?? crypto.randomUUID(),
    error: {
      code,
      message,
      data: {
        details: details || message,
        ...additionalData
      } as JSONRPCErrorData
    }
  };
}

/**
 * Create a standard JSON-RPC success response object
 * 
 * @param msgId - Message ID from the request
 * @param result - Result data
 * @returns JSON-RPC success response object
 */
export function createSuccessResponse(
  msgId: string | number | null,
  result: Record<string, unknown>
): {
  jsonrpc: '2.0';
  id: string | number;
  result: Record<string, unknown>;
} {
  return {
    jsonrpc: '2.0',
    id: msgId ?? crypto.randomUUID(),
    result
  };
}

/**
 * Convert an unknown error to a McpError
 * 
 * @param error - The error to convert
 * @param defaultCode - Default error code if not an McpError
 * @returns McpError instance
 */
export function toMcpError(
  error: unknown,
  defaultCode = ErrorCode.INTERNAL_ERROR
): McpError {
  if (error instanceof McpError) {
    return error;
  }

  if (error instanceof Error) {
    return new McpError(
      defaultCode,
      error.message,
      {
        details: error.stack
      }
    );
  }

  return new McpError(
    defaultCode,
    typeof error === 'string' ? error : 'Unknown error',
    {
      details: typeof error === 'string' ? error : JSON.stringify(error)
    }
  );
}

/**
 * Create error for method not found
 * 
 * @param method - Method name
 * @returns McpError
 */
export function methodNotFoundError(method: string): McpError {
  return new McpError(
    ErrorCode.METHOD_NOT_FOUND,
    `Method ${method} not supported by any server`,
    {
      details: 'No available server found to handle this method'
    }
  );
}

/**
 * Create error for tool not found
 * 
 * @param toolName - Tool name
 * @returns McpError
 */
export function toolNotFoundError(toolName: string): McpError {
  return new McpError(
    ErrorCode.TOOL_NOT_FOUND,
    `Tool ${toolName} not found on any server`,
    {
      details: 'No server found that can handle this tool'
    }
  );
}

/**
 * Create error for prompt not found
 * 
 * @param promptName - Prompt name
 * @returns McpError
 */
export function promptNotFoundError(promptName: string): McpError {
  return new McpError(
    ErrorCode.PROMPT_NOT_FOUND,
    `Prompt ${promptName} not found on any server`,
    {
      details: 'No server found that can handle this prompt'
    }
  );
}

/**
 * Create error for server unavailable
 * 
 * @param serverId - Server ID
 * @returns McpError
 */
export function serverUnavailableError(serverId: string): McpError {
  return new McpError(
    ErrorCode.SERVER_UNAVAILABLE,
    `Server ${serverId} is not available`,
    {
      details: 'The requested server is not running or reachable'
    }
  );
}

/**
 * Execute function with error handling
 * 
 * @param fn - Async function to execute
 * @param msgId - Message ID from the request (for error responses)
 * @param context - Context for logging
 * @returns Either success response or error response
 */
export async function executeWithErrorHandling<T extends Record<string, unknown>>(
  fn: () => Promise<T>,
  msgId: string | number | null,
  context?: string
): Promise<JSONRPCErrorObject | { jsonrpc: '2.0'; id: string | number; result: T }> {
  try {
    const result = await fn();
    return createSuccessResponse(msgId, result);
  } catch (error) {
    const contextLogger = context ? createContextLogger(context) : logger;
    
    // Convert to McpError and log
    const mcpError = toMcpError(error);
    mcpError.log(context);
    
    // Return as JSON-RPC error
    return mcpError.toJsonRpcError(msgId);
  }
}