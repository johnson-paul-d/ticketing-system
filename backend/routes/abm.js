const express = require('express');
const router = express.Router();

const supabase = require('../config/supabase');
const auth = require('../middleware/auth');
const getISTTime = require('../utils/time');

const isAdmin = (user) => user.role === 'Admin' || user.role === 'Super Admin';

// ABM is restricted to admins + Johnson Paul D
const ABM_USER_IDS = ['d5f32730-4953-4c7c-9185-c87e6eca329d'];
const abmAccess = (req, res, next) => {
  if (isAdmin(req.user) || ABM_USER_IDS.includes(req.user.id)) return next();
  return res.status(403).json({ message: 'You do not have access to the ABM CRM' });
};
router.use(auth, abmAccess);

// Migration not run yet → tell the client clearly instead of a generic 500
const isMissingSchema = (error) =>
  error && ['PGRST205', '42P01', '42703'].includes(error.code);

const migrationResponse = (res) =>
  res.status(503).json({
    message:
      'ABM CRM is not set up yet. Run backend/database/abm-migration.sql in Supabase.',
    code: 'ABM_MIGRATION_REQUIRED',
  });

const CLOSED_CONTACT_STATUSES = ['Closed Won', 'Closed Lost'];
const POSITIVE_RESULTS = ['Responded', 'Interested', 'Meeting Fixed', 'Connected'];

// Supabase REST caps responses at 1000 rows — page through everything
const fetchAll = async (table, select, applyFilters) => {
  const PAGE = 1000;
  let from = 0;
  const rows = [];
  for (;;) {
    let q = supabase.from(table).select(select).range(from, from + PAGE - 1);
    if (applyFilters) q = applyFilters(q);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE) return rows;
    from += PAGE;
  }
};

// =====================================================
// PIPELINE RULES
// =====================================================

// What a logged activity does to the contact's pipeline status
const statusAfterActivity = (type, result) => {
  if (result === 'Meeting Fixed') return 'Meeting Scheduled';
  if (result === 'Responded' || result === 'Interested') return 'Interested';
  if (result === 'Not Interested') return 'Future Follow-up';
  if (result === 'Wrong Contact') return 'Wrong Contact';
  switch (type) {
    case 'Research': return 'Contact Identified';
    case 'Cold Email 1': return 'Email 1 Sent';
    case 'Cold Email 2': return 'Email 2 Sent';
    case 'Cold Email 3': return 'Email 3 Sent';
    case 'LinkedIn Connect':
      return result === 'Connected' ? 'LinkedIn Connected' : 'LinkedIn Requested';
    case 'LinkedIn Message':
    case 'Sales Navigator Message':
      return 'LinkedIn Message Sent';
    case 'WhatsApp': return 'WhatsApp Sent';
    case 'Direct Call': return 'Called';
    case 'Meeting': return 'Meeting Scheduled';
    case 'Proposal Sent': return 'Proposal Sent';
    default: return null; // Follow-up, Demo, Visit → status unchanged
  }
};

// Wait days after each activity type before the next step is due.
// Editable via abm_settings.sequence_waits; these are the fallbacks.
const DEFAULT_WAITS = {
  'Cold Email 1': 5,
  'Cold Email 2': 5,
  'Cold Email 3': 5,
  'LinkedIn Connect': 5,
  'LinkedIn Message': 3,
  'Sales Navigator Message': 3,
  WhatsApp: 3,
  'Direct Call': 5,
  'Follow-up': 5,
  Meeting: 1,
  Demo: 1,
  'Proposal Sent': 7,
  Visit: 3,
};

const loadWaits = async () => {
  try {
    const { data, error } = await supabase
      .from('abm_settings')
      .select('sequence_waits')
      .eq('id', 1)
      .maybeSingle();
    if (error || !data) return { ...DEFAULT_WAITS };
    const merged = { ...DEFAULT_WAITS };
    Object.entries(data.sequence_waits || {}).forEach(([k, v]) => {
      const n = parseInt(v, 10);
      if (k in merged && Number.isFinite(n) && n >= 0 && n <= 365) merged[k] = n;
    });
    return merged;
  } catch {
    return { ...DEFAULT_WAITS };
  }
};

