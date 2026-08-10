// Turns any predicate from utils/roles.js into route middleware, so the server
// enforces the same rules the client uses to hide navigation.
//
//   router.use(auth, requireAccess(canAccessGoogleAds));
//
// Must be mounted after `auth`, which is what populates req.user.
module.exports = (predicate, message = 'You do not have access to this resource') => (req, res, next) => {
  if (!predicate(req.user)) return res.status(403).json({ message });
  next();
};
