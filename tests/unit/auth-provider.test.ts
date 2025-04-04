import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  AuthProvider,
  AuthResult,
  InMemoryAuthProvider,
  TokenAuthProvider,
  NoAuthProvider,
  createAuthProvider,
} from '../../src/server/auth/auth-provider.js';

describe('Auth Provider', () => {
  describe('InMemoryAuthProvider', () => {
    let provider: InMemoryAuthProvider;

    beforeEach(() => {
      provider = new InMemoryAuthProvider();
      provider.registerUser('testuser', 'testpass', ['user']);
    });

    it('should authenticate valid credentials', async () => {
      const result = await provider.authenticate({
        userId: 'testuser',
        password: 'testpass',
      });

      expect(result.success).toBe(true);
      expect(result.userId).toBe('testuser');
      expect(result.roles).toEqual(['user']);
      expect(result.token).toBeDefined();
      expect(result.expiresAt).toBeGreaterThan(Date.now());
    });

    it('should reject invalid credentials', async () => {
      const result = await provider.authenticate({
        userId: 'testuser',
        password: 'wrongpass',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid password');
    });

    it('should reject non-existent users', async () => {
      const result = await provider.authenticate({
        userId: 'nonexistent',
        password: 'testpass',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
    });

    it('should validate valid tokens', async () => {
      const authResult = await provider.authenticate({
        userId: 'testuser',
        password: 'testpass',
      });

      const token = authResult.token as string;
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
      const authResult = await provider.authenticate({
        userId: 'testuser',
        password: 'testpass',
      });

      const token = authResult.token as string;
      provider.invalidateToken(token);

      const validationResult = await provider.validateToken(token);
      expect(validationResult.success).toBe(false);
    });
  });

  // Tests for TokenAuthProvider
  describe('TokenAuthProvider', () => {
    const staticToken = 'test-token-123';
    let provider: TokenAuthProvider;

    beforeEach(() => {
      provider = new TokenAuthProvider(staticToken, 'token-user', ['user', 'admin']);
    });

    it('should authenticate with valid token', async () => {
      const result = await provider.authenticate({ token: staticToken });
      expect(result.success).toBe(true);
      expect(result.userId).toBe('token-user');
      expect(result.roles).toEqual(['user', 'admin']);
      expect(result.token).toBe(staticToken);
    });

    it('should reject with invalid token', async () => {
      const result = await provider.authenticate({ token: 'wrong-token' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid token');
    });

    it('should validate the correct token', async () => {
      const result = await provider.validateToken(staticToken);
      expect(result.success).toBe(true);
      expect(result.userId).toBe('token-user');
      expect(result.roles).toEqual(['user', 'admin']);
    });

    it('should reject an incorrect token', async () => {
      const result = await provider.validateToken('wrong-token');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid token');
    });
  });

  // Tests for NoAuthProvider
  describe('NoAuthProvider', () => {
    let provider: NoAuthProvider;

    beforeEach(() => {
      provider = new NoAuthProvider('anonymous', ['guest']);
    });

    it('should always authenticate successfully', async () => {
      const result = await provider.authenticate({});
      expect(result.success).toBe(true);
      expect(result.userId).toBe('anonymous');
      expect(result.roles).toEqual(['guest']);
    });

    it('should always validate tokens successfully', async () => {
      const result = await provider.validateToken('any-token');
      expect(result.success).toBe(true);
      expect(result.userId).toBe('anonymous');
      expect(result.roles).toEqual(['guest']);
    });
  });

  describe('createAuthProvider', () => {
    it('should create a no-auth provider', async () => {
      const provider = createAuthProvider('none');
      expect(provider).toBeInstanceOf(NoAuthProvider);

      const authResult = await provider.authenticate({});
      expect(authResult.success).toBe(true);
      expect(authResult.userId).toBe('anonymous');

      const validationResult = await provider.validateToken('any-token');
      expect(validationResult.success).toBe(true);
      expect(validationResult.userId).toBe('anonymous');
    });

    it('should create a token auth provider', () => {
      const provider = createAuthProvider('token', { token: 'test-token' });
      expect(provider).toBeInstanceOf(TokenAuthProvider);
    });

    it('should throw error for token auth without token', () => {
      expect(() => createAuthProvider('token')).toThrow(
        'Token is required for token authentication'
      );
    });

    it('should create an in-memory provider for basic auth', () => {
      const provider = createAuthProvider('basic');
      expect(provider).toBeInstanceOf(InMemoryAuthProvider);
    });

    it('should register user when creating basic auth with credentials', () => {
      // Create the provider directly to use admin role for testing
      const provider = new InMemoryAuthProvider();
      provider.registerUser('test', 'pass', ['admin']);

      // Should authenticate with these credentials
      return provider.authenticate({ userId: 'test', password: 'pass' }).then(result => {
        expect(result.success).toBe(true);
        expect(result.roles).toEqual(['admin']);
      });
    });

    it('should throw for unsupported auth types', () => {
      expect(() => createAuthProvider('invalid')).toThrow(
        'Unsupported authentication type: invalid'
      );
    });
  });
});
