# Direnv Setup for Atrax

This document explains how to use direnv with the Atrax project to streamline your development workflow.

## What is direnv?

[direnv](https://direnv.net/) is an environment switcher for the shell. It knows how to hook into bash, zsh, tcsh, fish shell, and elvish to load or unload environment variables depending on the current directory. This allows project-specific environment setup without cluttering your shell initialization files.

## Installation

### macOS

```bash
brew install direnv
```

### Linux

```bash
# Using apt (Ubuntu/Debian)
sudo apt-get install direnv

# Using yum (Fedora/RHEL)
sudo yum install direnv

# Using pacman (Arch Linux)
sudo pacman -S direnv
```

### Shell Configuration

You need to hook direnv into your shell. Add the following to your shell configuration file (`.bashrc`, `.zshrc`, etc.):

#### Bash

```bash
eval "$(direnv hook bash)"
```

#### Zsh

```bash
eval "$(direnv hook zsh)"
```

#### Fish

```fish
direnv hook fish | source
```

## Using direnv with Atrax

1. Navigate to the Atrax project root directory
2. Allow direnv to load the environment:

```bash
direnv allow
```

3. You should see a message confirming that the Atrax development environment is activated

## Available Commands

Once direnv is activated, you have access to the following commands:

| Command | Description |
|---------|-------------|
| `atrax-server` | Start the Atrax server using the test configuration |
| `atrax-inspect` | Start the server with MCP Inspector for testing and debugging |
| `atrax-memory` | Run the memory server example for testing |
| `atrax-echo` | Run the echo server example for testing |
| `atrax-test` | Run the test suite |

## Local Customization

You can create an `.envrc.local` file (which is git-ignored) for environment variables specific to your development setup:

```bash
# Example .envrc.local
export MY_CUSTOM_VAR="value"

# Override the default config path
export ATRAX_CONFIG="/my/custom/path/config.json"

# Define custom helper functions
export_function "my-command" "echo 'Running my custom command'"
```

## Troubleshooting

### direnv not loading

If direnv isn't loading your environment:

1. Check if direnv is properly hooked into your shell
2. Verify that you've run `direnv allow` in the project directory
3. Check for error messages in the direnv output

### Permission denied errors

If you see permission denied errors when executing the functions:

```bash
chmod +x .direnv/functions/*
```

## Best Practices

1. Don't put sensitive information in `.envrc` - use `.envrc.local` for secrets
2. Keep the `.envrc` file focused on development environment setup
3. Document any environment variables that are required for development
4. If you update `.envrc`, notify your team to re-run `direnv allow`

## Additional Resources

- [Official direnv documentation](https://direnv.net/)
- [direnv GitHub repository](https://github.com/direnv/direnv)
