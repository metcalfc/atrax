#!/bin/bash

# Shared utility functions for smoke tests

# Set colors for better output readability
export GREEN='\033[0;32m'
export BLUE='\033[0;34m'
export YELLOW='\033[1;33m'
export RED='\033[0;31m'
export NC='\033[0m' # No Color

# Get the directory where the script is located
export SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Get the project root directory (two levels up from the script directory)
export PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Function to run a command against a stdio server and display results
run_stdio_test() {
  local server_path="$1"
  local server_name="$2"  # Unused but needed for compatibility with other test functions
  local test_name="$3"
  local json_data="$4"
  local token="$5"        # Unused but needed for compatibility with other test functions

  echo -e "${YELLOW}Test: ${test_name}${NC}"
  echo -e "${GREEN}Request:${NC} $json_data"
  echo -e "${GREEN}Response:${NC}"

  # Send request to server via stdin and capture response from stdout
  # Add newline at the end of the JSON data to ensure proper message termination
  # Timeout after 2 seconds since we expect a quick response
  echo "$json_data" | eval timeout 2 $server_path

  # Add spacing for better readability
  echo -e "\n"
}

# Function to make a JSON-RPC call to HTTP/SSE server and display results
send_http_request() {
  local url="$1"
  local test_name="$2"
  local json_data="$3"
  local token="$4"

  echo -e "${YELLOW}Test: ${test_name}${NC}"
  echo -e "${GREEN}Request:${NC} $json_data"
  echo -e "${GREEN}Response:${NC}"

  # Make the request with or without authentication token
  if [ -n "$token" ]; then
    # With authorization token
    local result=$(curl -s -X POST \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $token" \
      -d "$json_data" \
      "$url")
  else
    # Without authorization token
    local result=$(curl -s -X POST \
      -H "Content-Type: application/json" \
      -d "$json_data" \
      "$url")
  fi

  # Pretty-print JSON if possible, otherwise show raw response
  echo "$result" | jq . 2>/dev/null || echo "$result"
  echo -e "\n"
}

# Function to make a JSON-RPC call to Atrax proxy
send_proxy_request() {
  local url="$1"
  local server_name="$2"
  local test_name="$3"
  local json_data="$4"
  local token="$5"

  echo -e "${YELLOW}Test: ${test_name} (Server: ${server_name})${NC}"
  echo -e "${GREEN}Request:${NC} $json_data"
  echo -e "${GREEN}Response:${NC}"

  # Add sessionId to route to the correct server
  local full_url="${url}?sessionId=${server_name}"

  # Make the request with or without authentication token
  if [ -n "$token" ]; then
    local result=$(curl -s -X POST \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $token" \
      -d "$json_data" \
      "$full_url")
  else
    local result=$(curl -s -X POST \
      -H "Content-Type: application/json" \
      -d "$json_data" \
      "$full_url")
  fi

  # Pretty-print JSON if possible, otherwise show raw response
  echo "$result" | jq . 2>/dev/null || echo "$result"
  echo -e "\n"
}

# Generic function to test HTTP endpoint
test_http_endpoint() {
  local url="$1"
  local name="$2"
  local token="$3"

  echo -e "${YELLOW}Testing ${name}...${NC}"

  if [ -n "$token" ]; then
    curl -s -H "Authorization: Bearer $token" "$url" | jq . 2>/dev/null || echo
  else
    curl -s "$url" | jq . 2>/dev/null || echo
  fi

  echo -e "\n"
}

# Start a server in the background and wait for it
start_server() {
  local command="$1"
  local port="$2"
  local health_endpoint="$3"
  local description="$4"
  local pid_file="$5"  # Optional pid file path

  echo -e "${BLUE}Starting ${description} on port ${port}...${NC}"

  # Start server in background
  eval "$command" &
  local pid=$!

  # Save PID to file if specified
  if [ -n "$pid_file" ]; then
    echo $pid > "$pid_file"
    echo -e "${YELLOW}Saved PID $pid to $pid_file${NC}"
  fi

  # Wait for server to start
  echo -e "${YELLOW}Waiting for server to start...${NC}"
  local max_attempts=10
  local attempt=1

  while [ $attempt -le $max_attempts ]; do
    if curl -s "$health_endpoint" > /dev/null; then
      echo -e "${GREEN}Server started successfully (PID: $pid)${NC}\n"
      # Only return the PID number, not any other text
      echo "$pid"
      return 0
    fi

    echo -n "."
    sleep 1
    attempt=$((attempt + 1))
  done

  echo -e "\n${RED}Failed to start server after $max_attempts attempts${NC}"
  return 1
}

# Cleanup function to kill server processes
cleanup_servers() {
  echo -e "${BLUE}Cleaning up...${NC}"

  # Kill all server processes passed as arguments
  for pid in "$@"; do
    if [ -n "$pid" ] && [[ "$pid" =~ ^[0-9]+$ ]]; then
      echo -e "${YELLOW}Killing process $pid...${NC}"
      kill -9 $pid 2>/dev/null || true
      wait $pid 2>/dev/null || true
    fi
  done

  # Also check for PID file
  if [ -n "$ATRAX_PID_FILE" ] && [ -f "$ATRAX_PID_FILE" ]; then
    echo -e "${YELLOW}Stopping Atrax server from pid file...${NC}"
    kill -9 $(cat "$ATRAX_PID_FILE") 2>/dev/null || true
    rm "$ATRAX_PID_FILE" 2>/dev/null
  fi

  # Check if there are any processes using our port and kill them
  if [ -n "$PORT" ]; then
    PORT_PID=$(lsof -ti:$PORT 2>/dev/null)
    if [ -n "$PORT_PID" ]; then
      echo -e "${YELLOW}Found process $PORT_PID still using port $PORT, killing it...${NC}"
      kill -9 $PORT_PID 2>/dev/null || true
    fi
  fi

  echo -e "${GREEN}Servers stopped.${NC}"
}

# Common MCP tool testing for echo server
test_echo_server_tools() {
  local test_function="$1"
  local url_or_path="$2"
  local server_name="$3"
  local token="$4"

  # Get capabilities to see available tools
  $test_function "$url_or_path" "$server_name" "Get Capabilities" '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {
        "tools": {}
      }
    },
    "id": "echo-init"
  }' "$token"

  # List available tools
  $test_function "$url_or_path" "$server_name" "List Available Tools" '{
    "jsonrpc": "2.0",
    "method": "mcp.listTools",
    "id": "echo-list"
  }' "$token"

  # Test simple echo
  $test_function "$url_or_path" "$server_name" "Echo Basic Message" '{
    "jsonrpc": "2.0",
    "method": "mcp.callTool",
    "params": {
      "name": "echo",
      "arguments": {
        "message": "Hello, Echo Server!"
      }
    },
    "id": "echo-1"
  }' "$token"

  # Test echo with special characters
  $test_function "$url_or_path" "$server_name" "Echo Special Characters" '{
    "jsonrpc": "2.0",
    "method": "mcp.callTool",
    "params": {
      "name": "echo",
      "arguments": {
        "message": "!@#$%^&*()_+{}[]|\\\":;<>,.?/"
      }
    },
    "id": "echo-2"
  }' "$token"

  # Test echo with long message
  $test_function "$url_or_path" "$server_name" "Echo Long Message" '{
    "jsonrpc": "2.0",
    "method": "mcp.callTool",
    "params": {
      "name": "echo",
      "arguments": {
        "message": "This is a very long message that repeats. This is a very long message that repeats."
      }
    },
    "id": "echo-3"
  }' "$token"
}