// Automation rules: given the contact's last touch, what comes next and
// after how many days of waiting
const nextActionFor = (contact, waits = DEFAULT_WAITS) => {
  if (contact.do_not_contact) return null;
  if (CLOSED_CONTACT_STATUSES.includes(contact.status)) return null;
  if (contact.status === 'Wrong Contact') return null;

  // Manual override always wins
  if (contact.next_action) {
    return {
      action: contact.next_action,
      due: contact.next_action_due || null,
      manual: true,
    };
  }

  const type = contact.last_activity_type;
  const result = contact.last_activity_result;
  const lastAt = contact.last_activity_at
    ? contact.last_activity_at.split('T')[0]
    : null;

  const after = (days, action) => {
    let due = null;
    if (lastAt) {
      const d = new Date(lastAt);
      d.setDate(d.getDate() + days);
      due = d.toISOString().split('T')[0];
    }
    return { action, due, manual: false };
  };

  // Positive response → move to meeting immediately
  if (result === 'Responded' || result === 'Interested') {
    return after(0, 'Schedule Meeting');
  }
  if (result === 'Meeting Fixed') return after(0, 'Hold Meeting & Log Outcome');
  if (result === 'Not Interested') return null;

  if (!type) return { action: 'Send Email 1', due: null, manual: false };

  const w = (t) => waits[t] ?? DEFAULT_WAITS[t] ?? 5;
  switch (type) {
    case 'Research': return after(0, 'Send Email 1');
    case 'Cold Email 1': return after(w(type), 'Send Email 2');
    case 'Cold Email 2': return after(w(type), 'LinkedIn Connect');
    case 'Cold Email 3': return after(w(type), 'LinkedIn Connect');
    case 'LinkedIn Connect':
      return result === 'Connected'
        ? after(0, 'Send LinkedIn Message')
        : after(w(type), 'Send WhatsApp');
    case 'LinkedIn Message':
    case 'Sales Navigator Message':
      return after(w(type), 'Send WhatsApp');
    case 'WhatsApp': return after(w(type), 'Call');
    case 'Direct Call': return after(w(type), 'Follow-up');
    case 'Follow-up': return after(w(type), 'Call');
    case 'Meeting':
    case 'Demo':
      return after(w(type), 'Send Proposal');
    case 'Proposal Sent': return after(w(type), 'Follow up on Proposal');
    case 'Visit': return after(w(type), 'Follow-up');
    default: return after(5, 'Follow-up');
  }
};

const TIER_WEIGHT = { 'Tier 1': 15, 'Tier 2': 5, 'Tier 3': 0 };
const PRIORITY_WEIGHT = { High: 10, Medium: 4, Low: 0 };

