#!/bin/bash

# Test script for local MCP memory server
# This script uses netcat to send JSON-RPC requests to the memory server

# Set colors for better output readability
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Local memory server command - can be modified based on environment
MEMORY_SERVER="node ./dist/src/server/examples/memory-server.js"

echo -e "${BLUE}===== Testing Local Memory Server =====\n${NC}"

# Build the project first
echo -e "${YELLOW}Building project...${NC}"
npm run build
echo -e "${GREEN}Build complete${NC}\n"

# Start the memory server as a background process and store its PID
echo -e "${YELLOW}Starting memory server...${NC}"
$MEMORY_SERVER > /dev/null 2>&1 &
SERVER_PID=$!

# Give the server a moment to start up
sleep 1
echo -e "${GREEN}Memory server started (PID: $SERVER_PID)${NC}\n"

# Function to run a test command and display results
run_test() {
  local test_name="$1"
  local json_data="$2"

  echo -e "${YELLOW}Test: ${test_name}${NC}"
  echo -e "${GREEN}Request:${NC} $json_data"
  echo -e "${GREEN}Response:${NC}"
  echo "$json_data" | nc localhost 4000
  echo -e "\n"
}

# Attempt to establish a connection to our memory server
# Note: This might need to be adapted based on how your local server accepts connections
echo -e "${YELLOW}Note: This script assumes your local memory server accepts connections via
