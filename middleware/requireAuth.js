/**
 * Express middleware: reject requests that have no valid Strava session.
 * Returns 401 JSON so the frontend can detect it and redirect to /auth/login.
 */
function requireAuth(req, res, next) {
  if (!req.session || !req.session.tokens) {
    return res.status(401).json({ error: 'Not authenticated', loginUrl: '/auth/login' });
  }
  next();
}

module.exports = requireAuth;