// =====================================================
// DASHBOARD
// =====================================================
router.get('/dashboard', auth, async (req, res) => {
  try {
    let accounts;
    try {
      accounts = await fetchAll('abm_accounts', 'id, name, country, status, tier');
    } catch (error) {
      if (isMissingSchema(error)) return migrationResponse(res);
      throw error;
    }
    const contacts = await fetchAll(
      'abm_contacts',
      'id, account_id, status, decision_maker, last_activity_type, last_activity_result'
    );
    const activities = await fetchAll(
      'abm_activities',
      'id, account_id, contact_id, activity_type, channel, result, activity_date'
    );

    const EMAIL_TYPES = ['Cold Email 1', 'Cold Email 2', 'Cold Email 3', 'Follow-up'];
    const LINKEDIN_TYPES = ['LinkedIn Connect', 'LinkedIn Message', 'Sales Navigator Message'];

    const count = (arr, fn) => arr.filter(fn).length;

    const emailsSent = count(activities, (a) => EMAIL_TYPES.includes(a.activity_type));
    const linkedinTouches = count(activities, (a) => LINKEDIN_TYPES.includes(a.activity_type));
    const whatsapp = count(activities, (a) => a.activity_type === 'WhatsApp');
    const calls = count(activities, (a) => a.activity_type === 'Direct Call');
    const meetings = count(activities, (a) =>
      ['Meeting', 'Demo', 'Visit'].includes(a.activity_type)
    );
    const responses = count(activities, (a) =>
      ['Responded', 'Interested', 'Meeting Fixed'].includes(a.result)
    );
    const positive = count(activities, (a) =>
      ['Interested', 'Meeting Fixed'].includes(a.result)
    );

    const contactedIds = new Set(
      activities.filter((a) => a.contact_id && a.activity_type !== 'Research').map((a) => a.contact_id)
    );
    const respondedIds = new Set(
      activities
        .filter((a) => a.contact_id && ['Responded', 'Interested', 'Meeting Fixed'].includes(a.result))
        .map((a) => a.contact_id)
    );
    const meetingContactIds = new Set(
      activities
        .filter((a) => a.contact_id && (['Meeting', 'Demo'].includes(a.activity_type) || a.result === 'Meeting Fixed'))
        .map((a) => a.contact_id)
    );
    const proposalAccountIds = new Set(
      activities.filter((a) => a.activity_type === 'Proposal Sent').map((a) => a.account_id)
    );

    const pct = (num, den) => (den ? Math.round((num / den) * 1000) / 10 : 0);

    // Country breakdown
    const byCountry = {};
    const accountById = {};
    accounts.forEach((a) => {
      accountById[a.id] = a;
      const key = a.country || 'Unknown';
      byCountry[key] = byCountry[key] || {
        country: key, companies: 0, contacts: 0, replies: 0, meetings: 0, won: 0,
      };
      byCountry[key].companies += 1;
      if (a.status === 'Won') byCountry[key].won += 1;
    });
    contacts.forEach((c) => {
      const acc = accountById[c.account_id];
      const key = acc ? acc.country || 'Unknown' : 'Unknown';
      if (byCountry[key]) {
        byCountry[key].contacts += 1;
        if (respondedIds.has(c.id)) byCountry[key].replies += 1;
        if (meetingContactIds.has(c.id)) byCountry[key].meetings += 1;
      }
    });

    // Channel performance
    const byChannel = {};
    activities.forEach((a) => {
      const ch = a.channel || 'Other';
      byChannel[ch] = byChannel[ch] || { channel: ch, touches: 0, responses: 0 };
      byChannel[ch].touches += 1;
      if (['Responded', 'Interested', 'Meeting Fixed'].includes(a.result))
        byChannel[ch].responses += 1;
    });
    const channels = Object.values(byChannel)
      .map((c) => ({ ...c, rate: pct(c.responses, c.touches) }))
      .sort((a, b) => b.touches - a.touches);

    res.json({
      kpis: {
        countries: new Set(accounts.map((a) => a.country).filter(Boolean)).size,
        companies: accounts.length,
        contacts: contacts.length,
        emails_sent: emailsSent,
        linkedin_touches: linkedinTouches,
        whatsapp_sent: whatsapp,
        calls,
        meetings,
        responses,
        positive_responses: positive,
        reply_rate: pct(respondedIds.size, contactedIds.size),
        meeting_rate: pct(meetingContactIds.size, contactedIds.size),
      },
      funnel: [
        { stage: 'Accounts Identified', value: accounts.length },
        { stage: 'Contacts Found', value: contacts.length },
        { stage: 'Contacted', value: contactedIds.size },
        { stage: 'Responded', value: respondedIds.size },
        { stage: 'Meeting', value: meetingContactIds.size },
        { stage: 'Proposal', value: proposalAccountIds.size },
        { stage: 'Won', value: accounts.filter((a) => a.status === 'Won').length },
      ],
      countries: Object.values(byCountry).sort((a, b) => b.companies - a.companies),
      channels,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to build ABM dashboard' });
  }
});

// =====================================================
// TODAY'S QUEUE — computed next actions, ranked
// =====================================================
router.get('/queue', auth, async (req, res) => {
  try {
    const today = req.query.date || new Date().toISOString().split('T')[0];
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);

    let contacts;
    try {
      contacts = await fetchAll(
        'abm_contacts',
        'id, account_id, name, designation, decision_maker, status, do_not_contact, next_action, next_action_due, last_activity_type, last_activity_result, last_activity_at',
        (q) => q.eq('do_not_contact', false)
      );
    } catch (error) {
      if (isMissingSchema(error)) return migrationResponse(res);
      throw error;
    }
    const accounts = await fetchAll(
      'abm_accounts',
      'id, name, country, tier, priority, status'
    );
    const accountById = {};
    accounts.forEach((a) => (accountById[a.id] = a));

    const waits = await loadWaits();
    const items = [];
    for (const c of contacts) {
      const next = nextActionFor(c, waits);
      if (!next) continue;
      // Due today or overdue (no due date = brand-new contact, always eligible)
      if (next.due && next.due > today) continue;
      const acc = accountById[c.account_id] || {};
      if (['Won', 'Lost'].includes(acc.status)) continue;

      const overdueDays = next.due
        ? Math.max(0, Math.round((new Date(today) - new Date(next.due)) / 86400000))
        : 0;
      const score =
        overdueDays * 2 +
        (c.decision_maker ? 20 : 0) +
        (TIER_WEIGHT[acc.tier] || 0) +
        (PRIORITY_WEIGHT[acc.priority] || 0) +
        (next.manual ? 8 : 0) +
        (c.last_activity_type ? 6 : 0); // in-sequence contacts before untouched ones

      items.push({
        contact_id: c.id,
        contact_name: c.name,
        designation: c.designation,
        decision_maker: c.decision_maker,
        contact_status: c.status,
        account_id: c.account_id,
        account_name: acc.name || '—',
        country: acc.country || null,
        tier: acc.tier || null,
        action: next.action,
        due: next.due,
        overdue_days: overdueDays,
        manual: next.manual,
        last_activity_type: c.last_activity_type,
        last_activity_at: c.last_activity_at,
        score,
      });
    }

    items.sort((a, b) => b.score - a.score);
    res.json({ total: items.length, items: items.slice(0, limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to build queue' });
  }
});

// =====================================================
// SETTINGS — editable sequence cadence
// =====================================================
router.get('/settings', auth, async (req, res) => {
  try {
    const waits = await loadWaits();
    res.json({ sequence_waits: waits, defaults: DEFAULT_WAITS });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch settings' });
  }
});

router.put('/settings', auth, async (req, res) => {
  try {
    const incoming = req.body.sequence_waits || {};
    const clean = {};
    Object.keys(DEFAULT_WAITS).forEach((k) => {
      const n = parseInt(incoming[k], 10);
      if (Number.isFinite(n) && n >= 0 && n <= 365) clean[k] = n;
    });
    const { error } = await supabase
      .from('abm_settings')
      .upsert({
        id: 1,
        sequence_waits: clean,
        updated_at: getISTTime(),
        updated_by_name: req.user.name,
      });
    if (error) {
      if (isMissingSchema(error)) return migrationResponse(res);
      throw error;
    }
    res.json({ sequence_waits: { ...DEFAULT_WAITS, ...clean } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to save settings' });
  }
});

// =====================================================
// ACCOUNTS
// =====================================================
router.get('/accounts', auth, async (req, res) => {
  try {
    let accounts;
    try {
      accounts = await fetchAll('abm_accounts', '*', (q) => {
        if (req.query.country) q = q.eq('country', req.query.country);
        if (req.query.status) q = q.eq('status', req.query.status);
        if (req.query.tier) q = q.eq('tier', req.query.tier);
        if (req.query.search) q = q.ilike('name', `%${req.query.search}%`);
        return q.order('created_at', { ascending: false });
      });
    } catch (error) {
      if (isMissingSchema(error)) return migrationResponse(res);
      throw error;
    }

    // Contact rollups per account (paged fetch keeps this safe at any size)
    const contacts = await fetchAll(
      'abm_contacts',
      'id, account_id, status, last_activity_result, last_activity_at'
    );
    const rollup = {};
    contacts.forEach((c) => {
      const r = (rollup[c.account_id] = rollup[c.account_id] || {
        contacts: 0, not_contacted: 0, in_sequence: 0, responded: 0, last_activity_at: null,
      });
      r.contacts += 1;
      if (c.status === 'Contact Identified' || c.status === 'Research Pending') r.not_contacted += 1;
      else if (['Interested', 'Meeting Scheduled', 'Proposal Sent', 'Negotiation'].includes(c.status)) r.responded += 1;
      else if (!CLOSED_CONTACT_STATUSES.includes(c.status)) r.in_sequence += 1;
      if (c.last_activity_at && (!r.last_activity_at || c.last_activity_at > r.last_activity_at))
        r.last_activity_at = c.last_activity_at;
    });

    res.json(
      accounts.map((a) => ({
        ...a,
        stats: rollup[a.id] || {
          contacts: 0, not_contacted: 0, in_sequence: 0, responded: 0, last_activity_at: null,
        },
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch accounts' });
  }
});

router.post('/accounts', auth, async (req, res) => {
  try {
    const { name, country, industry, website, employees, revenue, priority, tier, status, owner, owner_name, notes, division } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Company name is required' });

    const insertRow = {
      name: name.trim(),
      country: country || null,
      industry: industry || null,
      website: website || null,
      employees: employees || null,
      revenue: revenue || null,
      priority: priority || 'Medium',
      tier: tier || 'Tier 2',
      status: status || 'Research',
      division: division || null,
      owner: owner || req.user.id,
      owner_name: owner_name || req.user.name,
      notes: notes || null,
      created_by: req.user.id,
      created_by_name: req.user.name,
      created_at: getISTTime(),
      updated_at: getISTTime(),
    };

    let { data, error } = await supabase.from('abm_accounts').insert([insertRow]).select().single();
    // division column not migrated yet — retry without it
    if (error && error.code === 'PGRST204') {
      const { division: _skip, ...withoutDivision } = insertRow;
      ({ data, error } = await supabase.from('abm_accounts').insert([withoutDivision]).select().single());
    }
    if (error) {
      if (isMissingSchema(error)) return migrationResponse(res);
      throw error;
    }
    res.status(201).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to create account' });
  }
});

router.get('/accounts/:id', auth, async (req, res) => {
  try {
    const { data: account, error } = await supabase
      .from('abm_accounts')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error || !account) {
      if (isMissingSchema(error)) return migrationResponse(res);
      return res.status(404).json({ message: 'Account not found' });
    }

    const { data: opportunities } = await supabase
      .from('abm_opportunities')
      .select('*')
      .eq('account_id', account.id)
      .order('created_at', { ascending: false });

    // Status rollup across ALL contacts (the contact list itself is paged separately)
    const contacts = await fetchAll(
      'abm_contacts',
      'id, status, decision_maker',
      (q) => q.eq('account_id', account.id)
    );
    const statusCounts = {};
    contacts.forEach((c) => {
      statusCounts[c.status] = (statusCounts[c.status] || 0) + 1;
    });

    res.json({
      ...account,
      opportunities: opportunities || [],
      contact_total: contacts.length,
      decision_makers: contacts.filter((c) => c.decision_maker).length,
      status_counts: statusCounts,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch account' });
  }
});

router.put('/accounts/:id', auth, async (req, res) => {
  try {
    const allowed = ['name', 'country', 'industry', 'website', 'employees', 'revenue', 'priority', 'tier', 'status', 'owner', 'owner_name', 'notes', 'division'];
    const updateData = { updated_at: getISTTime() };
    allowed.forEach((k) => {
      if (req.body[k] !== undefined) updateData[k] = req.body[k];
    });
    let { data, error } = await supabase
      .from('abm_accounts')
      .update(updateData)
      .eq('id', req.params.id)
      .select()
      .single();
    // division column not migrated yet — retry without it
    if (error && error.code === 'PGRST204' && 'division' in updateData) {
      const { division: _skip, ...withoutDivision } = updateData;
      ({ data, error } = await supabase
        .from('abm_accounts')
        .update(withoutDivision)
        .eq('id', req.params.id)
        .select()
        .single());
    }
    if (error) {
      if (isMissingSchema(error)) return migrationResponse(res);
      throw error;
    }
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update account' });
  }
});

router.delete('/accounts/:id', auth, async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ message: 'Only admin can delete accounts' });
    }
    const { error } = await supabase.from('abm_accounts').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to delete account' });
  }
});

// =====================================================
// CONTACTS (paged — accounts can hold 500+ contacts)
// =====================================================
router.get('/contacts', auth, async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const from = (page - 1) * limit;

    let q = supabase
      .from('abm_contacts')
      .select('*', { count: 'exact' })
      .range(from, from + limit - 1)
      .order('decision_maker', { ascending: false })
      .order('created_at', { ascending: true });
    if (req.query.account_id) q = q.eq('account_id', req.query.account_id);
    if (req.query.status) q = q.eq('status', req.query.status);
    if (req.query.decision_maker === 'true') q = q.eq('decision_maker', true);
    if (req.query.search)
      q = q.or(`name.ilike.%${req.query.search}%,designation.ilike.%${req.query.search}%,email.ilike.%${req.query.search}%`);

    const { data, error, count } = await q;
    if (error) {
      if (isMissingSchema(error)) return migrationResponse(res);
      throw error;
    }
    res.json({ rows: data || [], total: count || 0, page, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch contacts' });
  }
});

const contactRow = (c, accountId) => ({
  account_id: accountId,
  name: (c.name || '').trim(),
  designation: c.designation || null,
  role_level: c.role_level || null,
  email: c.email || null,
  phone: c.phone || null,
  linkedin: c.linkedin || null,
  whatsapp: c.whatsapp || null,
  decision_maker: !!c.decision_maker,
  status: c.status || 'Contact Identified',
  notes: c.notes || null,
  created_at: getISTTime(),
  updated_at: getISTTime(),
});

router.post('/contacts', auth, async (req, res) => {
  try {
    const { account_id } = req.body;
    if (!account_id) return res.status(400).json({ message: 'account_id is required' });
    if (!req.body.name?.trim()) return res.status(400).json({ message: 'Name is required' });
    const { data, error } = await supabase
      .from('abm_contacts')
      .insert([contactRow(req.body, account_id)])
      .select()
      .single();
    if (error) {
      if (isMissingSchema(error)) return migrationResponse(res);
      throw error;
    }
    res.status(201).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to create contact' });
  }
});

// Normalized identity keys for duplicate detection
const normEmail = (e) => (e || '').trim().toLowerCase() || null;
const normLinkedin = (l) =>
  (l || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '') || null;
const normName = (n) => (n || '').trim().toLowerCase().replace(/\s+/g, ' ') || null;

// Bulk import — from CSV paste or Sales Navigator export.
// Rows matching an existing contact in the same account (by email,
// LinkedIn URL, or exact name) are skipped, as are duplicates inside the batch.
router.post('/contacts/bulk', auth, async (req, res) => {
  try {
    const { account_id, contacts } = req.body;
    if (!account_id) return res.status(400).json({ message: 'account_id is required' });
    let rows = (contacts || [])
      .filter((c) => c.name?.trim())
      .map((c) => contactRow(c, account_id));
    if (!rows.length) return res.status(400).json({ message: 'No valid contacts provided' });

    let existing;
    try {
      existing = await fetchAll(
        'abm_contacts',
        'email, linkedin, name',
        (q) => q.eq('account_id', account_id)
      );
    } catch (error) {
      if (isMissingSchema(error)) return migrationResponse(res);
      throw error;
    }
    const seenEmails = new Set(existing.map((c) => normEmail(c.email)).filter(Boolean));
    const seenLinkedins = new Set(existing.map((c) => normLinkedin(c.linkedin)).filter(Boolean));
    const seenNames = new Set(existing.map((c) => normName(c.name)).filter(Boolean));

    let skipped = 0;
    rows = rows.filter((r) => {
      const em = normEmail(r.email);
      const li = normLinkedin(r.linkedin);
      const nm = normName(r.name);
      if ((em && seenEmails.has(em)) || (li && seenLinkedins.has(li)) || (!em && !li && nm && seenNames.has(nm))) {
        skipped += 1;
        return false;
      }
      if (em) seenEmails.add(em);
      if (li) seenLinkedins.add(li);
      if (nm) seenNames.add(nm);
      return true;
    });
    if (!rows.length) return res.json({ inserted: 0, skipped });

    // Insert in chunks to stay under request-size limits
    const CHUNK = 500;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error, data } = await supabase
        .from('abm_contacts')
        .insert(rows.slice(i, i + CHUNK))
        .select('id');
      if (error) {
        if (isMissingSchema(error)) return migrationResponse(res);
        throw error;
      }
      inserted += (data || []).length;
    }
    res.status(201).json({ inserted, skipped });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to import contacts' });
  }
});

// Bulk status set (manual override, e.g. mark 50 contacts "Future Follow-up")
router.put('/contacts/bulk-status', auth, async (req, res) => {
  try {
    const { contact_ids, status } = req.body;
    if (!contact_ids?.length || !status)
      return res.status(400).json({ message: 'contact_ids and status are required' });
    const { error } = await supabase
      .from('abm_contacts')
      .update({ status, updated_at: getISTTime() })
      .in('id', contact_ids);
    if (error) {
      if (isMissingSchema(error)) return migrationResponse(res);
      throw error;
    }
    res.json({ updated: contact_ids.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update statuses' });
  }
});

router.put('/contacts/:id', auth, async (req, res) => {
  try {
    const allowed = ['name', 'designation', 'role_level', 'email', 'phone', 'linkedin', 'whatsapp', 'decision_maker', 'status', 'do_not_contact', 'next_action', 'next_action_due', 'notes'];
    const updateData = { updated_at: getISTTime() };
    allowed.forEach((k) => {
      if (req.body[k] !== undefined) updateData[k] = req.body[k];
    });
    const { data, error } = await supabase
      .from('abm_contacts')
      .update(updateData)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) {
      if (isMissingSchema(error)) return migrationResponse(res);
      throw error;
    }
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update contact' });
  }
});

router.delete('/contacts/:id', auth, async (req, res) => {
  try {
    const { error } = await supabase.from('abm_contacts').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to delete contact' });
  }
});

// =====================================================
// ACTIVITIES — single or bulk (one row per contact)
// =====================================================
router.get('/activities', auth, async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const from = (page - 1) * limit;

    let q = supabase
      .from('abm_activities')
      .select('*', { count: 'exact' })
      .range(from, from + limit - 1)
      .order('activity_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (req.query.account_id) q = q.eq('account_id', req.query.account_id);
    if (req.query.contact_id) q = q.eq('contact_id', req.query.contact_id);
    if (req.query.result) q = q.eq('result', req.query.result);

    const { data, error, count } = await q;
    if (error) {
      if (isMissingSchema(error)) return migrationResponse(res);
      throw error;
    }
    res.json({ rows: data || [], total: count || 0, page, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch activities' });
  }
});

const CHANNEL_BY_TYPE = {
  Research: 'Research',
  'Cold Email 1': 'Email', 'Cold Email 2': 'Email', 'Cold Email 3': 'Email', 'Follow-up': 'Email',
  'LinkedIn Connect': 'LinkedIn', 'LinkedIn Message': 'LinkedIn', 'Sales Navigator Message': 'LinkedIn',
  WhatsApp: 'WhatsApp',
  'Direct Call': 'Phone',
  Meeting: 'Meeting', Demo: 'Meeting', Visit: 'In Person',
  'Proposal Sent': 'Email',
};

// Coarse account-status ladder — an activity can only move the account FORWARD
const ACCOUNT_LADDER = ['Research', 'Contacting', 'Engaged', 'Meeting Scheduled', 'Proposal', 'Negotiation'];
const accountStageForActivity = (type, result) => {
  if (type === 'Proposal Sent') return 'Proposal';
  if (result === 'Meeting Fixed' || type === 'Meeting' || type === 'Demo') return 'Meeting Scheduled';
  if (['Responded', 'Interested'].includes(result)) return 'Engaged';
  if (type !== 'Research') return 'Contacting';
  return null;
};

router.post('/activities', auth, async (req, res) => {
  try {
    const { account_id, contact_ids, activity_type, result, notes, activity_date } = req.body;
    if (!activity_type) return res.status(400).json({ message: 'activity_type is required' });
    if (!account_id && !contact_ids?.length)
      return res.status(400).json({ message: 'account_id or contact_ids required' });

    const date = activity_date || new Date().toISOString().split('T')[0];
    const channel = req.body.channel || CHANNEL_BY_TYPE[activity_type] || 'Other';

    // Resolve accounts for the given contacts
    let targets = [];
    if (contact_ids?.length) {
      const { data: found, error } = await supabase
        .from('abm_contacts')
        .select('id, account_id')
        .in('id', contact_ids);
      if (error) {
        if (isMissingSchema(error)) return migrationResponse(res);
        throw error;
      }
      targets = found || [];
      if (!targets.length) return res.status(404).json({ message: 'Contacts not found' });
    }

    const baseRow = {
      activity_type,
      channel,
      result: result || 'Sent',
      notes: notes || null,
      activity_date: date,
      created_by: req.user.id,
      created_by_name: req.user.name,
      created_at: getISTTime(),
    };

    const rows = targets.length
      ? targets.map((t) => ({ ...baseRow, account_id: t.account_id, contact_id: t.id }))
      : [{ ...baseRow, account_id, contact_id: null }];

    const { data: created, error: insertError } = await supabase
      .from('abm_activities')
      .insert(rows)
      .select();
    if (insertError) {
      if (isMissingSchema(insertError)) return migrationResponse(res);
      throw insertError;
    }

    // Update denormalized last-activity + pipeline status on each contact,
    // and clear any manual next-action override (it has been actioned)
    const newStatus = statusAfterActivity(activity_type, baseRow.result);
    if (targets.length) {
      const contactUpdate = {
        last_activity_type: activity_type,
        last_activity_result: baseRow.result,
        last_activity_at: `${date}T00:00:00`,
        next_action: null,
        next_action_due: null,
        updated_at: getISTTime(),
      };
      if (newStatus) contactUpdate.status = newStatus;
      const { error: updError } = await supabase
        .from('abm_contacts')
        .update(contactUpdate)
        .in('id', targets.map((t) => t.id));
      if (updError) throw updError;
    }

    // Nudge account status forward along the ladder
    const stage = accountStageForActivity(activity_type, baseRow.result);
    const accountIds = [...new Set(rows.map((r) => r.account_id))];
    if (stage) {
      const { data: accs } = await supabase
        .from('abm_accounts')
        .select('id, status')
        .in('id', accountIds);
      for (const acc of accs || []) {
        const cur = ACCOUNT_LADDER.indexOf(acc.status);
        const nxt = ACCOUNT_LADDER.indexOf(stage);
        if (nxt > cur && cur !== -1) {
          await supabase
            .from('abm_accounts')
            .update({ status: stage, updated_at: getISTTime() })
            .eq('id', acc.id);
        }
      }
    }

    res.status(201).json({ created: created.length, activities: created });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to log activity' });
  }
});

router.delete('/activities/:id', auth, async (req, res) => {
  try {
    const { error } = await supabase.from('abm_activities').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to delete activity' });
  }
});

// =====================================================
// OPPORTUNITIES
// =====================================================
router.post('/opportunities', auth, async (req, res) => {
  try {
    const { account_id, name, potential, probability, expected_value, stage, notes } = req.body;
    if (!account_id) return res.status(400).json({ message: 'account_id is required' });
    const { data, error } = await supabase
      .from('abm_opportunities')
      .insert([{
        account_id,
        name: name || null,
        potential: potential || null,
        probability: probability ?? null,
        expected_value: expected_value ?? null,
        stage: stage || 'Qualification',
        notes: notes || null,
        created_at: getISTTime(),
        updated_at: getISTTime(),
      }])
      .select()
      .single();
    if (error) {
      if (isMissingSchema(error)) return migrationResponse(res);
      throw error;
    }
    res.status(201).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to create opportunity' });
  }
});

router.put('/opportunities/:id', auth, async (req, res) => {
  try {
    const allowed = ['name', 'potential', 'probability', 'expected_value', 'stage', 'notes'];
    const updateData = { updated_at: getISTTime() };
    allowed.forEach((k) => {
      if (req.body[k] !== undefined) updateData[k] = req.body[k];
    });
    const { data, error } = await supabase
      .from('abm_opportunities')
      .update(updateData)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update opportunity' });
  }
});

router.delete('/opportunities/:id', auth, async (req, res) => {
  try {
    const { error } = await supabase.from('abm_opportunities').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to delete opportunity' });
  }
});

module.exports = router;
