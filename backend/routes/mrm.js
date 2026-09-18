const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');
const requireAccess = require('../middleware/requireAccess');
const { isAdmin, isServiceTeam } = require('../utils/roles');
const { rateLimit } = require('../utils/rateLimit');
const { buildMrm, loadInputs, saveInput, resetInput, lockMonth, DEFAULT_KEYS } = require('../services/mrmData');
const { renderMrm } = require('../services/mrmPpt');
const DEFAULTS = require('../services/mrmDefaults');
const { todayIST } = require('../utils/time');

// =====================================================
// MRM report — the monthly management review deck
// =====================================================
// Marketing leadership only. The deck carries pipeline values, named
// opportunities and per-salesperson lead figures read from Salesforce, none of
// which the rest of the portal exposes, so the gate is admins of the Marketing
// team (and Super Admins), enforced here rather than by hiding a menu item.
const canSeeMrm = (user) => isAdmin(user) && !isServiceTeam(user);
router.use(auth, requireAccess(canSeeMrm, 'The MRM report is available to Marketing admins'));

const monthOf = (req) => {
  const m = String(req.query.month || '').trim();
  // Default: last month, since the review covers the month just closed.
  if (!m) {
    const [y, mo] = todayIST().split('-').map(Number);
    const t = y * 12 + (mo - 1) - 1;
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
  }
  return m;
};

const fail = (res, err, fallback) => {
  if (err.status) return res.status(err.status).json({ message: err.message });
  console.error('MRM ERROR:', err);
  res.status(500).json({ message: fallback });
};

// The figures behind the deck, for the portal page to preview.
router.get('/data', async (req, res) => {
  try {
    res.json(await buildMrm(monthOf(req), req.user.name));
  } catch (err) {
    fail(res, err, 'Failed to build the MRM figures');
  }
});

// The deck itself. Rate limited: each one reads Salesforce and the portal and
// renders a document.
router.get(
  '/deck.pptx',
  rateLimit({ name: 'mrm-deck', windowMs: 5 * 60 * 1000, max: 20 }),
  async (req, res) => {
    try {
      // A deck is a bulk export of sales figures; an integration key has no
      // business pulling one. Same rule as the whole-team work report.
      if (req.apiKey) return res.status(403).json({ message: 'API keys cannot export the MRM deck' });

      const model = await buildMrm(monthOf(req), req.user.name);
      const buffer = await renderMrm(model);
      const name = `MKT MRM ${model.meta.monthName.slice(0, 3).toUpperCase()} ${model.meta.year}`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
      res.setHeader('Content-Disposition', `attachment; filename="${name}.pptx"`);
      res.setHeader('Content-Length', buffer.length);
      res.send(buffer);
    } catch (err) {
      fail(res, err, 'Failed to build the MRM deck');
    }
  }
);

// Inputs: what the deck cannot compute. GET returns the effective value of
// every key (stored, or the built-in default) plus which ones are stored.
router.get('/inputs', async (req, res) => {
  try {
    const { inputs, meta } = await loadInputs();
    res.json({ inputs, meta, keys: DEFAULT_KEYS });
  } catch (err) {
    fail(res, err, 'Failed to load the MRM inputs');
  }
});

router.put('/inputs/:key', async (req, res) => {
  try {
    const value = req.body?.value;
    if (value === undefined || value === null || typeof value !== 'object') {
      return res.status(400).json({ message: 'Send { "value": <object or array> }' });
    }
    // Shape check against the default: an array must stay an array. Anything
    // finer is the editor's job; the report tolerates missing fields.
    if (Array.isArray(DEFAULTS[req.params.key]) !== Array.isArray(value)) {
      return res.status(400).json({ message: `"${req.params.key}" must be ${Array.isArray(DEFAULTS[req.params.key]) ? 'a list' : 'an object'}` });
    }
    await saveInput(req.params.key, value, req.user.name);
    res.json({ message: 'Saved', key: req.params.key });
  } catch (err) {
    fail(res, err, 'Failed to save');
  }
});

// Freeze the review month's figures into history. Idempotent: pressing it
// again after a late Salesforce change simply overwrites with today's values.
router.post('/lock', async (req, res) => {
  try {
    const month = String(req.body?.month || monthOf(req));
    const result = await lockMonth(month, req.user.name);
    res.json({ message: `Locked ${month}`, ...result });
  } catch (err) {
    fail(res, err, 'Failed to lock the month');
  }
});

router.delete('/inputs/:key', async (req, res) => {
  try {
    if (!DEFAULT_KEYS.includes(req.params.key)) return res.status(400).json({ message: 'Unknown input' });
    await resetInput(req.params.key);
    res.json({ message: 'Reset to the built-in default', key: req.params.key, value: DEFAULTS[req.params.key] });
  } catch (err) {
    fail(res, err, 'Failed to reset');
  }
});

module.exports = router;
