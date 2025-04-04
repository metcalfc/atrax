# Essential Atrax Guidelines

## Key Commands
- Build: `npm run build`
- Test: `npm test` (or `NODE_OPTIONS=--exp-vm-modules npx jest -t "pattern"`)
- Lint/Format: `npm run lint` / `npm run format`
- Pre-commit: `pre-commit run --all-files`

## Development Principles
1. **Use the MCP SDK**: Don't reimplement SDK functionality
2. **ES Modules only**: No CommonJS patterns (require/module.exports)
3. **Include .js extension**: In import paths (`import from './file.js'`)
4. **Make small commits**: With clear, descriptive messages
5. **Write tests**: For all components and features

## Project Structure
- `/src`: Core application code
- `/examples`: Example server implementations
- `/scripts`: Utility scripts and launchers
- `/tests`: Test files (unit, integration, smoke)
- `/docs`: Documentation

## Coding Standards
- TypeScript with strict typing
- Explicit error handling with context
- Functional programming where appropriate
- JSDoc for public APIs
- Use the centralized logger

See [GUIDELINES.md](./docs/GUIDELINES.md) for detailed standards.
