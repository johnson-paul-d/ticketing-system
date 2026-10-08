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

// Requests share a window per (route, client). req.ip is what Express works
// out from x-forwarded-for under the app's trust-proxy setting: the address the
// proxy saw, not whatever a caller chose to put in the header themselves. The
// raw header's first entry used to be taken, which let a caller open a fresh
// bucket per request by sending a different one each time.
const clientKey = (req) => req.ip || req.socket?.remoteAddress || 'unknown';

/**
 * @param {object} opts
 * @param {number} opts.windowMs  window length
 * @param {number} opts.max       requests allowed per window
 * @param {string} opts.name      bucket namespace, so two routes don't share a counter
 * @param {(req: object) => string} [opts.keyOn]  extra key part (e.g. the target email)
 * @param {boolean} [opts.byKeyOnly]  bucket on keyOn alone, ignoring the client:
 *   a limit per account rather than per caller, so changing address does not
 *   buy more attempts against the same account
 */
const rateLimit = ({ windowMs, max, name, keyOn, byKeyOnly = false }) => (req, res, next) => {
  const now = Date.now();
  const key = byKeyOnly ? `${name}::${keyOn(req)}` : `${name}:${clientKey(req)}:${keyOn ? keyOn(req) : ''}`;

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
