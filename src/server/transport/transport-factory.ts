import { McpServerConfig, TransportType, StdioMcpServerConfig } from '../../types/config.js';
import { Transport } from './transport.js';
import { StdioTransport } from './stdio-transport.js';
import { createContextLogger } from '../../utils/logger.js';
import { Transport as SdkTransport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { PathUtils } from '../../utils/path.js';

const logger = createContextLogger('TransportFactory');

/**
 * Adapter to make our transports compatible with the SDK's transport interface
 */
class TransportAdapter implements SdkTransport {
  private transport: Transport;
  private messageHandlers: ((message: JSONRPCMessage) => void)[] = [];
  private errorHandlers: ((error: Error) => void)[] = [];
  private closeHandlers: (() => void)[] = [];

  constructor(transport: Transport) {
    this.transport = transport;

    // Forward events
    this.transport.on('message', (message: JSONRPCMessage) => {
      this.messageHandlers.forEach(handler => handler(message));
    });
    this.transport.on('error', (error: Error) => {
      this.errorHandlers.forEach(handler => handler(error));
    });
    this.transport.on('close', () => {
      this.closeHandlers.forEach(handler => handler());
    });
  }

  set onmessage(handler: (message: JSONRPCMessage) => void) {
    this.messageHandlers = [handler];
  }

  set onerror(handler: (error: Error) => void) {
    this.errorHandlers = [handler];
  }

  set onclose(handler: () => void) {
    this.closeHandlers = [handler];
  }

  async start(): Promise<void> {
    try {
      await this.transport.start();
    } catch (error) {
      this.errorHandlers.forEach(handler => handler(error as Error));
      throw error;
    }
  }

  async send(message: JSONRPCMessage): Promise<void> {
    await this.transport.send(message);
  }

  async close(): Promise<void> {
    await this.transport.close();
  }
}

/**
 * Factory for creating transport instances based on server configuration
 */
export class TransportFactory {
  /**
   * Create a transport instance
   *
   * @param config - Transport configuration
   * @returns Transport instance
   */
  createTransport(config: McpServerConfig): SdkTransport {
    logger.info(`Creating transport for ${config.name} with type ${config.transportType}`);

    let transport: Transport;

    switch (config.transportType) {
      case TransportType.STDIO:
        const stdioConfig = config as StdioMcpServerConfig;
        if (stdioConfig.transportType !== TransportType.STDIO) {
          throw new Error(`Invalid transport type: ${stdioConfig.transportType}`);
        }

        // Properly resolve the executable and arguments
        const { command, args } = PathUtils.resolveExecutable(
          stdioConfig.command,
          stdioConfig.args || [],
          { debug: true }
        );

        // Create transport with resolved command/args
        transport = new StdioTransport({
          ...stdioConfig,
          command,
          args,
          // Preserve process environment and add any config-specific env vars
          env: Object.fromEntries(
            Object.entries({ ...process.env, ...stdioConfig.env }).filter(
              ([_, v]) => v !== undefined
            )
          ) as Record<string, string>,
        });
        break;

      default:
        throw new Error(`Unsupported transport type: ${config.transportType}`);
    }

    const adapter = new TransportAdapter(transport);
    adapter.start();
    return adapter;
  }
}
