import { BaseTransport, TransportEvent } from './transport.js';
import { JSONRPCMessage } from '../../types/mcp.js';
import { createContextLogger } from '../../utils/logger.js';
import { DockerMcpServerConfig, TransportType } from '../../types/config.js';
import { StdioTransport } from './stdio-transport.js';

const logger = createContextLogger('DockerTransport');

/**
 * Transport for communicating with MCP servers running in Docker containers
 * This is essentially a wrapper around StdioTransport that handles Docker-specific logic
 */
export class DockerTransport extends BaseTransport {
  private config: DockerMcpServerConfig;
  private stdioTransport: StdioTransport | null = null;

  /**
   * Create a new Docker transport
   *
   * @param config - Docker MCP server configuration
   */
  constructor(config: DockerMcpServerConfig) {
    super();
    this.config = config;
  }

  /**
   * Start the transport by starting the Docker container
   */
  async start(): Promise<void> {
    if (this.running) {
      logger.warn(`Transport for ${this.config.name} is already running`);
      return;
    }

    try {
      logger.info(
        `Starting docker transport for ${this.config.name}: ${
          this.config.command
        } ${this.config.args.join(' ')}`
      );

      // Create a stdio transport that will handle the Docker process
      this.stdioTransport = new StdioTransport({
        name: this.config.name,
        transportType: TransportType.STDIO,
        command: this.config.command,
        args: this.config.args,
        env: this.config.env,
        description: this.config.description,
        tags: this.config.tags,
      });

      // Forward events from the stdio transport
      this.stdioTransport.on(TransportEvent.MESSAGE, message => {
        this.emit(TransportEvent.MESSAGE, message);
      });

      this.stdioTransport.on(TransportEvent.ERROR, error => {
        this.emit(TransportEvent.ERROR, error);
      });

      this.stdioTransport.on(TransportEvent.CLOSE, code => {
        this.running = false;
        this.stdioTransport = null;
        this.emit(TransportEvent.CLOSE, code);
      });

      // Start the stdio transport
      await this.stdioTransport.start();
      this.running = true;
      this.emit(TransportEvent.START);
    } catch (error) {
      this.running = false;
      this.stdioTransport = null;
      logger.error(`Failed to start ${this.config.name}:`, error);
      throw error;
    }
  }

  /**
   * Stop the transport by stopping the Docker container
   */
  async stop(): Promise<void> {
    if (!this.running || !this.stdioTransport) {
      logger.warn(`Transport for ${this.config.name} is not running`);
      return;
    }

    logger.info(`Stopping docker transport for ${this.config.name}`);

    try {
      await this.stdioTransport.stop();
      this.running = false;
      this.stdioTransport = null;
    } catch (error) {
      logger.error(`Error stopping ${this.config.name}:`, error);
      throw error;
    }
  }

  /**
   * Send a message to the Docker container
   *
   * @param message - Message to send
   */
  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.running || !this.stdioTransport) {
      throw new Error(`Cannot send message to ${this.config.name}: transport not running`);
    }

    await this.stdioTransport.send(message);
  }
}
