/**
 * Authentication provider interface
 */
export interface AuthProvider {
  /**
   * Authenticate a user
   *
   * @param credentials - Credentials for authentication
   * @returns Authentication result
   */
  authenticate(credentials: any): Promise<AuthResult>;

  /**
   * Check if a token is valid
   *
   * @param token - Token to validate
   * @returns Validation result
   */
  validateToken(token: string): Promise<AuthResult>;
}

/**
 * Authentication result
 */
export interface AuthResult {
  /** Authentication success or failure */
  success: boolean;
  /** User identifier */
  userId?: string;
  /** User roles */
  roles?: string[];
  /** Authentication token */
  token?: string;
  /** Error message if authentication failed */
  error?: string;
  /** Token expiration timestamp */
  expiresAt?: number;
}

/**
 * In-memory authentication provider
 *
 * Simple authentication provider that stores credentials in memory
 * Suitable for development and testing, but not for production
 */
export class InMemoryAuthProvider implements AuthProvider {
  private users: Map<string, { password: string; roles: string[] }> = new Map();
  private tokens: Map<string, { userId: string; roles: string[]; expiresAt: number }> = new Map();

  /**
   * Register a user
   *
   * @param userId - User identifier
   * @param password - User password
   * @param roles - User roles
   */
  registerUser(userId: string, password: string, roles: string[] = []): void {
    this.users.set(userId, { password, roles });
  }

  /**
   * Authenticate a user
   *
   * @param credentials - Credentials for authentication
   * @returns Authentication result
   */
  async authenticate(credentials: { userId: string; password: string }): Promise<AuthResult> {
    const { userId, password } = credentials;

    if (!this.users.has(userId)) {
      return { success: false, error: 'User not found' };
    }

    const user = this.users.get(userId)!;

    if (user.password !== password) {
      return { success: false, error: 'Invalid password' };
    }

    // Generate a simple token
    const token = this.generateToken();
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    // Store the token
    this.tokens.set(token, { userId, roles: user.roles, expiresAt });

    return {
      success: true,
      userId,
      roles: user.roles,
      token,
      expiresAt,
    };
  }

  /**
   * Validate a token
   *
   * @param token - Token to validate
   * @returns Validation result
   */
  async validateToken(token: string): Promise<AuthResult> {
    if (!this.tokens.has(token)) {
      return { success: false, error: 'Invalid token' };
    }

    const tokenData = this.tokens.get(token)!;

    // Check if token is expired
    if (tokenData.expiresAt < Date.now()) {
      this.tokens.delete(token);
      return { success: false, error: 'Token expired' };
    }

    return {
      success: true,
      userId: tokenData.userId,
      roles: tokenData.roles,
      expiresAt: tokenData.expiresAt,
    };
  }

  /**
   * Invalidate a token
   *
   * @param token - Token to invalidate
   */
  invalidateToken(token: string): void {
    this.tokens.delete(token);
  }

  /**
   * Generate a random token
   *
   * @returns Random token
   */
  private generateToken(): string {
    return `token_${Math.random().toString(36).substr(2, 9)}_${Date.now()}`;
  }
}

/**
 * Token authentication provider
 *
 * Simple authentication provider that validates against a static token
 */
export class TokenAuthProvider implements AuthProvider {
  private token: string;
  private userId: string;
  private roles: string[];

  /**
   * Create a new token authentication provider
   *
   * @param token - Static token to validate against
   * @param userId - User ID to associate with this token
   * @param roles - Roles to assign to the user
   */
  constructor(token: string, userId: string = 'token-user', roles: string[] = ['user']) {
    this.token = token;
    this.userId = userId;
    this.roles = roles;

    if (!token) {
      console.warn('WARNING: Token is empty. Authentication will fail for all requests.');
    }
  }

  /**
   * Authenticate using token
   *
   * @param credentials - Should contain a token property
   * @returns Authentication result
   */
  async authenticate(credentials: { token: string }): Promise<AuthResult> {
    const { token } = credentials;

    if (token === this.token) {
      return {
        success: true,
        userId: this.userId,
        roles: this.roles,
        token: this.token,
      };
    }

    return { success: false, error: 'Invalid token' };
  }

  /**
   * Validate a token
   *
   * @param token - Token to validate
   * @returns Validation result
   */
  async validateToken(token: string): Promise<AuthResult> {
    if (token === this.token) {
      return {
        success: true,
        userId: this.userId,
        roles: this.roles,
      };
    }

    return { success: false, error: 'Invalid token' };
  }
}

/**
 * No authentication provider
 *
 * Authentication provider that always succeeds
 */
export class NoAuthProvider implements AuthProvider {
  private userId: string;
  private roles: string[];

  /**
   * Create a new no authentication provider
   *
   * @param userId - User ID to associate with requests
   * @param roles - Roles to assign to the user
   */
  constructor(userId: string = 'anonymous', roles: string[] = ['user']) {
    this.userId = userId;
    this.roles = roles;
  }

  /**
   * Always succeeds
   */
  async authenticate(_: any): Promise<AuthResult> {
    return {
      success: true,
      userId: this.userId,
      roles: this.roles,
    };
  }

  /**
   * Always succeeds
   */
  async validateToken(_: string): Promise<AuthResult> {
    return {
      success: true,
      userId: this.userId,
      roles: this.roles,
    };
  }
}

/**
 * Create an authentication provider based on configuration
 *
 * @param authType - Authentication type
 * @param options - Options for the auth provider
 * @returns Authentication provider
 */
export function createAuthProvider(authType: string, options?: any): AuthProvider {
  switch (authType) {
    case 'none':
      // No authentication, always succeeds
      return new NoAuthProvider();

    case 'basic':
      // Simple in-memory authentication
      const basicAuth = new InMemoryAuthProvider();
      if (options?.username && options?.password) {
        basicAuth.registerUser(options.username, options.password, ['user']);
      }
      return basicAuth;

    case 'token':
      // Token-based authentication
      if (!options?.token) {
        throw new Error('Token is required for token authentication');
      }
      return new TokenAuthProvider(options.token, 'token-user', ['user']);

    default:
      throw new Error(`Unsupported authentication type: ${authType}`);
  }
}
