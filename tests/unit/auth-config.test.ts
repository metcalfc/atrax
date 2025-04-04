import { jest } from '@jest/globals';
import {
  AuthProvider,
  AuthResult,
  InMemoryAuthProvider,
  TokenAuthProvider,
  NoAuthProvider,
  createAuthProvider,
} from '../../src/server/auth/auth-provider.js';

describe('Auth Configuration', () => {
  // Mock process.env
  const originalEnv = process.env;
  // Setup/teardown for environment variables
  beforeEach(() => {
    process.env = { ...originalEnv, MCP_TEST_TOKEN: 'env-test-token' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Auth Provider Creation', () => {
    it('should create a no-auth provider for "none" type', () => {
      const provider = createAuthProvider('none');
      expect(provider).toBeInstanceOf(NoAuthProvider);
    });

    it('should create an in-memory provider for "basic" type', () => {
      const provider = createAuthProvider('basic');
      expect(provider).toBeInstanceOf(InMemoryAuthProvider);
    });

    it('should create a token provider for "token" type', () => {
      const provider = createAuthProvider('token', { token: 'test-token' });
      expect(provider).toBeInstanceOf(TokenAuthProvider);
    });

    it('should throw for unsupported auth types', () => {
      expect(() => createAuthProvider('invalid')).toThrow(
        'Unsupported authentication type: invalid'
      );
    });
  });

  describe('In-Memory Auth Provider', () => {
    let provider: InMemoryAuthProvider;

    beforeEach(() => {
      provider = new InMemoryAuthProvider();
      provider.registerUser('testuser', 'testpass', ['user']);
    });

    it('should authenticate users with valid credentials', async () => {
      const result = await provider.authenticate({
        userId: 'testuser',
        password: 'testpass',
      });

      expect(result.success).toBe(true);
      expect(result.userId).toBe('testuser');
      expect(result.roles).toEqual(['user']);
      expect(result.token).toBeDefined();
    });

    it('should reject users with invalid credentials', async () => {
      const result = await provider.authenticate({
        userId: 'testuser',
        password: 'wrongpass',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid password');
    });

    it('should validate tokens', async () => {
      // Authenticate to get a token
      const authResult = await provider.authenticate({
        userId: 'testuser',
        password: 'testpass',
      });

      const token = authResult.token as string;

      // Validate the token
      const validationResult = await provider.validateToken(token);

      expect(validationResult.success).toBe(true);
      expect(validationResult.userId).toBe('testuser');
      expect(validationResult.roles).toEqual(['user']);
    });

    it('should reject invalid tokens', async () => {
      const validationResult = await provider.validateToken('invalid-token');

      expect(validationResult.success).toBe(false);
      expect(validationResult.error).toBe('Invalid token');
    });

    it('should invalidate tokens', async () => {
      // Authenticate to get a token
      const authResult = await provider.authenticate({
        userId: 'testuser',
        password: 'testpass',
      });

      const token = authResult.token as string;

      // Invalidate the token
      provider.invalidateToken(token);

      // Validate the invalidated token
      const validationResult = await provider.validateToken(token);

      expect(validationResult.success).toBe(false);
      expect(validationResult.error).toBe('Invalid token');
    });
  });
});
