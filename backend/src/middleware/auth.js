export function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

export function requireSetup(req, res, next) {
  // Middleware that allows setup even without channels connected
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Unauthorized' });
}
