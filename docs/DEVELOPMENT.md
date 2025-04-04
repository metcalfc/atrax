# Development Guide for Atrax

This guide covers the development workflow and tools used in the Atrax project.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Setting Up Development Environment](#setting-up-development-environment)
- [Development Workflow](#development-workflow)
- [Code Quality Tools](#code-quality-tools)
- [Testing](#testing)
- [Continuous Integration](#continuous-integration)

## Prerequisites

- Node.js 18+
- npm 9+
- Python 3.7+ (for pre-commit)
- Git

## Setting Up Development Environment

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/atrax.git
   cd atrax
   ```

2. Install direnv (if not already installed):
   ```bash
   # On Ubuntu/Debian
   sudo apt-get install direnv

   # On macOS with Homebrew
   brew install direnv

   # Add to your shell (add to ~/.bashrc, ~/.zshrc, etc.)
   eval "$(direnv hook bash)"  # or zsh, fish, etc.
   ```

3. Allow direnv in the project directory:
   ```bash
   direnv allow
   ```
   This will automatically set up a Python virtual environment and install pre-commit.

4. Install Node.js dependencies:
   ```bash
   npm install
   ```

5. Build the project:
   ```bash
   npm run build
   ```

## Development Workflow

1. Create a new branch for your feature or bugfix:
   ```bash
   git checkout -b feature/my-feature
   ```

2. Make your changes, ensuring they follow the project's coding standards.

3. Stage your changes:
   ```bash
   git add .
   ```

4. Commit your changes (pre-commit hooks will run automatically):
   ```bash
   git commit -m "feat: add new feature"
   ```

5. Push your changes:
   ```bash
   git push origin feature/my-feature
   ```

6. Create a pull request on GitHub.

## Code Quality Tools

We use several tools to maintain code quality:

### Pre-commit

We use [pre-commit](https://pre-commit.com) to run code quality checks before each commit. These checks include:

- Formatting with Prettier
- Linting with ESLint
- TypeScript type checking
- Validation of import paths for ESM compatibility
- Project structure validation

You can run pre-commit checks manually:

```bash
# Run on all files
pre-commit-run
# or
pre-commit run --all-files

# Run a specific hook
pre-commit run eslint

# Install pre-commit hooks (if not already installed by direnv)
pre-commit-install

# Update pre-commit hooks to latest versions
pre-commit-update
```

### ESLint

ESLint is configured in `.eslintrc.cjs` and helps enforce consistent code style and catch potential issues.

```bash
# Run ESLint
npm run lint

# Fix automatically fixable issues
npm run lint:fix
```

### Prettier

Prettier is configured in `.prettierrc` and automatically formats code to ensure consistent style.

```bash
# Format code
npm run format
```

### TypeScript

TypeScript helps catch type-related errors at compile time. Configuration is in `tsconfig.json`.

```bash
# Type check
npx tsc --noEmit
```

## Testing

We use Jest for testing:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage
```

## Continuous Integration

We use GitHub Actions for CI. On each pull request and push to main, the CI pipeline:

1. Runs pre-commit checks on all files
2. Builds the project
3. Runs all tests

CI configuration is in `.github/workflows/ci.yml`.
