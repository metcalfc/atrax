#!/bin/bash

# Smoke test script for the Echo Server

# Source the shared utilities
source "$(dirname "$0")/utils.sh"

# Define the echo server path using the project root
ECHO_SERVER="node $PROJECT_ROOT/examples/servers/scripts/echo-server.js"

echo -e "${BLUE}===== Smoke Testing Echo Server =====\n${NC}"
echo -e "${YELLOW}Testing echo server via stdio transport${NC}\n"

# Use the shared function to test the Echo server tools
test_echo_server_tools "run_stdio_test" "$ECHO_SERVER" "" ""

echo -e "${GREEN}===== Tests Completed =====\n${NC}"