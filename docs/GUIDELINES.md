# Atrax Project Guidelines

## Project Overview

Atrax is a proxy for Model Context Protocol (MCP) servers that aggregates multiple MCP servers and presents them as a single unified interface. The name comes from the funnel-web spider, reflecting how it funnels resources from multiple servers into one.

## Core Design Principles

1. **MCP Protocol Compliance**: Always maintain strict adherence to the MCP protocol specification
2. **SDK First**: Always use the MCP SDK's built-in functionality over custom implementations
3. **Modular Design**: Maintain clear separation of concerns between components
4. **Transparent Proxying**: Act as a drop-in replacement for any MCP server
5. **Configurable Conflict Resolution**: Provide clear strategies for handling resource conflicts

## Key Components

- **Resource Registry**: Aggregates resources with configurable conflict resolution
- **Message Router**: Routes requests to appropriate underlying servers
- **Server Registry**: Manages the lifecycle of underlying MCP servers
- **Transport Layer**: Handles communication with underlying servers

## Coding Guidelines

### General

- Use TypeScript with strict type definitions
- Follow functional programming principles where appropriate
- Write comprehensive unit tests for all components
- Document all public APIs with JSDoc comments
- Use asynchronous code (Promises, async/await) consistently
- Make all dependencies explicit (no hidden side effects)

### Error Handling

- Always catch and log errors
- Provide useful context in error messages
- Use consistent error objects throughout the codebase
- Implement graceful degradation for non-critical failures

### Logging

- Use the centralized logging system
- Follow the established logging levels:
  - `error`: Critical failures requiring immediate attention
  - `warn`: Potentially problematic issues that don't prevent operation
  - `info`: High-level status information
  - `debug`: Detailed information for troubleshooting

## Code Quality and Standards

### Linting and Formatting

The project uses pre-commit hooks to maintain code quality and consistency:

```bash
# Install pre-commit hooks (required for contributors)
npm run pre-commit

# Run all pre-commit hooks manually on all files
npm run pre-commit:run
```

The pre-commit configuration in `.pre-commit-config.yaml` enforces:

- ES Module patterns (no CommonJS require/module.exports)
- Proper file extensions in imports (.js extension required for ESM compatibility)
- Consistent import ordering and organization
- TypeScript best practices
- Project structure validation
- Code formatting with Prettier

Developers should install the hooks when setting up their development environment.

### Automated Validation

Pre-commit hooks run automatically before each commit and validate:

- Code style and formatting
- Import path correctness for ESM
- Project structure following guidelines
- TypeScript type checking

This ensures that all committed code meets the project's quality standards.

## Git Workflow

- Make small, focused Git commits with clear messages
- Use feature branches for new development
- Write detailed PR descriptions explaining the changes
- Include tests with all PRs

## MCP Protocol Integration

### Important: MCP SDK Integration

For guidelines on integrating with the MCP SDK, refer to [MCP_SDK_INTEGRATION.md](./MCP_SDK_INTEGRATION.md).

Proper integration with the MCP SDK is critical for protocol compliance. The most common issues stem from:

1. Custom message parsing instead of using the SDK's buffer management
2. Improper message formatting that doesn't comply with JSON-RPC 2.0
3. Bypassing the SDK's transport classes in favor of custom implementations

**Always prefer SDK functionality over custom implementations.**

### Message Formatting

All MCP messages must:
- Follow the JSON-RPC 2.0 specification
- Include `jsonrpc: "2.0"` field
- Have a unique ID (preferably using `crypto.randomUUID()`)
- Include the appropriate method and parameters

### Transport Layer

- Use the SDK's transport classes for stdio, SSE, etc.
- Ensure proper line-delimited message parsing for stdio
- Handle connection lifecycle events correctly

## Testing

- Write unit tests for all components
- Include integration tests for the entire system
- Test with the MCP Inspector tool for compatibility
- Create mock MCP servers for testing complex scenarios

## Deployment

- Support Docker-based deployment
- Make configuration externalized and environment-driven
- Include health check endpoints
- Implement proper signal handling for graceful shutdown

## Module System and Project Structure

### ES Modules

- This project uses ES Modules exclusively. CommonJS patterns (require/module.exports) are not allowed.
- Always use `import`/`export` syntax for module interactions.
- When importing local files in TypeScript, always include the `.js` extension (not `.ts`) in import paths for ESM compatibility:
  ```typescript
  // Correct
  import { something } from './file.js';

  // Incorrect
  import { something } from './file';
  import { something } from './file.ts';
  ```
- Configuration files (jest.config.js, etc.) should use ES Module syntax and include `.js` extension where needed.

### Project Structure

- **Core Code**: All production code goes in `/src`
- **Examples**: Example implementation code goes in `/examples`
- **Script Files**: Utility and launcher scripts go in `/scripts` with proper subdirectories
  - Use `/scripts/servers` for server launcher scripts
  - Use `/scripts/client-examples` for client example scripts
- **Test Files**: Test files go in `/tests` with clear subdirectories
  - Integration tests: `/tests/integration`
  - Unit tests: `/tests/unit`
  - Smoke tests: `/tests/smoke`

### File Organization

- Avoid file duplication across directories
- Each script file should have exactly one purpose and location
- All script files should have appropriate extensions (`.js` for JavaScript files)
- Launcher scripts should be in `/scripts` directory, not `/bin`
- Configuration files should be centralized and not duplicated

## Documentation

- Keep README.md up to date with current features
- Document configuration options thoroughly
- Include examples for common use cases
- Provide troubleshooting guides for common issues

## Support and Issues

- Use GitHub issues for bug reports and feature requests
- Include detailed reproduction steps in bug reports
- Reference related issues in commits and PRs
- Keep the documentation updated as issues are resolved

By following these guidelines, we ensure that Atrax remains a robust, maintainable, and protocol-compliant MCP proxy server.
