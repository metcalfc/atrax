import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import express, { Application } from 'express';
import { setupAuth } from '../../src/server/auth/index.js';
import { AuthConfig } from '../../src/types/config.js';
import { AuthProvider, NoAuthProvider, TokenAuthProvider, InMemoryAuthProvider } from '../../src/server/auth/auth-provider.js';

// Mock express app
function createMockApp() {
  const app = {
    use: jest.fn()
  } as unknown as Application;
  
  return app;
}

describe('Auth Setup', () => {
  let app: Application;
  
  beforeEach(() => {
    app = createMockApp();
  });
  
  it('should set up no auth provider when config is undefined', () => {
    const provider = setupAuth(app, undefined);
    
    expect(app.use).toHaveBeenCalled();
    expect(provider).toBeInstanceOf(NoAuthProvider);
  });
  
  it('should set up no auth provider with none type', () => {
    const authConfig: AuthConfig = { type: 'none' };
    const provider = setupAuth(app, authConfig);
    
    expect(app.use).toHaveBeenCalled();
    expect(provider).toBeInstanceOf(NoAuthProvider);
  });
  
  it('should set up token auth provider', () => {
    const authConfig: AuthConfig = { 
      type: 'token', 
      options: { token: 'test-token' } 
    };
    
    const provider = setupAuth(app, authConfig);
    
    expect(app.use).toHaveBeenCalled();
    expect(provider).toBeInstanceOf(TokenAuthProvider);
  });
  
  it('should set up basic auth provider', () => {
    const authConfig: AuthConfig = { 
      type: 'basic', 
      options: { 
        username: 'testuser', 
        password: 'testpass' 
      } 
    };
    
    const provider = setupAuth(app, authConfig);
    
    expect(app.use).toHaveBeenCalled();
    expect(provider).toBeInstanceOf(InMemoryAuthProvider);
  });
  
  it('should throw error for oauth2 provider', () => {
    const authConfig: AuthConfig = { 
      type: 'oauth2', 
      options: { 
        clientId: 'test-client', 
        clientSecret: 'test-secret',
        tokenUrl: 'https://example.com/token'
      } 
    };
    
    expect(() => setupAuth(app, authConfig)).toThrow('OAuth2 authentication is not yet implemented');
  });
  
  it('should apply custom middleware options', () => {
    const authConfig: AuthConfig = { type: 'none' };
    const middlewareOptions = {
      bypassPaths: ['/custom-path'],
      enableCors: false
    };
    
    // Since we can't directly examine the middleware options,
    // we're mainly checking that the function doesn't throw
    const provider = setupAuth(app, authConfig, middlewareOptions);
    
    expect(app.use).toHaveBeenCalled();
    expect(provider).toBeInstanceOf(NoAuthProvider);
  });
  
  it('should throw error for token auth without token', () => {
    const authConfig: AuthConfig = { 
      type: 'token', 
      options: {} 
    };
    
    expect(() => setupAuth(app, authConfig)).toThrow('Token is required for token authentication');
  });
  
  it('should throw error for basic auth without credentials', () => {
    const authConfig: AuthConfig = { 
      type: 'basic', 
      options: {} 
    };
    
    expect(() => setupAuth(app, authConfig)).toThrow('Username and password are required for basic authentication');
  });
});