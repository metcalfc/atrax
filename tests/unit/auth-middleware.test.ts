import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { Request, Response, NextFunction } from 'express';
import { AuthProvider, AuthResult } from '../../src/server/auth/auth-provider.js';
import { createAuthMiddleware } from '../../src/server/auth/auth-middleware.js';

// Mock auth provider
class MockAuthProvider implements AuthProvider {
  private tokenValidResult: AuthResult = { success: true, userId: 'user1', roles: ['user'] };
  private tokenInvalidResult: AuthResult = { success: false, error: 'Invalid token' };
  private shouldThrow: boolean = false;

  async authenticate(credentials: any): Promise<AuthResult> {
    return this.tokenValidResult;
  }

  async validateToken(token: string): Promise<AuthResult> {
    if (this.shouldThrow) {
      throw new Error('Auth error');
    }
    
    if (token === 'valid-token') {
      return this.tokenValidResult;
    }
    
    return this.tokenInvalidResult;
  }

  setThrow(shouldThrow: boolean): void {
    this.shouldThrow = shouldThrow;
  }
}

// Mock request, response, and next function
function createMockRequestResponse() {
  const req: Partial<Request> = {
    headers: {},
    path: '/test',
    query: {},
    cookies: {},
    auth: undefined
  };
  
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis()
  };
  
  const next: NextFunction = jest.fn();
  
  return { req: req as Request, res: res as Response, next };
}

describe('Auth Middleware', () => {
  let authProvider: MockAuthProvider;
  let middleware: (req: Request, res: Response, next: NextFunction) => Promise<void | Response>;
  
  beforeEach(() => {
    authProvider = new MockAuthProvider();
    middleware = createAuthMiddleware(authProvider);
  });
  
  it('should pass authentication with valid Bearer token', async () => {
    const { req, res, next } = createMockRequestResponse();
    req.headers.authorization = 'Bearer valid-token';
    
    await middleware(req, res, next);
    
    expect(next).toHaveBeenCalled();
    expect(req.auth).toEqual({
      authenticated: true,
      userId: 'user1',
      roles: ['user']
    });
  });
  
  it('should pass authentication with valid query token', async () => {
    const { req, res, next } = createMockRequestResponse();
    req.query.token = 'valid-token';
    
    await middleware(req, res, next);
    
    expect(next).toHaveBeenCalled();
    expect(req.auth).toEqual({
      authenticated: true,
      userId: 'user1',
      roles: ['user']
    });
  });
  
  it('should pass authentication with valid cookie token', async () => {
    const { req, res, next } = createMockRequestResponse();
    req.cookies = { token: 'valid-token' };
    
    await middleware(req, res, next);
    
    expect(next).toHaveBeenCalled();
    expect(req.auth).toEqual({
      authenticated: true,
      userId: 'user1',
      roles: ['user']
    });
  });
  
  it('should reject authentication with invalid token', async () => {
    const { req, res, next } = createMockRequestResponse();
    req.headers.authorization = 'Bearer invalid-token';
    
    await middleware(req, res, next);
    
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
  });
  
  it('should bypass authentication for health endpoint', async () => {
    const { req, res, next } = createMockRequestResponse();
    req.path = '/health';
    
    await middleware(req, res, next);
    
    expect(next).toHaveBeenCalled();
    expect(req.auth).toEqual({
      authenticated: true,
      userId: 'system',
      roles: ['system']
    });
  });
  
  it('should bypass authentication for debug endpoints in development mode', async () => {
    // Need to recreate middleware with development environment
    process.env.NODE_ENV = 'development';
    const devMiddleware = createAuthMiddleware(authProvider);
    
    const { req, res, next } = createMockRequestResponse();
    req.path = '/debug/status';
    
    await devMiddleware(req, res, next);
    
    expect(next).toHaveBeenCalled();
    expect(req.auth).toEqual({
      authenticated: true,
      userId: 'system',
      roles: ['system']
    });
    
    process.env.NODE_ENV = undefined;
  });
  
  it('should not bypass authentication for debug endpoints in production mode', async () => {
    process.env.NODE_ENV = 'production';
    
    // Re-create middleware with production environment
    const productionMiddleware = createAuthMiddleware(authProvider);
    
    const { req, res, next } = createMockRequestResponse();
    req.path = '/debug/status';
    req.headers.authorization = 'Bearer valid-token';
    
    await productionMiddleware(req, res, next);
    
    // Should check authentication and pass through since we provided a valid token
    expect(next).toHaveBeenCalled();
    expect(req.auth).toEqual({
      authenticated: true,
      userId: 'user1',
      roles: ['user']
    });
    
    process.env.NODE_ENV = undefined;
  });
  
  it('should require authentication for SSE endpoints', async () => {
    const { req, res, next } = createMockRequestResponse();
    req.path = '/sse';
    
    await middleware(req, res, next);
    
    // Should reject without a token
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
  
  it('should handle auth errors', async () => {
    const { req, res, next } = createMockRequestResponse();
    req.headers.authorization = 'Bearer valid-token';
    authProvider.setThrow(true);
    
    await middleware(req, res, next);
    
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication error' });
  });
  
  it('should reject when no token is provided', async () => {
    const { req, res, next } = createMockRequestResponse();
    
    await middleware(req, res, next);
    
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ 
      error: 'Authentication required',
      message: 'Please provide a valid token via Bearer auth header or token query parameter'
    });
  });
  
  it('should handle CORS preflight requests when enabled', async () => {
    const corsMiddleware = createAuthMiddleware(authProvider, { enableCors: true });
    const { req, res, next } = createMockRequestResponse();
    req.method = 'OPTIONS';
    
    await corsMiddleware(req, res, next);
    
    expect(next).not.toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');
    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Headers', 
      'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.end).toHaveBeenCalled();
  });
  
  it('should not throw on failure when configured', async () => {
    const noThrowMiddleware = createAuthMiddleware(authProvider, { throwOnFailure: false });
    const { req, res, next } = createMockRequestResponse();
    
    await noThrowMiddleware(req, res, next);
    
    expect(next).toHaveBeenCalled();
    expect(req.auth).toEqual({
      authenticated: false
    });
  });
});