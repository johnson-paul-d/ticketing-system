const { isAdmin } = require('../utils/roles');

module.exports = (req, res, next) => {
  if (!isAdmin(req.user)) {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};