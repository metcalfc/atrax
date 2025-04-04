#!/bin/bash
# Script to start Atrax with token authentication

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Set project root
export ATRAX_ROOT="$(pwd)"
echo -e "${BLUE}Setting ATRAX_ROOT to ${ATRAX_ROOT}${NC}"

# Set port (default to 4000)
export PORT=${PORT:-4000}
export HTTP_PORT=${HTTP_PORT:-4001}

# Kill any running processes on exit
trap 'echo -e "${YELLOW}Shutting down...${NC}"; kill $(jobs -p) 2>/dev/null' EXIT INT TERM

# Generate a random token if not provided
if [ -z "$MCP_TOKEN" ]; then
  export MCP_TOKEN=$(openssl rand -hex 16)
  echo -e "${GREEN}Generated random token: ${MCP_TOKEN}${NC}"
else
  echo -e "${GREEN}Using provided token: ${MCP_TOKEN}${NC}"
fi

# Copy token to clipboard if possible
if command -v pbcopy > /dev/null; then
  echo "$MCP_TOKEN" | pbcopy
  echo -e "${GREEN}Token copied to clipboard${NC}"
elif command -v xclip > /dev/null; then
  echo "$MCP_TOKEN" | xclip -selection clipboard
  echo -e "${GREEN}Token copied to clipboard${NC}"
elif command -v xsel > /dev/null; then
  echo "$MCP_TOKEN" | xsel --clipboard
  echo -e "${GREEN}Token copied to clipboard${NC}"
fi

# Build the project if needed
echo -e "${BLUE}Building Atrax...${NC}"
npm run build

# Start the HTTP echo server
echo -e "${BLUE}Starting HTTP Echo Server on port ${HTTP_PORT}...${NC}"
node "${ATRAX_ROOT}/examples/servers/scripts/http-echo-server.js" &
HTTP_PID=$!

# Wait for HTTP server to start
echo -e "${YELLOW}Waiting for HTTP server to start...${NC}"
for i in {1..10}; do
  if curl -s "http://localhost:${HTTP_PORT}/health" > /dev/null; then
    echo -e "${GREEN}HTTP server is running on port ${HTTP_PORT}${NC}"
    break
  fi

  if [ $i -eq 10 ]; then
    echo -e "${RED}HTTP server failed to start after 10 attempts${NC}"
    exit 1
  fi

  echo -e "${YELLOW}Waiting for HTTP server (attempt ${i}/10)...${NC}"
  sleep 1
done

# Start Atrax with token authentication
echo -e "${BLUE}Starting Atrax Server on port ${PORT}...${NC}"
echo -e "${GREEN}Use this token to connect: ${MCP_TOKEN}${NC}"
echo -e ""
echo -e "${BLUE}For MCP Inspector:${NC}"
echo -e "${YELLOW}1. Set transport type to SSE${NC}"
echo -e "${YELLOW}2. Set SSE URL to: http://localhost:${PORT}/sse${NC}"
echo -e "${YELLOW}3. Add Authorization header: Bearer ${MCP_TOKEN}${NC}"
echo -e "${YELLOW}Alternatively, use: http://localhost:${PORT}/sse?token=${MCP_TOKEN}${NC}"
echo -e "${BLUE}=============================${NC}"

# Start the server with environment variables
node "${ATRAX_ROOT}/dist/src/cli.js" serve -f "${ATRAX_ROOT}/examples/token-config.json"

# Keep running until Ctrl+C
wait
