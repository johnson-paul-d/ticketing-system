// =====================================================
// Quality scorecard API — the reviewer only
// =====================================================
// GET  /access                 { reviewer } for the signed-in person (anyone may ask)
// GET  /?period=…              the scorecard: this-week | last-week | this-month | last-month | YYYY-MM | YYYY-MM..YYYY-MM
// GET  /tasks/:id              one task's score card and rating history
// PUT  /tasks/:id              save stars, remarks, include/exclude
// GET  /email-preview?kind=…   the weekly or monthly email as HTML
// POST /test-email { kind }    send that email to the signed-in reviewer now

const express = require('express');
const auth = require('../middleware/auth');
const {
  isReviewer,
  buildScorecard,
  taskScore,
  saveRating,
} = require('../services/scorecard');
const { buildScorecardEmail } = require('../services/scorecardMail');
const { sendScorecardEmail } = require('../services/scorecardScheduler');

const router = express.Router();

router.get('/access', auth, (req, res) => {
  res.json({ reviewer: isReviewer(req.user) });
});

const reviewerOnly = (req, res, next) => {
  if (!isReviewer(req.user)) {
    return res.status(403).json({ message: 'The scorecard is for the reviewer only' });
  }
  next();
};

const PERIOD_RX = /^(this-week|last-week|this-month|last-month|\d{4}-\d{2}(\.\.\d{4}-\d{2})?)$/;
const kindOf = (v) => (v === 'monthly' ? 'monthly' : 'weekly');

router.get('/', auth, reviewerOnly, async (req, res) => {
  try {
    const period = PERIOD_RX.test(req.query.period || '') ? req.query.period : 'this-month';
    res.json(await buildScorecard(req.user, period));
  } catch (err) {
    console.error('Scorecard error:', err);
    res.status(500).json({ message: 'Could not build the scorecard' });
  }
});

router.get('/tasks/:id', auth, reviewerOnly, async (req, res) => {
  try {
    const card = await taskScore(req.user, req.params.id);
    if (!card) return res.status(404).json({ message: 'Ticket not found' });
    res.json(card);
  } catch (err) {
    console.error('Task score error:', err);
    res.status(500).json({ message: 'Could not read the task score' });
  }
});

router.put('/tasks/:id', auth, reviewerOnly, async (req, res) => {
  try {
    const result = await saveRating(req.user, req.params.id, req.body || {});
    if (result.status !== 200) return res.status(result.status).json({ message: result.message });
    res.json(await taskScore(req.user, req.params.id));
  } catch (err) {
    console.error('Save rating error:', err);
    res.status(500).json({ message: 'Could not save the rating' });
  }
});

router.get('/email-preview', auth, reviewerOnly, async (req, res) => {
  try {
    const kind = kindOf(req.query.kind);
    const card = await buildScorecard(req.user, kind === 'weekly' ? 'last-week' : 'last-month');
    const { subject, html } = buildScorecardEmail(card, kind);
    res.json({ subject, html });
  } catch (err) {
    console.error('Scorecard preview error:', err);
    res.status(500).json({ message: 'Could not build the email' });
  }
});

router.post('/test-email', auth, reviewerOnly, async (req, res) => {
  try {
    const kind = kindOf(req.body?.kind);
    const { ok, error } = await sendScorecardEmail(req.user, kind, req.user.email, { test: true });
    if (!ok) return res.status(502).json({ message: `The email could not be sent: ${error || 'unknown error'}` });
    res.json({ sentTo: req.user.email });
  } catch (err) {
    console.error('Scorecard test email error:', err);
    res.status(500).json({ message: 'Could not send the test email' });
  }
});

module.exports = router;
