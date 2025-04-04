import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContextLogger } from './logger.js';

const logger = createContextLogger('Logo');

/**
 * Displays the Atrax ASCII art logo to the console
 */
export async function displayLogo(): Promise<void> {
  try {
    // Get the directory of the current module
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    
    // Path to logo file - going up to the project root
    const logoPath = path.resolve(__dirname, '../../ascii_logo.txt');
    
    // Read the logo file
    const logo = await fs.readFile(logoPath, 'utf8');
    
    // Display the logo with blue ANSI color (36 is cyan)
    console.log('\x1b[36m%s\x1b[0m', logo);
    
  } catch (error) {
    // Don't break the app if logo can't be displayed
    logger.debug('Could not display logo:', error);
  }
}
