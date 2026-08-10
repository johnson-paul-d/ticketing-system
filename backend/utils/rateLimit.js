// =====================================================
// Fixed-window in-memory rate limiter
// =====================================================
// Deliberately dependency-free and process-local: the app runs as a single
// instance, and the goal here is to stop credential-stuffing and OTP-guessing
// loops, not to be a distributed quota system. If this ever scales past one
// instance, swap the Map for Redis — the middleware signature stays the same.

const buckets = new Map(); // key -> { count, resetAt }

setInterval(() => {
  const now = Date.now();
  for (const [key, b] of buckets) if (b.resetAt < now) buckets.delete(key);
}, 60 * 1000).unref();

// Requests share a window per (route, client). Proxies put the real client IP
// in x-forwarded-for; Render and Vercel both do, so prefer it over the socket
// address, which would otherwise bucket every user behind the proxy together.
const clientKey = (req) => {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'unknown';
};

/**
 * @param {object} opts
 * @param {number} opts.windowMs  window length
 * @param {number} opts.max       requests allowed per window
 * @param {string} opts.name      bucket namespace, so two routes don't share a counter
 * @param {(req: object) => string} [opts.keyOn]  extra key part (e.g. the target email)
 */
const rateLimit = ({ windowMs, max, name, keyOn }) => (req, res, next) => {
  const now = Date.now();
  const key = `${name}:${clientKey(req)}:${keyOn ? keyOn(req) : ''}`;

  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  bucket.count += 1;

  if (bucket.count > max) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({
      message: `Too many attempts. Try again in ${retryAfter} second${retryAfter === 1 ? '' : 's'}.`,
    });
  }

  next();
};

module.exports = { rateLimit };
