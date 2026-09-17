// =====================================================
// MRM report: the month's figures
// =====================================================
// One place that decides what every number on the management review deck
// means, so the portal page and the PowerPoint can never disagree.
//
// Three sources:
//   Salesforce mirror   leads, conversions, pipeline, exhibition leads by
//                       owner, visits, export opportunities
//   Portal database     Google Ads spend, LinkedIn followers, exhibition spend
//                       (expense claims), site branding (project tasks)
//   mrm_inputs          targets, wording, hand-kept trackers, and the figures
//                       already presented for past months
//
// Every section is built independently and failures are collected as
// warnings: a missing Salesforce connection should cost the deck its live
// lead numbers, not the whole report.

const supabase = require('../config/supabase');
const { salesforce, isConfigured: salesforceConfigured } = require('../config/salesforceDb');
const DEFAULTS = require('./mrmDefaults');

const IST_MS = 330 * 60000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ---------------------------------------------------------------
// Month arithmetic on 'YYYY-MM' strings
// ---------------------------------------------------------------
const pad2 = (n) => String(n).padStart(2, '0');
const ymOf = (y, m) => `${y}-${pad2(m)}`; // m is 1-12
const parseYm = (ym) => ym.split('-').map(Number);
const addMonths = (ym, n) => {
  const [y, m] = parseYm(ym);
  const t = y * 12 + (m - 1) + n;
  return ymOf(Math.floor(t / 12), (t % 12) + 1);
};
const monthRange = (from, count) => Array.from({ length: count }, (_, i) => addMonths(from, i));
const lastDayOf = (ym) => {
  const [y, m] = parseYm(ym);
  return `${ym}-${pad2(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
};
// Midnight IST at the start of a month, as a UTC instant.
const monthStartUtc = (ym) => new Date(`${ym}-01T00:00:00+05:30`).toISOString();
const istMonth = (ts) => new Date(new Date(ts).getTime() + IST_MS).toISOString().slice(0, 7);
const istDay = (ts) => new Date(new Date(ts).getTime() + IST_MS).toISOString().slice(0, 10);
const addDays = (day, n) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const fiscalStart = (ym, startMonth) => {
  const [y, m] = parseYm(ym);
  return ymOf(m >= startMonth ? y : y - 1, startMonth);
};
const fyLabel = (fyStartYm) => {
  const [y] = parseYm(fyStartYm);
  return `FY${String(y).slice(2)}-${String(y + 1).slice(2)}`;
};

const round = (v, dp = 1) => (v == null ? null : Math.round(v * 10 ** dp) / 10 ** dp);

// ---------------------------------------------------------------
// Paging (PostgREST gives back at most what it is asked for; both databases
// page by a stable key rather than trusting a single call)
// ---------------------------------------------------------------
const PAGE = 1000;
const pageAll = async (build, orderCol) => {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().order(orderCol, { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw new Error(error.message || error.code || 'query failed');
    out.push(...(data || []));
    if (!data || data.length < PAGE) return out;
  }
};
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, (i + 1) * n));

// ---------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------
const isMissingTable = (error) => error && ['PGRST205', '42P01'].includes(error.code);

const loadInputs = async () => {
  const merged = JSON.parse(JSON.stringify(DEFAULTS));
  const meta = { stored: [], migrationNeeded: false };
  const { data, error } = await supabase.from('mrm_inputs').select('key, value, updated_at, updated_by_name');
  if (error) {
    if (isMissingTable(error)) meta.migrationNeeded = true;
    else throw new Error(error.message || 'could not read mrm_inputs');
    return { inputs: merged, meta };
  }
  for (const row of data || []) {
    if (!(row.key in DEFAULTS)) continue;
    merged[row.key] = row.value;
    meta.stored.push({ key: row.key, updated_at: row.updated_at, updated_by_name: row.updated_by_name });
  }
  return { inputs: merged, meta };
};

const saveInput = async (key, value, userName) => {
  if (!(key in DEFAULTS)) {
    const err = new Error(`Unknown input "${key}"`);
    err.status = 400;
    throw err;
  }
  const { error } = await supabase
    .from('mrm_inputs')
    .upsert({ key, value, updated_at: new Date().toISOString(), updated_by_name: userName || null }, { onConflict: 'key' });
  if (error) {
    const err = new Error(
      isMissingTable(error)
        ? 'The MRM inputs table is not set up yet. Run backend/database/mrm-migration.sql on the server.'
        : error.message || 'could not save'
    );
    err.status = isMissingTable(error) ? 503 : 500;
    throw err;
  }
};

const resetInput = async (key) => {
  const { error } = await supabase.from('mrm_inputs').delete().eq('key', key);
  if (error && !isMissingTable(error)) throw new Error(error.message || 'could not reset');
};

// ---------------------------------------------------------------
// The model
// ---------------------------------------------------------------
const buildMrm = async (month, viewerName) => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || ''))) {
    const err = new Error('month must be YYYY-MM');
    err.status = 400;
    throw err;
  }

  const warnings = [];
  const { inputs, meta: inputsMeta } = await loadInputs();
  if (inputsMeta.migrationNeeded) {
    warnings.push('Inputs table not found: using built-in defaults. Run backend/database/mrm-migration.sql to make them editable.');
  }
  if (!salesforceConfigured) {
    warnings.push('Salesforce mirror is not configured (SALESFORCE_DB_URL / SALESFORCE_DB_JWT): live lead, pipeline and exhibition-lead figures are unavailable.');
  }

  const S = inputs.settings;
  const fyStart = fiscalStart(month, S.fiscalYearStartMonth);
  const prevFyStart = addMonths(fyStart, -12);
  const fyMonths = monthRange(fyStart, 12);
  const prevFyMonths = monthRange(prevFyStart, 12);
  const elapsed = fyMonths.filter((m) => m <= month); // FY months up to and including the report month
  const monthEndDay = lastDayOf(month);
  const rangeStartUtc = monthStartUtc(prevFyStart);
  const rangeEndUtc = monthStartUtc(addMonths(month, 1));
  const [fyYear] = parseYm(fyStart);

  const safely = async (label, fn, fallback) => {
    try {
      return await fn();
    } catch (err) {
      warnings.push(`${label}: ${err.message}`);
      return fallback;
    }
  };

  // ------------------------------------------------ Salesforce: marketing leads
  const live = { leads: {}, convertedLeads: {}, pipelineMn: {}, adSpendLakh: {}, linkedinFollowersGained: {} };
  let wonCrYtd = null;
  let salesforceSyncedAt = null;

  if (salesforceConfigured) {
    await safely('Leads', async () => {
      const rows = await pageAll(
        () =>
          salesforce
            .from('lead')
            .select('Id, CreatedDate')
            .eq('IsDeleted', false)
            .eq('Divisions__c', S.division)
            .in('LeadSource', S.leadSources)
            .gte('CreatedDate', rangeStartUtc)
            .lt('CreatedDate', rangeEndUtc),
        'Id'
      );
      for (const r of rows) {
        const m = istMonth(r.CreatedDate);
        live.leads[m] = (live.leads[m] || 0) + 1;
      }
    });

    await safely('Converted leads', async () => {
      const rows = await pageAll(
        () =>
          salesforce
            .from('lead')
            .select('Id, ConvertedDate')
            .eq('IsDeleted', false)
            .eq('IsConverted', true)
            .eq('Divisions__c', S.division)
            .in('LeadSource', S.leadSources)
            .gte('ConvertedDate', `${prevFyStart}-01`)
            .lte('ConvertedDate', monthEndDay),
        'Id'
      );
      for (const r of rows) {
        const m = String(r.ConvertedDate).slice(0, 7);
        live.convertedLeads[m] = (live.convertedLeads[m] || 0) + 1;
      }
    });

    await safely('Pipeline', async () => {
      const { data: rates, error } = await salesforce.from('currencytype').select('IsoCode, ConversionRate');
      if (error) throw new Error(error.message);
      const rateOf = Object.fromEntries((rates || []).map((r) => [r.IsoCode, Number(r.ConversionRate) || 1]));
      const inInr = (o) => Number(o.Amount || 0) / (rateOf[o.CurrencyIsoCode] || 1);

      const opps = await pageAll(
        () =>
          salesforce
            .from('opportunity')
            .select('Id, Amount, CurrencyIsoCode, CreatedDate, IsWon, CloseDate')
            .eq('IsDeleted', false)
            .eq('Division__c', S.division)
            .in('LeadSource', S.leadSources)
            .gte('CreatedDate', rangeStartUtc)
            .lt('CreatedDate', rangeEndUtc),
        'Id'
      );
      for (const o of opps) {
        const m = istMonth(o.CreatedDate);
        live.pipelineMn[m] = (live.pipelineMn[m] || 0) + inInr(o) / 1e6;
      }

      const won = await pageAll(
        () =>
          salesforce
            .from('opportunity')
            .select('Id, Amount, CurrencyIsoCode, CloseDate')
            .eq('IsDeleted', false)
            .eq('IsWon', true)
            .eq('Division__c', S.division)
            .in('LeadSource', S.leadSources)
            .gte('CloseDate', `${fyStart}-01`)
            .lte('CloseDate', monthEndDay),
        'Id'
      );
      wonCrYtd = round(won.reduce((s, o) => s + inInr(o), 0) / 1e7, 2);
    });

    await safely('Salesforce sync time', async () => {
      const { data } = await salesforce.from('salesforce_sync_control').select('object_name, last_sync_timestamp').in('object_name', ['Lead', 'Opportunity']);
      const stamps = (data || []).map((r) => r.last_sync_timestamp).filter(Boolean).sort();
      salesforceSyncedAt = stamps[0] || null; // the older of the two is the honest answer
    });
  }

  // ------------------------------------------------ Portal: ad spend
  await safely('Ad spend', async () => {
    const rows = await pageAll(
      () =>
        supabase
          .from('google_ads_campaign_analysis')
          .select('id, report_date, cost')
          .eq('account_name', S.googleAdsAccount)
          .gte('report_date', `${prevFyStart}-01`)
          .lte('report_date', monthEndDay),
      'id'
    );
    for (const r of rows) {
      const m = String(r.report_date).slice(0, 7);
      live.adSpendLakh[m] = (live.adSpendLakh[m] || 0) + Number(r.cost || 0) / 1e5;
    }
  });

  // ------------------------------------------------ Portal: LinkedIn followers
  let followersTotal = null;
  await safely('LinkedIn followers', async () => {
    const rows = await pageAll(
      () =>
        supabase
          .from('linkedin_follower_stats')
          .select('date, total_followers')
          .eq('org_name', S.linkedinOrg)
          .gte('date', `${addMonths(prevFyStart, -1)}-01`)
          .lte('date', monthEndDay),
      'date'
    );
    const lastOf = {};
    for (const r of rows) lastOf[String(r.date).slice(0, 7)] = Number(r.total_followers);
    for (const m of [...prevFyMonths, ...fyMonths]) {
      const prev = lastOf[addMonths(m, -1)];
      if (lastOf[m] != null && prev != null) live.linkedinFollowersGained[m] = lastOf[m] - prev;
    }
    followersTotal = lastOf[month] ?? null;
  });

  // ------------------------------------------------ History wins over a live recount
  const valueFor = (metric, m) => {
    const presented = inputs.history?.[metric]?.[m];
    if (presented != null) return { value: Number(presented), source: 'presented' };
    const v = live[metric]?.[m];
    if (v != null) return { value: round(v, metric === 'adSpendLakh' ? 2 : 1), source: 'live' };
    return { value: null, source: 'none' };
  };
  const targetFor = (metric, m) => {
    const t = inputs.targets?.[fyYear]?.[metric];
    if (!t) return null;
    return t[m] ?? t.default ?? null;
  };

  const series = (metric, { withPrevious = true, target } = {}) => ({
    categories: fyMonths.map((m) => MONTHS[parseYm(m)[1] - 1]),
    current: { name: fyLabel(fyStart), values: fyMonths.map((m) => (m <= month ? valueFor(metric, m).value : null)) },
    previous: withPrevious
      ? { name: fyLabel(prevFyStart), values: prevFyMonths.map((m) => valueFor(metric, m).value) }
      : null,
    target: target
      ? { name: 'Target', values: fyMonths.map((m) => (m <= month ? targetFor(target, m) : null)) }
      : null,
    sources: Object.fromEntries(elapsed.map((m) => [m, valueFor(metric, m).source])),
    liveRecount: Object.fromEntries(elapsed.map((m) => [m, live[metric]?.[m] != null ? round(live[metric][m], 2) : null])),
  });

  const sumElapsed = (metric) => elapsed.reduce((s, m) => s + (valueFor(metric, m).value || 0), 0);
  const sumTargetElapsed = (metric) => elapsed.reduce((s, m) => s + (Number(targetFor(metric, m)) || 0), 0);

  const mql = {
    leads: series('leads'),
    convertedLeads: series('convertedLeads', { target: 'convertedLeads' }),
    pipelineMn: series('pipelineMn', { target: 'pipelineMn' }),
    adSpendLakh: series('adSpendLakh', { withPrevious: false, target: 'adSpendLakh' }),
  };

  // ------------------------------------------------ Exhibitions
  const exhibitions = await safely(
    'Exhibitions',
    async () => {
      const list = (inputs.exhibitions || []).map((e) => ({ ...e }));
      const window = Number(S.exhibitionLeadWindowDays) || 0;

      // Spend from expense claims, matched on the claim title.
      const { data: claims, error: claimErr } = await supabase.from('expense_claims').select('id, title');
      if (claimErr && !isMissingTable(claimErr)) throw new Error(claimErr.message);
      const claimIdsFor = (e) =>
        (claims || [])
          .filter((c) => (e.claimMatch || []).some((k) => String(c.title || '').toLowerCase().includes(String(k).toLowerCase())))
          .map((c) => c.id);
      const allClaimIds = [...new Set(list.flatMap(claimIdsFor))];
      const lines = [];
      for (const ids of chunk(allClaimIds, 100)) {
        const { data, error } = await supabase
          .from('expense_lines')
          .select('claim_id, amount, tax_amount, approval_status')
          .in('claim_id', ids);
        if (error) throw new Error(error.message);
        lines.push(...(data || []));
      }

      // Leads from the mirror, assigned to the exhibition whose window holds them.
      let leads = [];
      const owners = new Map();
      const visitsByLead = new Map();
      const oppAmount = new Map();
      if (salesforceConfigured) {
        leads = await pageAll(
          () =>
            salesforce
              .from('lead')
              .select('Id, OwnerId, Status, IsConverted, ConvertedOpportunityId, CreatedDate')
              .eq('IsDeleted', false)
              .eq('Divisions__c', S.division)
              .in('LeadSource', S.tradeshowSources)
              .gte('CreatedDate', monthStartUtc(fyStart))
              .lt('CreatedDate', rangeEndUtc),
          'Id'
        );
        const users = await pageAll(() => salesforce.from('user').select('Id, Name'), 'Id');
        users.forEach((u) => owners.set(u.Id, u.Name));

        for (const ids of chunk(leads.map((l) => l.Id), 60)) {
          const inList = `(${ids.join(',')})`;
          const { data, error } = await salesforce
            .from('visit_plan_allocation')
            .select('Id, LeadId__c, Lead__c, Check_In_Time__c')
            .eq('IsDeleted', false)
            .not('Check_In_Time__c', 'is', null)
            .or(`LeadId__c.in.${inList},Lead__c.in.${inList}`);
          if (error) throw new Error(error.message);
          for (const v of data || []) {
            const leadId = ids.includes(v.LeadId__c) ? v.LeadId__c : v.Lead__c;
            visitsByLead.set(leadId, (visitsByLead.get(leadId) || 0) + 1);
          }
        }

        const oppIds = leads.map((l) => l.ConvertedOpportunityId).filter(Boolean);
        for (const ids of chunk(oppIds, 100)) {
          const { data, error } = await salesforce.from('opportunity').select('Id, Amount').in('Id', ids);
          if (error) throw new Error(error.message);
          (data || []).forEach((o) => oppAmount.set(o.Id, Number(o.Amount || 0)));
        }
      }

      const assigned = new Map(); // lead id -> exhibition index
      leads.forEach((l) => {
        const day = istDay(l.CreatedDate);
        const idx = list.findIndex((e) => e.countLeads !== false && e.from && day >= e.from && day <= addDays(e.to || e.from, window));
        if (idx >= 0) assigned.set(l.Id, idx);
      });

      const rows = list.map((e, idx) => {
        const mine = leads.filter((l) => assigned.get(l.Id) === idx);
        const ids = claimIdsFor(e);
        const spent = lines
          .filter((l) => ids.includes(l.claim_id) && l.approval_status !== 'Rejected')
          .reduce((s, l) => s + Number(l.amount || 0) + Number(l.tax_amount || 0), 0);
        const started = e.from && e.from <= monthEndDay;
        return {
          name: e.name,
          status: e.status || '',
          spendLakh: e.spendLakh != null ? Number(e.spendLakh) : spent ? round(spent / 1e5, 2) : null,
          claimedLakh: spent ? round(spent / 1e5, 2) : null,
          budgetLakh: e.budgetLakh ?? null,
          leads: started && salesforceConfigured && e.countLeads !== false ? mine.length : null,
          converted: started && salesforceConfigured && e.countLeads !== false ? mine.filter((l) => l.IsConverted).length : null,
          opportunityAmountLakh:
            started && salesforceConfigured
              ? round(mine.reduce((s, l) => s + (oppAmount.get(l.ConvertedOpportunityId) || 0), 0) / 1e5, 1) || null
              : null,
          remarks: e.remarks || '',
        };
      });

      // Slide 6: the same leads, by salesperson.
      const byOwner = new Map();
      leads
        .filter((l) => assigned.has(l.Id))
        .forEach((l) => {
          const name = owners.get(l.OwnerId) || 'Unassigned';
          const o = byOwner.get(name) || { user: name, assigned: 0, converted: 0, open: 0, dropped: 0, visits: 0 };
          o.assigned += 1;
          if (l.IsConverted) o.converted += 1;
          else if (/^(Dropped|Unqualified)$/i.test(l.Status || '')) o.dropped += 1;
          else o.open += 1;
          o.visits += visitsByLead.get(l.Id) || 0;
          byOwner.set(name, o);
        });
      const ownerRows = [...byOwner.values()].sort((a, b) => b.assigned - a.assigned || a.user.localeCompare(b.user));
      const total = ownerRows.reduce(
        (t, o) => ({
          user: 'Total',
          assigned: t.assigned + o.assigned,
          converted: t.converted + o.converted,
          open: t.open + o.open,
          dropped: t.dropped + o.dropped,
          visits: t.visits + o.visits,
        }),
        { user: 'Total', assigned: 0, converted: 0, open: 0, dropped: 0, visits: 0 }
      );

      return {
        rows,
        totals: {
          spendLakh: round(rows.reduce((s, r) => s + (r.spendLakh || 0), 0), 2),
          leads: rows.reduce((s, r) => s + (r.leads || 0), 0),
          converted: rows.reduce((s, r) => s + (r.converted || 0), 0),
        },
        byOwner: ownerRows,
        byOwnerTotal: total,
      };
    },
    { rows: [], totals: { spendLakh: 0, leads: 0, converted: 0 }, byOwner: [], byOwnerTotal: null }
  );

  // ------------------------------------------------ Site branding (project tasks, by due date)
  const siteBranding = await safely(
    'Site branding',
    async () => {
      const { data: projects, error } = await supabase
        .from('projects')
        .select('id, name')
        .ilike('name', `%${S.siteBrandingProjectMatch}%`);
      if (error) throw new Error(error.message);
      const ids = (projects || []).map((p) => p.id);
      if (!ids.length) return { project: null, total: 0, completed: 0, rows: [] };

      const tasks = await pageAll(
        () => supabase.from('tickets').select('id, title, status, due_date, completed_date').in('project_id', ids),
        'id'
      );
      const isDone = (t) => /^(completed|closed)$/i.test(String(t.status || ''));
      const monthTag = (day) => (day ? MONTHS[Number(String(day).slice(5, 7)) - 1].toUpperCase() : '');
      const split = (title) => {
        const i = String(title).lastIndexOf(' - ');
        return i > 0
          ? { customer: title.slice(0, i).replace(/[-\s]+$/, '').trim(), system: title.slice(i + 3).trim() }
          : { customer: String(title).trim(), system: '' };
      };
      const rows = tasks
        .map((t) => ({
          ...split(t.title),
          done: isDone(t),
          due: t.due_date || null,
          sortKey: (isDone(t) ? t.completed_date || t.due_date : t.due_date) || '9999-12-31',
          // A site whose due month has already passed is not "planned" any
          // more; saying so would hide exactly what the review is for.
          overdue: !isDone(t) && Boolean(t.due_date) && String(t.due_date).slice(0, 7) < month,
          progress: isDone(t)
            ? `Completed${t.completed_date ? ` – ${monthTag(t.completed_date)}` : ''}`
            : t.due_date && String(t.due_date).slice(0, 7) < month
              ? `Pending – due ${monthTag(t.due_date)}`
              : `Planned${t.due_date ? ` – ${monthTag(t.due_date)}` : ''}`,
        }))
        // Completed first, then what is coming, each in date order.
        .sort((a, b) => Number(b.done) - Number(a.done) || a.sortKey.localeCompare(b.sortKey) || a.customer.localeCompare(b.customer));

      return {
        project: projects[0].name,
        total: rows.length,
        completed: rows.filter((r) => r.done).length,
        rows,
      };
    },
    { project: null, total: 0, completed: 0, rows: [] }
  );

  // ------------------------------------------------ Export opportunities
  const exportOpps = await safely(
    'Export opportunities',
    async () => {
      const overrides = inputs.exportOpportunities || [];
      const findOverride = (name) =>
        overrides
          .filter((o) => !o.add)
          // Longest match first, so "IHCC - Anil" wins over "IHCC".
          .sort((a, b) => String(b.match).length - String(a.match).length)
          .find((o) => String(name || '').toLowerCase().startsWith(String(o.match).toLowerCase()));

      let rows = [];
      if (salesforceConfigured) {
        // "Export" is read off the opportunity's currency. The account's
        // isDomestic flag looked like the obvious test and is not: it is unset
        // on most Indian accounts, so it returned hundreds of domestic deals.
        // The stage filter keeps the slide to live pursuits past Qualification.
        const stages = S.exportStages?.length ? S.exportStages : ['Design', 'Costing', 'Proposal'];
        const opps = await pageAll(
          () =>
            salesforce
              .from('opportunity')
              .select('Id, Name, StageName, Amount, CurrencyIsoCode, CloseDate, No_of_Car_Spaces__c, Builing_Locaiton__c, Project_Type__c')
              .eq('IsDeleted', false)
              .eq('IsClosed', false)
              .eq('Division__c', S.division)
              .neq('CurrencyIsoCode', 'INR')
              .in('StageName', stages),
          'Id'
        );
        rows = opps
          .filter((o) => !(findOverride(o.Name) || {}).hide)
          .map((o) => {
            const ov = findOverride(o.Name) || {};
            const usd = o.CurrencyIsoCode === 'USD' && Number(o.Amount) > 0 ? Number(o.Amount) / 1e6 : null;
            return {
              name: ov.displayName || String(o.Name || '').replace(/[-\s]+$/, ''),
              stage: ov.stage || o.StageName || '',
              country: ov.country || o.Builing_Locaiton__c || '',
              product: ov.product || o.Project_Type__c || '',
              carSpaces: ov.carSpaces ?? (o.No_of_Car_Spaces__c != null ? Number(o.No_of_Car_Spaces__c) : null),
              // Salesforce wins on the amount when it has one: that is the
              // figure sales keep current. The input only fills a blank.
              amountUsdMn: usd != null ? round(usd, 2) : ov.amountUsdMn ?? null,
              closeDate: o.CloseDate || ov.closeDate || null,
              source: 'salesforce',
            };
          });
      }
      for (const o of overrides.filter((x) => x.add)) {
        if (rows.some((r) => r.name.toLowerCase().startsWith(String(o.match).toLowerCase()))) continue;
        rows.push({
          name: o.match,
          stage: o.stage || '',
          country: o.country || '',
          product: o.product || '',
          carSpaces: o.carSpaces ?? null,
          amountUsdMn: o.amountUsdMn ?? null,
          closeDate: o.closeDate || null,
          source: 'manual',
        });
      }
      rows.sort((a, b) => String(a.closeDate || '9999').localeCompare(String(b.closeDate || '9999')));
      return { rows, totalUsdMn: round(rows.reduce((s, r) => s + (r.amountUsdMn || 0), 0), 2) };
    },
    { rows: [], totalUsdMn: 0 }
  );

  // ------------------------------------------------ LinkedIn
  const liTarget = Number(targetFor('linkedinFollowers', month)) || null;
  const liActual = valueFor('linkedinFollowersGained', month).value;
  const linkedin = {
    org: S.linkedinOrg,
    followersTotal,
    series: series('linkedinFollowersGained', { withPrevious: false, target: 'linkedinFollowers' }),
    month: {
      target: liTarget,
      achieved: liActual,
      gap: liTarget != null && liActual != null ? liTarget - liActual : null,
      achievedPct: liTarget && liActual != null ? Math.round((liActual / liTarget) * 100) : null,
    },
    doneThisMonth: inputs.linkedin?.doneThisMonth || [],
    nextMonthPlan: inputs.linkedin?.nextMonthPlan || [],
  };

  // ------------------------------------------------ ABP slide tokens
  const [, mNum] = parseYm(month);
  const tokens = {
    monthName: LONG_MONTHS[mNum - 1],
    fyMonths: `${MONTHS[parseYm(fyStart)[1] - 1]}–${MONTHS[mNum - 1]}`,
    sqlMonth: valueFor('convertedLeads', month).value ?? '—',
    sqlYtd: sumElapsed('convertedLeads'),
    sqlTargetMonth: targetFor('convertedLeads', month) ?? '—',
    sqlTargetYtd: sumTargetElapsed('convertedLeads'),
    pipelineCrYtd: Math.round(sumElapsed('pipelineMn') / 10),
    wonCrYtd: wonCrYtd ?? '—',
    followersMonth: liActual ?? '—',
    followersYtd: sumElapsed('linkedinFollowersGained'),
  };
  const fill = (text) => String(text ?? '').replace(/\{\{(\w+)\}\}/g, (m, k) => (k in tokens ? String(tokens[k]) : m));
  const abp = {
    rows: (inputs.abp?.rows || []).map((r) => ({
      area: fill(r.area),
      fyTarget: fill(r.fyTarget),
      ytdTarget: fill(r.ytdTarget),
      ytdAchieved: fill(r.ytdAchieved),
      monthTarget: fill(r.monthTarget),
      monthAchieved: fill(r.monthAchieved),
    })),
  };

  // ------------------------------------------------ Hand-kept trackers
  const ina = inputs.inaugurations || { target: 0, items: [] };
  const inaDone = (ina.items || []).filter((i) => Number(i.progress) >= 100).length;
  const inaugurations = {
    target: ina.target || 0,
    completed: inaDone,
    ongoing: (ina.items || []).length - inaDone,
    overallPct: ina.target ? Math.round((inaDone / ina.target) * 100) : 0,
    items: ina.items || [],
  };

  return {
    meta: {
      month,
      monthName: LONG_MONTHS[mNum - 1],
      year: parseYm(month)[0],
      fiscalYear: fyLabel(fyStart),
      ytdLabel: tokens.fyMonths,
      generatedAt: new Date().toISOString(),
      generatedBy: viewerName || null,
      division: S.division,
      salesforce: { configured: salesforceConfigured, syncedAt: salesforceSyncedAt },
      inputs: inputsMeta,
    },
    warnings,
    tokens,
    abp,
    mql,
    siteBranding,
    exhibitions,
    linkedin,
    inaugurations,
    collaterals: inputs.collaterals || { completed: [], planned: [] },
    exportOpps,
    agents: inputs.agents || { title: 'Agents', items: [] },
  };
};

module.exports = { buildMrm, loadInputs, saveInput, resetInput, DEFAULT_KEYS: Object.keys(DEFAULTS) };
