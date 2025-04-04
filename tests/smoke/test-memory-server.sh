#!/bin/bash

# Smoke test script for the Memory Server

# Source the shared utilities
source "$(dirname "$0")/utils.sh"

# Define the memory server path using the project root
MEMORY_SERVER="node $PROJECT_ROOT/examples/servers/scripts/memory-server.js"

echo -e "${BLUE}===== Smoke Testing Memory Server =====\n${NC}"
echo -e "${YELLOW}Testing memory server via stdio transport${NC}\n"

# Use the shared function to test the Memory server tools
test_memory_server_tools "run_stdio_test" "$MEMORY_SERVER" "" ""

echo -e "${GREEN}===== Tests Completed =====\n${NC}"