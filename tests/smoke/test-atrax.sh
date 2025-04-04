#!/bin/bash

# Smoke test script for Atrax Proxy
# This script tests Atrax's ability to proxy requests to both Echo and Memory servers
# IMPORTANT: The Atrax server must be running separately before running this test

# Source the shared utilities
source "$(dirname "$0")/utils.sh"

# Set the port for Atrax server (should match what's running)
export PORT=4000
MESSAGE_ENDPOINT="http://localhost:$PORT/message"

# Ensure ATRAX_ROOT is set
if [ -z "$ATRAX_ROOT" ]; then
  export ATRAX_ROOT="$PROJECT_ROOT"
  echo -e "${YELLOW}ATRAX_ROOT not set, using $ATRAX_ROOT${NC}"
fi

# Check if the Atrax server is running
check_server_status() {
  if ! curl -s "http://localhost:$PORT/health" > /dev/null; then
    echo -e "${RED}ERROR: Atrax server is not running on port $PORT${NC}"
    echo -e "${YELLOW}Please start the server first with:${NC}"
    echo -e "${GREEN}  cd $ATRAX_ROOT && npm run build && npm run build:test${NC}"
    exit 1
  fi

  echo -e "${GREEN}Atrax server detected on port $PORT${NC}"
}

# Check if server is running
check_server_status

# Set default test token if MCP_TOKEN not provided
if [ -z "$MCP_TOKEN" ]; then
  export MCP_TOKEN="test-token-123456"
  echo -e "${YELLOW}No MCP_TOKEN set in environment, using default test token${NC}"
else
  echo -e "${GREEN}Using MCP_TOKEN from environment${NC}"
fi

# Test basic endpoints
echo -e "${BLUE}===== Testing Atrax Basic Endpoints =====\n${NC}"
test_http_endpoint "http://localhost:$PORT/health" "health endpoint"
test_http_endpoint "http://localhost:$PORT/status" "status endpoint"
test_http_endpoint "http://localhost:$PORT/servers" "servers endpoint" "$MCP_TOKEN"

# Test Echo Server via Atrax
echo -e "${BLUE}===== Testing Echo Server via Atrax =====\n${NC}"
test_echo_server_tools "send_proxy_request" "$MESSAGE_ENDPOINT" "echo" "$MCP_TOKEN"

# Test Memory Server via Atrax
echo -e "${BLUE}===== Testing Memory Server via Atrax =====\n${NC}"
test_memory_server_tools "send_proxy_request" "$MESSAGE_ENDPOINT" "memory" "$MCP_TOKEN"

# Test without token (should fail)
echo -e "${BLUE}===== Testing Authentication =====\n${NC}"
echo -e "${YELLOW}Testing access to /servers without token (should fail)...${NC}"
curl -s "http://localhost:$PORT/servers"
echo -e "\n"

echo -e "${GREEN}===== All Tests Completed Successfully =====\n${NC}"
echo -e "${BLUE}NOTE: The Atrax server is still running. You can stop it with Ctrl+C in the terminal where it's running.${NC}"
