// =====================================================
// Passwords: hashing, checking, and the temporary mark
// =====================================================
// Passwords are stored as bcrypt hashes and nowhere else. The one thing a
// stored value can carry besides the hash is a mark saying the password is
// TEMPORARY: a Super Admin set it for everyone at once, and whoever signs in
// with it may do one thing only, which is set a password of their own. The
// mark carries the time it was set, and a temporary password stops working
// TEMPORARY_TTL after that, so one password known to a whole office does not
// stay live for an account whose owner is away.
//
// The mark is a prefix on the stored value rather than a column, so the reset
// needs no migration to work and nothing else that reads the column has to
// change. Setting a password by any other route (the admin panel, the e-mailed
// reset code, the person's own change) stores a plain hash and lifts the mark.
//
// A password is hashed and checked after trimming, so a space pasted at either
// end can never make a password that nobody can type.

const bcrypt = require('bcryptjs');

const TEMPORARY = 'temporary:';
const TEMPORARY_TTL_MS = 72 * 60 * 60 * 1000;
const MIN_LENGTH = 8;

const clean = (plain) => String(plain ?? '').trim();

const hashPassword = (plain) => bcrypt.hash(clean(plain), 10);
const hashTemporaryPassword = async (plain) =>
  `${TEMPORARY}${Math.floor(Date.now() / 1000)}:${await bcrypt.hash(clean(plain), 10)}`;

// { setAt: Date, hash } for a temporary value, null for anything else.
const parseTemporary = (stored) => {
  if (typeof stored !== 'string' || !stored.startsWith(TEMPORARY)) return null;
  const m = stored.slice(TEMPORARY.length).match(/^(\d+):(.+)$/);
  return m ? { setAt: new Date(Number(m[1]) * 1000), hash: m[2] } : null;
};

const isTemporary = (stored) => parseTemporary(stored) !== null;
const temporaryExpired = (stored) => {
  const t = parseTemporary(stored);
  return !!t && Date.now() - t.setAt.getTime() > TEMPORARY_TTL_MS;
};

// True when `plain` is the password behind `stored`, temporary or not. False
// for a row with no password at all. Expiry is the caller's to check.
const checkPassword = async (plain, stored) => {
  if (typeof stored !== 'string' || !stored) return false;
  const hash = (parseTemporary(stored)?.hash ?? stored).trim();
  if (!hash) return false;
  return bcrypt.compare(clean(plain), hash);
};

// The one place the rule for a new password lives. Returns the reason it is
// not acceptable, or null.
const passwordProblem = (plain) => {
  if (typeof plain !== 'string' || clean(plain).length < MIN_LENGTH) {
    return `Password must be at least ${MIN_LENGTH} characters`;
  }
  return null;
};

module.exports = {
  hashPassword,
  hashTemporaryPassword,
  isTemporary,
  temporaryExpired,
  checkPassword,
  passwordProblem,
  MIN_LENGTH,
  TEMPORARY_TTL_MS,
};
