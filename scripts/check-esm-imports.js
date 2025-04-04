#!/usr/bin/env node

/**
 * ESM Import Path Checker
 *
 * This script checks that all import statements in TypeScript files
 * include the .js extension for local imports to ensure ESM compatibility.
 *
 * Rules checked:
 * - All relative imports (starting with ./ or ../) must have a .js extension
 * - Excludes imports from node_modules (non-relative imports)
 * - Only ts files are checked (or js files that might import ts files)
 */

import fs from 'node:fs';
import path from 'node:path';

// Get file paths from command line arguments
const filePaths = process.argv.slice(2);

// Regular expression to match local imports without .js extension
// Matches: import ... from './path/to/file' or import ... from '../path/to/file'
// But not: import ... from './path/to/file.js' or import ... from 'non-relative-path'
const missingExtensionRegex = /from\s+['"](\.[^'"]*?)(?!\.js)['"](?!\s+assert)/g;

let hasErrors = false;

// Ignore checking the imports in this file since it contains examples
const IGNORED_FILES = ['scripts/check-esm-imports.js'];

for (const filePath of filePaths) {
  // Skip files that are not TypeScript/JavaScript or are in the ignore list
  if (
    (!filePath.endsWith('.ts') && !filePath.endsWith('.js')) ||
    IGNORED_FILES.some(ignoredFile => filePath.endsWith(ignoredFile))
  ) {
    continue;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');

    // Reset lastIndex to ensure we start from the beginning
    missingExtensionRegex.lastIndex = 0;

    const matches = [];
    let match;

    while ((match = missingExtensionRegex.exec(content)) !== null) {
      // Make sure we're not matching a path that already ends with .js
      const importPath = match[1];
      if (!importPath.endsWith('.js')) {
        matches.push(importPath);
      }
    }

    if (matches.length > 0) {
      console.error(`\x1b[31m${filePath}: Missing .js extension in the following imports:\x1b[0m`);

      for (const importPath of matches) {
        console.error(`  - ${importPath} should be ${importPath}.js`);
      }

      hasErrors = true;
    }
  } catch (error) {
    console.error(`\x1b[31mError reading file ${filePath}: ${error.message}\x1b[0m`);
    hasErrors = true;
  }
}

// Exit with error code if any issues were found
process.exit(hasErrors ? 1 : 0);
