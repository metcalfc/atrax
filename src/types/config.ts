/**
 * MCP Server types and configuration interfaces
 */

/**
 * Basic Authentication options
 */
export interface BasicAuthOptions {
  /** Username for basic auth */
  username: string;
  /** Password for basic auth */
  password: string;
  /** Realm to use for authentication */
  realm?: string;
}

/**
 * Token Authentication options
 */
export interface TokenAuthOptions {
  /** Token value */
  token: string;
  /** Where to look for the token (header, query, body) */
  location?: 'header' | 'query' | 'body';
  /** Name of the parameter containing the token */
  paramName?: string;
  /** Token prefix (e.g., "Bearer") */
  prefix?: string;
}

/**
 * OAuth2 Authentication options
 */
export interface OAuth2AuthOptions {
  /** Client ID */
  clientId: string;
  /** Client secret */
  clientSecret: string;
  /** Token endpoint URL */
  tokenUrl: string;
  /** Authorization endpoint URL */
  authorizationUrl?: string;
  /** Redirect URL after authentication */
  redirectUrl?: string;
  /** OAuth2 scopes */
  scopes?: string[];
  /** Additional parameters */
  additionalParams?: Record<string, string>;
}

/**
 * No Authentication options
 */
export interface NoAuthOptions {
  /** No options needed */
}

/**
 * MCP Server transport type
 */
export enum TransportType {
  HTTP = 'http',
  STDIO = 'stdio',
  DOCKER = 'docker',
}

/**
 * Base MCP Server configuration interface
 */
export interface BaseMcpServerConfig {
  /** Name of the server */
  name: string;
  /** Type of transport to use */
  transportType: TransportType;
  /** Optional description of the server */
  description?: string;
  /** Optional tags for categorization */
  tags?: string[];
}

/**
 * Stdio-based MCP Server configuration
 */
export interface StdioMcpServerConfig extends BaseMcpServerConfig {
  transportType: TransportType.STDIO;
  /** Command to execute */
  command: string;
  /** Arguments to pass to the command */
  args?: string[];
  /** Environment variables to set */
  env?: Record<string, string>;
}

/**
 * Docker-based MCP Server configuration
 */
export interface DockerMcpServerConfig extends BaseMcpServerConfig {
  transportType: TransportType.DOCKER;
  /** Docker command (usually 'docker') */
  command: string;
  /** Arguments to pass to docker run */
  args: string[];
  /** Environment variables to set */
  env?: Record<string, string>;
}

/**
 * HTTP-based MCP Server configuration
 */
export interface HttpMcpServerConfig extends BaseMcpServerConfig {
  transportType: TransportType.HTTP;
  /** URL of the HTTP server */
  url: string;
  /** Optional HTTP headers */
  headers?: Record<string, string>;
}

/**
 * Union type for all MCP server configurations
 */
// Combined type with all possible properties
export interface CombinedMcpServerConfig extends BaseMcpServerConfig {
  // HTTP specific
  url?: string;
  headers?: Record<string, string>;

  // Process specific
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

// Union type for specific configurations by transport type
export type McpServerConfig =
  | StdioMcpServerConfig
  | DockerMcpServerConfig
  | HttpMcpServerConfig
  | CombinedMcpServerConfig;

/**
 * Authentication configuration using discriminated union
 */
export type AuthConfig =
  | { type: 'none'; options?: NoAuthOptions }
  | { type: 'basic'; options: BasicAuthOptions }
  | { type: 'token'; options: TokenAuthOptions }
  | { type: 'oauth2'; options: OAuth2AuthOptions };

/**
 * Type guards for authentication types
 */
export const isBasicAuth = (auth: AuthConfig): auth is { type: 'basic'; options: BasicAuthOptions } => {
  return auth.type === 'basic';
};

export const isTokenAuth = (auth: AuthConfig): auth is { type: 'token'; options: TokenAuthOptions } => {
  return auth.type === 'token';
};

export const isOAuth2Auth = (auth: AuthConfig): auth is { type: 'oauth2'; options: OAuth2AuthOptions } => {
  return auth.type === 'oauth2';
};

export const isNoAuth = (auth: AuthConfig): auth is { type: 'none'; options?: NoAuthOptions } => {
  return auth.type === 'none';
};

/**
 * Main configuration interface
 */
export interface AtraxConfig {
  /** Port to listen on */
  port?: number;
  /** Host to bind to */
  host?: string;
  /** Authentication configuration */
  auth?: AuthConfig;
  /** MCP servers configuration */
  mcpServers: Record<string, Omit<McpServerConfig, 'name'>>;
}
