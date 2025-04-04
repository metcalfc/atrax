import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig, validateConfig, DEFAULT_CONFIG } from '../../src/config/config-loader.js';
import { TransportType } from '../../src/types/config.js';

// Mock fs module
jest.mock('node:fs/promises');

describe('Config Loader', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('loadConfig', () => {
    it('should load a valid configuration file', async () => {
      const testConfig = {
        port: 4000,
        host: 'test-host',
        mcpServers: {
          test: {
            transportType: TransportType.STDIO,
            command: 'test-command',
            args: ['arg1', 'arg2'],
          },
        },
      };

      // Mock fs.readFile to return our test config
      jest.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(testConfig));

      const config = await loadConfig('test-config.json');

      expect(config).toEqual({
        ...DEFAULT_CONFIG,
        ...testConfig,
        mcpServers: {
          test: {
            name: 'test',
            transportType: TransportType.STDIO,
            command: 'test-command',
            args: ['arg1', 'arg2'],
          },
        },
      });

      expect(fs.readFile).toHaveBeenCalledWith('test-config.json', 'utf-8');
    });

    it('should return default config if file loading fails', async () => {
      // Mock fs.readFile to throw an error
      jest.spyOn(fs, 'readFile').mockRejectedValue(new Error('File not found'));

      const config = await loadConfig('non-existent-config.json');

      expect(config).toEqual(DEFAULT_CONFIG);
    });
  });

  describe('validateConfig', () => {
    it('should validate a valid configuration', () => {
      const validConfig = {
        port: 3000,
        host: 'localhost',
        mcpServers: {
          test: {
            transportType: TransportType.STDIO,
            command: 'test-command',
          },
        },
      };

      expect(() => validateConfig(validConfig)).not.toThrow();
    });

    it('should throw for invalid port', () => {
      const invalidConfig = {
        port: -1,
        mcpServers: {},
      };

      expect(() => validateConfig(invalidConfig)).toThrow(
        'Port must be an integer between 1 and 65535'
      );
    });

    it('should throw for invalid server name', () => {
      const invalidConfig = {
        mcpServers: {
          'invalid name': {
            transportType: TransportType.STDIO,
            command: 'test-command',
          },
        },
      };

      expect(() => validateConfig(invalidConfig)).toThrow(
        'Server name "invalid name" contains invalid characters'
      );
    });

    it('should throw for missing command in stdio server', () => {
      const invalidConfig = {
        mcpServers: {
          test: {
            transportType: TransportType.STDIO,
          },
        },
      };

      expect(() => validateConfig(invalidConfig)).toThrow(
        'Missing command for stdio server "test"'
      );
    });

    it('should throw for missing URL in HTTP server', () => {
      const invalidConfig = {
        mcpServers: {
          test: {
            transportType: TransportType.HTTP,
          },
        },
      };

      expect(() => validateConfig(invalidConfig)).toThrow('Missing URL for HTTP server "test"');
    });

    it('should throw for invalid URL in HTTP server', () => {
      const invalidConfig = {
        mcpServers: {
          test: {
            transportType: TransportType.HTTP,
            url: 'invalid-url',
          },
        },
      };

      expect(() => validateConfig(invalidConfig)).toThrow(
        'Invalid URL "invalid-url" for HTTP server "test"'
      );
    });
  });
});
