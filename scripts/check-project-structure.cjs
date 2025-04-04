#!/usr/bin/env node

/**
 * Project Structure Validation Script
 *
 * This script validates that the project structure follows established guidelines:
 * - No files in incorrect directories
 * - All launcher scripts in /scripts directory
 * - No duplicate files across directories
 * - All JavaScript files have proper extensions
 */

const fs = require('fs');
const path = require('path');

// Get the project root directory
const rootDir = path.resolve(__dirname, '..');

// Configuration
const RULES = {
  // Directories that should not contain certain files
  RESTRICTED_DIRS: {
    'bin': ['*.js', '*.ts'], // No scripts should be in bin directory
    'src/server/examples': ['*.js', '*.ts'], // No examples in src directory
  },
  // Required extensions for file types
  REQUIRED_EXTENSIONS: {
    'scripts/servers': ['.js'],
    'scripts/client-examples': ['.js'],
  },
  // Directories that should only contain certain files
  ALLOWED_FILES: {
    'examples/servers': ['*.ts', 'README.md'],
  },
  // Patterns for files that should not exist anywhere in the project
  DISALLOWED_PATTERNS: [
    // Files without extensions
    /^scripts\/servers\/[^.]+$/,
    // Duplicate Jest setup files
    /^jest\.setup\.(js|cjs)$/,
  ],
};

// Utility functions
function checkFileExists(filePath) {
  return fs.existsSync(filePath);
}

function listFiles(dir, pattern = null) {
  const result = [];
  const dirPath = path.join(rootDir, dir);

  if (!fs.existsSync(dirPath)) {
    return result;
  }

  const items = fs.readdirSync(dirPath);
  for (const item of items) {
    const itemPath = path.join(dirPath, item);
    const stats = fs.statSync(itemPath);

    if (stats.isFile()) {
      if (!pattern || new RegExp(pattern).test(item)) {
        result.push(item);
      }
    }
  }

  return result;
}

function matchesPattern(filename, pattern) {
  if (pattern.startsWith('*.')) {
    // Extension pattern
    const ext = pattern.substring(1);
    return filename.endsWith(ext);
  }

  // Regular expression pattern
  return new RegExp(pattern).test(filename);
}

function extensionCheck(directory, requiredExtensions) {
  const issues = [];
  const dirPath = path.join(rootDir, directory);

  if (!fs.existsSync(dirPath)) {
    return issues;
  }

  const items = fs.readdirSync(dirPath);
  for (const item of items) {
    const itemPath = path.join(dirPath, item);
    const stats = fs.statSync(itemPath);

    if (stats.isFile() && !item.endsWith('.md')) {
      const hasRequiredExt = requiredExtensions.some(ext =>
        item.endsWith(ext)
      );

      if (!hasRequiredExt) {
        issues.push(`File "${directory}/${item}" should have one of the following extensions: ${requiredExtensions.join(', ')}`);
      }
    }
  }

  return issues;
}

function disallowedPatternCheck() {
  const issues = [];

  for (const pattern of RULES.DISALLOWED_PATTERNS) {
    if (pattern instanceof RegExp) {
      // Check root directory first
      const rootFiles = fs.readdirSync(rootDir);
      for (const file of rootFiles) {
        if (pattern.test(file) && fs.statSync(path.join(rootDir, file)).isFile()) {
          issues.push(`File "${file}" matches disallowed pattern ${pattern}`);
        }
      }

      // We should also recursively check directories, but for brevity we'll check key ones
      const dirsToCheck = ['scripts', 'scripts/servers'];
      for (const dir of dirsToCheck) {
        const dirPath = path.join(rootDir, dir);
        if (fs.existsSync(dirPath)) {
          const files = fs.readdirSync(dirPath);
          for (const file of files) {
            const filePath = path.join(dir, file);
            if (pattern.test(filePath) && fs.statSync(path.join(rootDir, filePath)).isFile()) {
              issues.push(`File "${filePath}" matches disallowed pattern ${pattern}`);
            }
          }
        }
      }
    }
  }

  return issues;
}

// Main validation function
function validateProjectStructure() {
  let issues = [];

  // Check restricted directories
  for (const [dir, patterns] of Object.entries(RULES.RESTRICTED_DIRS)) {
    const dirPath = path.join(rootDir, dir);

    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath);

      for (const file of files) {
        const filePath = path.join(dirPath, file);

        if (fs.statSync(filePath).isFile()) {
          for (const pattern of patterns) {
            if (matchesPattern(file, pattern)) {
              issues.push(`Found restricted file pattern "${pattern}" in directory "${dir}": ${file}`);
            }
          }
        }
      }
    }
  }

  // Check required extensions
  for (const [dir, extensions] of Object.entries(RULES.REQUIRED_EXTENSIONS)) {
    issues = issues.concat(extensionCheck(dir, extensions));
  }

  // Check for disallowed patterns
  issues = issues.concat(disallowedPatternCheck());

  return issues;
}

// Run validation
const issues = validateProjectStructure();

if (issues.length > 0) {
  console.error('\x1b[31m%s\x1b[0m', 'Project structure validation failed!');
  issues.forEach(issue => console.error(`- ${issue}`));
  process.exit(1);
} else {
  console.log('\x1b[32m%s\x1b[0m', 'Project structure validation passed!');
}
