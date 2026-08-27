const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const supabase = require('../config/supabase');
const { isAdmin, isSuperAdmin, teamFromRole, getUserTeam } = require('../utils/roles');
const { rateLimit } = require('../utils/rateLimit');
const { buildReport } = require('../services/workReportData');
const { renderReport } = require('../services/workReportPpt');
const { todayIST } = require('../utils/time');

router.use(auth);

const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

// A filename that survives a browser, a mail client and a Windows share.
const safeFile = (name) =>
  String(name).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Work Report';

// =====================================================
// Who this caller may report on
// =====================================================
// Everyone gets themselves. An admin also gets their team, and a Super Admin
// gets everyone — the same rule the admin panel uses, so the download page can
// never offer a name the report itself would refuse.
router.get('/subjects', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, role, division, designation, active')
      .eq('active', true);
    if (error) throw error;

    const mayReportOn = (u) =>
      u.id === req.user.id ||
      isSuperAdmin(req.user) ||
      (isAdmin(req.user) && teamFromRole(u.role) === getUserTeam(req.user));

    res.json({
      canReportOnOthers: isAdmin(req.user),
      canReportOnTeam: isAdmin(req.user),
      team: getUserTeam(req.user),
      people: (data || [])
        .filter(mayReportOn)
        .sort((a, b) => (a.id === req.user.id ? -1 : b.id === req.user.id ? 1 : a.name.localeCompare(b.name)))
        .map((u) => ({
          id: u.id,
          name: u.name,
          role: u.role,
          designation: u.designation || null,
          isMe: u.id === req.user.id,
        })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load who you can report on' });
  }
});

// =====================================================
// The deck
// =====================================================
// Generating one reads every ticket for everyone in scope and renders a
// document, so it is rate-limited: a held-down download button on a team of
// twenty would otherwise be an easy way to exhaust a small dyno.
router.get(
  '/work.pptx',
  rateLimit({ name: 'work-report', windowMs: 5 * 60 * 1000, max: 20 }),
  async (req, res) => {
    try {
      const scope = ['me', 'person', 'team'].includes(req.query.scope) ? req.query.scope : 'me';
      const dateField = req.query.dateField === 'due' ? 'due' : 'created';
      const from = isDate(req.query.from) ? req.query.from : null;
      const to = isDate(req.query.to) ? req.query.to : null;

      if (from && to && from > to) {
        return res.status(400).json({ message: 'The start date is after the end date' });
      }
      if (scope === 'person' && !req.query.userId) {
        return res.status(400).json({ message: 'Choose whose report to run' });
      }
      // An API key acts as someone, and a report is a bulk export of their
      // team's work. Minting one to pull the whole team's activity as a file is
      // not what a read-only integration key is for.
      if (req.apiKey && scope === 'team') {
        return res.status(403).json({ message: 'API keys cannot export a whole-team report' });
      }

      const report = await buildReport(req.user, {
        scope,
        userId: req.query.userId,
        from,
        to,
        dateField,
        reference: todayIST(),
      });

      // A team report drops empty people, but a personal one keeps its single
      // subject even with nothing assigned — so emptiness has to be tested on
      // the work, not on the list of people.
      if (!report.people.some((p) => p.totals.assigned > 0)) {
        return res.status(404).json({
          message: 'No work falls in that window, so there is nothing to report',
        });
      }

      const buffer = await renderReport(report);

      const subject =
        scope === 'team'
          ? `${report.team || 'Team'} team`
          : report.people[0].person.name;
      const span = from && to ? ` ${from} to ${to}` : from ? ` from ${from}` : to ? ` to ${to}` : '';
      const filename = safeFile(`${subject} - Work Report${span}`);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.pptx"`);
      res.setHeader('Content-Length', buffer.length);
      res.send(buffer);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ message: err.message });
      console.error('WORK REPORT ERROR:', err);
      res.status(500).json({ message: 'Failed to build the report' });
    }
  }
);

// A cheap preview so the page can say what the download will contain before
// spending a render on it.
router.get('/work/preview', async (req, res) => {
  try {
    const scope = ['me', 'person', 'team'].includes(req.query.scope) ? req.query.scope : 'me';
    const report = await buildReport(req.user, {
      scope,
      userId: req.query.userId,
      from: isDate(req.query.from) ? req.query.from : null,
      to: isDate(req.query.to) ? req.query.to : null,
      dateField: req.query.dateField === 'due' ? 'due' : 'created',
      reference: todayIST(),
    });

    res.json({
      window: report.window,
      people: report.people.map((p) => ({
        name: p.person.name,
        assigned: p.totals.assigned,
        completed: p.totals.completed,
        open: p.totals.open,
        overdueOpen: p.totals.overdueOpen,
        onTimeRate: p.totals.onTimeRate,
        hoursLogged: p.totals.hoursLogged,
        upcoming: p.upcoming.length,
      })),
      // Cover, plus what each person contributes.
      slides:
        scope === 'team'
          ? 2 + report.people.length
          : 1 + (report.people[0] ? 5 + (report.people[0].projects.length ? 1 : 0) : 0),
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error(err);
    res.status(500).json({ message: 'Failed to preview the report' });
  }
});

module.exports = router;
