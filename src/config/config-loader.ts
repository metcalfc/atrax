import fs from 'node:fs/promises';
import path from 'node:path';
import { 
  AtraxConfig, 
  McpServerConfig, 
  TransportType,
  AuthConfig,
  isBasicAuth,
  isTokenAuth,
  isOAuth2Auth
} from '../types/config.js';
import { logger } from '../utils/logger.js';

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: AtraxConfig = {
  port: 3000,
  host: 'localhost',
  auth: { type: 'none' } as AuthConfig,
  mcpServers: {},
};

/**
 * Load configuration from a file
 *
 * @param configPath - Path to the configuration file
 * @returns Loaded configuration
 */
export async function loadConfig(configPath: string): Promise<AtraxConfig> {
  try {
    const configData = await fs.readFile(configPath, 'utf-8');
    const userConfig = JSON.parse(configData) as Partial<AtraxConfig>;

    // Process auth configuration and handle environment variable replacements
    let authConfig: AuthConfig = { type: 'none' };
    
    if (userConfig.auth) {
      authConfig = {
        type: userConfig.auth.type || 'none',
        ...(userConfig.auth.type !== 'none' && userConfig.auth.options ? { 
          options: processAuthOptions(userConfig.auth.type, userConfig.auth.options) 
        } : {})
      } as AuthConfig;
    }
    
    // Merge with default config
    const config: AtraxConfig = {
      ...DEFAULT_CONFIG,
      ...userConfig,
      mcpServers: { ...DEFAULT_CONFIG.mcpServers, ...userConfig.mcpServers },
      // Use processed auth configuration
      auth: authConfig,
    };

    // Validate the configuration
    validateConfig(config);

    // Add name to each server config based on its key
    const mcpServers: Record<string, McpServerConfig> = {};

    for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
      // Process server configuration to handle environment variables in paths
      const processedConfig = { ...serverConfig };
      
      // Handle environment variables in args if present
      // Need type assertion because Omit<McpServerConfig, 'name'> doesn't guarantee args exists
      const configArgs = (serverConfig as any).args;
      if (Array.isArray(configArgs)) {
        // Type assertion needed here since processedConfig might not have args property
        (processedConfig as any).args = configArgs.map((arg: unknown) => {
          if (typeof arg === 'string' && arg.includes('${')) {
            // Replace environment variables in the format ${VAR_NAME}
            return arg.replace(/\${([^}]+)}/g, (match, varName) => {
              const envValue = process.env[varName];
              if (!envValue) {
                logger.warn(`Environment variable ${varName} not set for server ${name}`);
                return match; // Keep the original string if env var not found
              }
              logger.debug(`Replaced ${varName} with value from environment variable in ${name}`);
              return envValue;
            });
          }
          return arg;
        });
      }
      
      mcpServers[name] = {
        ...processedConfig,
        name,
      } as McpServerConfig;
    }

    return {
      ...config,
      mcpServers,
    };
  } catch (error) {
    if (error instanceof Error) {
      logger.error(`Failed to load configuration: ${error.message}`);
    }

    // Return default config if file loading fails
    logger.info('Using default configuration');
    return DEFAULT_CONFIG;
  }
}

/**
 * Find and load configuration from standard locations
 *
 * @returns Loaded configuration
 */
export async function findAndLoadConfig(): Promise<AtraxConfig> {
  // Search paths for configuration
  const searchPaths = [
    // Current working directory
    path.join(process.cwd(), 'atrax.config.json'),
    // Home directory
    path.join(process.env.HOME || '', '.atrax.config.json'),
    // Config directory in home
    path.join(process.env.HOME || '', '.config', 'atrax', 'config.json'),
  ];

  for (const configPath of searchPaths) {
    try {
      await fs.access(configPath);
      logger.info(`Loading configuration from ${configPath}`);
      return loadConfig(configPath);
    } catch {
      // File doesn't exist or isn't accessible, try next path
      continue;
    }
  }

  // No configuration file found, use defaults
  logger.info('No configuration file found, using default configuration');
  return DEFAULT_CONFIG;
}

/**
 * Process authentication options, replacing environment variables in tokens
 *
 * @param authType - Authentication type
 * @param options - Authentication options
 * @returns Processed authentication options
 */
function processAuthOptions(authType: string, options: any): any {
  const processedOptions = { ...options };
  
  // Handle token authentication specifically
  if (authType === 'token' && typeof options.token === 'string') {
    // Check if token value uses environment variable syntax
    if (options.token.startsWith('${') && options.token.endsWith('}')) {
      // Extract environment variable name
      const envVarName = options.token.slice(2, -1);
      
      // Get value from environment
      const envValue = process.env[envVarName];
      
      if (!envValue) {
        logger.warn(`Environment variable ${envVarName} not set for token authentication`);
      } else {
        logger.info(`Using token from environment variable ${envVarName}`);
        processedOptions.token = envValue;
      }
    }
  }
  
  // Future: handle other auth types that might need environment variable processing
  
  return processedOptions;
}

export function validateConfig(config: AtraxConfig): void {
  // Validate port
  if (config.port !== undefined) {
    if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
      throw new Error('Port must be an integer between 1 and 65535');
    }
  }

  // Validate MCP servers
  for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
    // Validate name (will be used in URLs and as identifiers)
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      throw new Error(
        `Server name "${name}" contains invalid characters. Use only alphanumerics, dashes, and underscores.`
      );
    }

    // Validate transport type
    if (!Object.values(TransportType).includes(serverConfig.transportType as TransportType)) {
      throw new Error(
        `Invalid transport type "${serverConfig.transportType}" for server "${name}"`
      );
    }

    // Validate transport-specific configuration
    switch (serverConfig.transportType) {
      case TransportType.STDIO:
        if (!('command' in serverConfig) || !serverConfig.command) {
          throw new Error(`Missing command for stdio server "${name}"`);
        }
        break;

      case TransportType.DOCKER:
        if (!('command' in serverConfig) || !serverConfig.command) {
          throw new Error(`Missing command for docker server "${name}"`);
        }
        if (!('args' in serverConfig) || !Array.isArray(serverConfig.args)) {
          throw new Error(`Missing or invalid args for docker server "${name}"`);
        }
        break;

      case TransportType.HTTP:
        if (!('url' in serverConfig) || !serverConfig.url) {
          throw new Error(`Missing URL for HTTP server "${name}"`);
        }
        // Basic URL validation
        try {
          new URL(serverConfig.url);
        } catch {
          throw new Error(`Invalid URL "${serverConfig.url}" for HTTP server "${name}"`);
        }
        break;
    }
  }

  // Validate authentication configuration
  if (config.auth) {
    if (isBasicAuth(config.auth)) {
      // Basic auth requires username and password
      if (!config.auth.options.username || !config.auth.options.password) {
        throw new Error('Basic authentication requires username and password');
      }
    } else if (isTokenAuth(config.auth)) {
      // Token auth requires token
      if (!config.auth.options.token) {
        throw new Error('Token authentication requires a token value');
      }
    } else if (isOAuth2Auth(config.auth)) {
      // OAuth2 requires clientId, clientSecret, and tokenUrl
      if (!config.auth.options.clientId || !config.auth.options.clientSecret || !config.auth.options.tokenUrl) {
        throw new Error('OAuth2 authentication requires clientId, clientSecret, and tokenUrl');
      }
    }
    // No validation needed for 'none' auth type
  }
}
