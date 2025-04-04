import { findActualExecutable } from 'spawn-rx';
import { createContextLogger } from './logger.js';

const logger = createContextLogger('PathUtils');

/**
 * Helper utilities for path resolution
 */
export class PathUtils {
  /**
   * Resolve an executable and its arguments to proper paths
   * Handles special cases like Node.js and makes sure paths are absolute
   *
   * @param command - Command to resolve
   * @param args - Command arguments
   * @param options - Additional options
   * @returns Resolved command and arguments
   */
  static resolveExecutable(
    command: string,
    args: string[] = [],
    options: { workingDir?: string; debug?: boolean } = {}
  ): { command: string; args: string[] } {
    const workingDir = options.workingDir || process.cwd();
    const debug = options.debug || false;

    // Handle Node.js specially
    if (command === 'node') {
      // Use the current Node.js executable
      command = process.execPath;

      if (debug) {
        logger.debug(`Using Node.js executable: ${command}`);
      }

      // Make script paths absolute - if they're not already absolute
      args = args.map(arg => {
        // Skip if it's already an absolute path
        if (arg.startsWith('/')) {
          if (debug) {
            logger.debug(`Path already absolute: ${arg}`);
          }
          return arg;
        }

        // Handle relative paths (with or without ./ prefix)
        if (
          !arg.startsWith('/') &&
          (arg.includes('.js') ||
            arg.includes('.ts') ||
            arg.includes('bin/') ||
            arg.startsWith('./') ||
            arg.startsWith('../'))
        ) {
          const absolutePath = `${workingDir}/${arg}`;
          if (debug) {
            logger.debug(`Converted relative path ${arg} to absolute: ${absolutePath}`);
          }
          return absolutePath;
        }
        return arg;
      });

      return { command, args };
    }

    // For other commands, use spawn-rx to find the executable
    try {
      const resolved = findActualExecutable(command, args);

      if (debug) {
        logger.debug(
          `Resolved executable using spawn-rx: ${resolved.cmd} with args: ${resolved.args.join(
            ' '
          )}`
        );
      }

      return {
        command: resolved.cmd,
        args: resolved.args,
      };
    } catch (error) {
      if (debug) {
        logger.warn(`Failed to resolve executable ${command}: ${error}`);
      }

      // Return the original values if resolution fails
      return { command, args };
    }
  }
}
