#!/bin/bash

# Test script for local MCP memory server
# This script sends various JSON-RPC commands to test the functionality of our local memory server

# Set colors for better output readability
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Local memory server command - can be modified based on environment
MEMORY_SERVER="npm run echo-server"

echo -e "${BLUE}===== Testing Local Echo Server =====\n${NC}"

# Build the project first
echo -e "${YELLOW}Building project...${NC}"
npm run build
echo -e "${GREEN}Build complete${NC}\n"

# Clean up any existing memory file to start with a fresh state
if [ -f "./dist/src/server/examples/memory.json" ]; then
  rm ./dist/src/server/examples/memory.json
  echo -e "${YELLOW}Removed previous memory file${NC}\n"
fi

# Function to run a test command and display results
run_test() {
  local test_name="$1"
  local json_data="$2"

  echo -e "${YELLOW}Test: ${test_name}${NC}"
  echo -e "${GREEN}Request:${NC} $json_data"
  echo -e "${GREEN}Response:${NC}"

  # Send request to memory server via stdin and capture response from stdout
  # Add newline at the end of the JSON data to ensure proper message termination
  # Timeout after 2 seconds since we expect a quick response
  echo "$json_data" | timeout 2 $MEMORY_SERVER

  # Add spacing for better readability
  echo -e "\n"
}

echo -e "${YELLOW}Testing memory server via stdio transport${NC}\n"

# List available tools
run_test "List Available Tools" '{
  "jsonrpc": "2.0",
  "method": "tools/list",
  "params": {},
  "id": 3
}'

# Read initial empty graph
run_test "Read Initial Empty Graph" '{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "read_graph",
    "arguments": {}
  },
  "id": 4
}'

# Create entities
run_test "Create Entities" '{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "create_entity",
    "arguments": {
      "entities": [
        {
          "name": "test_entity_1",
          "entityType": "test",
          "observations": ["This is a test entity"]
        }
      ]
    }
  },
  "id": 5
}'

run_test "Create Another Entity" '{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "create_entity",
    "arguments": {
      "entities": [
        {
          "name": "test_entity_2",
          "entityType": "test",
          "observations": ["This is another test entity"]
        }
      ]
    }
  },
  "id": 6
}'

# Create relations
run_test "Create Relation" '{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "create_relation",
    "arguments": {
      "relations": [
        {
          "from": "test_entity_1",
          "to": "test_entity_2",
          "relationType": "is_related_to"
        }
      ]
    }
  },
  "id": 7
}'

# Read graph with entities and relations
run_test "Read Graph with Entities and Relations" '{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "read_graph",
    "arguments": {}
  },
  "id": 8
}'

# Search nodes
run_test "Search Nodes" '{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "search_nodes",
    "arguments": {
      "query": "test"
    }
  },
  "id": 9
}'

echo -e "${GREEN}===== Tests Completed =====\n${NC}"
