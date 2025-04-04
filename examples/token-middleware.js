/**
 * Simple token middleware for Atrax to use with MCP Inspector
 */
export default function createTokenMiddleware(token) {
  return function tokenMiddleware(req, res, next) {
    // Always allow OPTIONS requests for CORS preflight
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
      res.status(200).end();
      return;
    }
    
    // Allow access to health and debug endpoints without authentication
    if (req.path === '/health' || req.path.startsWith('/debug/')) {
      req.auth = { authenticated: true, userId: 'system', roles: ['admin'] };
      next();
      return;
    }
    
    // Extract bearer token from Authorization header
    const authHeader = req.headers.authorization;
    const queryToken = req.query.token;
    
    console.log('Auth check - Headers:', req.headers);
    console.log('Auth check - Query params:', req.query);
    
    let isAuthenticated = false;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const providedToken = authHeader.slice(7);
      isAuthenticated = providedToken === token;
      console.log(`Token from header: ${providedToken.substring(0, 8)}... authenticated: ${isAuthenticated}`);
    } else if (queryToken) {
      isAuthenticated = queryToken === token;
      console.log(`Token from query: ${queryToken.substring(0, 8)}... authenticated: ${isAuthenticated}`);
    }
    
    if (isAuthenticated) {
      // Set auth info on request
      req.auth = { 
        authenticated: true, 
        userId: 'inspector-user', 
        roles: ['user'] 
      };
      next();
    } else {
      // Set CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      
      // Unauthorized
      res.status(401).json({ 
        error: 'Authentication required', 
        message: 'Please provide a valid token via Bearer auth header or token query parameter' 
      });
    }
  };
}