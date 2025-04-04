// This file adds type declarations for test mocks

declare namespace jest {
  interface Mock<T = any, Y extends any[] = any[]> {
    mockResolvedValue(value: any): this;
    mockRejectedValue(value: any): this;
  }
}

declare module '@modelcontextprotocol/sdk/server/sse.js' {
  class SSEServerTransport {
    get sessionId(): string;
    start(): Promise<any>;
    close(): Promise<any>;
    send(message: any): Promise<any>;
    handlePostMessage(req: any, res: any): Promise<any>;
    onmessage: ((message: any) => void) | null;
    onerror: ((error: any) => void) | null;
    onclose: (() => void) | null;
  }
}

declare module '@modelcontextprotocol/sdk/types.js' {
  interface JSONRPCMessage {
    jsonrpc: string;
    id: string | number;
    method?: string;
    params?: any;
    result?: any;
    error?: any;
  }
}