# Common MCP tool testing for memory server
test_memory_server_tools() {
  local test_function="$1"
  local url_or_path="$2"
  local server_name="$3"
  local token="$4"

  # Get capabilities to see available tools
  $test_function "$url_or_path" "$server_name" "Get Capabilities" '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {
        "tools": {}
      }
    },
    "id": "memory-init"
  }' "$token"

  # List available tools
  $test_function "$url_or_path" "$server_name" "List Available Tools" '{
    "jsonrpc": "2.0",
    "method": "mcp.listTools",
    "id": "memory-list"
  }' "$token"

  # Read initial empty graph
  $test_function "$url_or_path" "$server_name" "Read Initial Empty Graph" '{
    "jsonrpc": "2.0",
    "method": "mcp.callTool",
    "params": {
      "name": "read_graph",
      "arguments": {}
    },
    "id": "memory-1"
  }' "$token"

  # Create entities
  $test_function "$url_or_path" "$server_name" "Create Entities" '{
    "jsonrpc": "2.0",
    "method": "mcp.callTool",
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
    "id": "memory-2"
  }' "$token"

  $test_function "$url_or_path" "$server_name" "Create Another Entity" '{
    "jsonrpc": "2.0",
    "method": "mcp.callTool",
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
    "id": "memory-3"
  }' "$token"

  # Create relations
  $test_function "$url_or_path" "$server_name" "Create Relation" '{
    "jsonrpc": "2.0",
    "method": "mcp.callTool",
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
    "id": "memory-4"
  }' "$token"

  # Read graph with entities and relations
  $test_function "$url_or_path" "$server_name" "Read Graph with Entities and Relations" '{
    "jsonrpc": "2.0",
    "method": "mcp.callTool",
    "params": {
      "name": "read_graph",
      "arguments": {}
    },
    "id": "memory-5"
  }' "$token"
}
