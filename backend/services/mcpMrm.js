// =====================================================
// MCP tools for the MRM report page
// =====================================================
// What a Marketing admin can do on the MRM Report page, offered to an agent:
// read the month's figures, read and edit the inputs the deck is built from
// (spend, brand-visibility figures, SEO ranks, which ABM accounts, exhibition
// projects and collateral tickets are shown, wording, targets, definitions),
// and lock a month.
//
// Same rule as the rest of the MCP surface: every tool is a thin call to the
// portal's own /api/reports/mrm routes carrying the caller's credential. The
// routes decide who may see the pipeline and who may change the inputs
// (Marketing admins and Super Admins); a read-only key or sign-in is refused
// its writes by middleware/auth.js. Nothing here restates those rules.
//
// Editing an input is read-modify-write of one JSON value, exactly as the page
// does it: the last save of a key wins. The helpers below change only what the
// caller named and send back the whole key, so an agent that sets one month's
// spend cannot blank the other eleven by leaving them out.
//
// Not here: downloading the deck. It is a binary file, and the route refuses
// machine callers a bulk export of sales figures. An agent points the person
// at the page instead.

const portal = require('./portalApi');
const { requireWrite } = require('./mcpWrites');
const { BRAND_METRICS } = require('./mrmBrand');

const APP_URL = (process.env.FRONTEND_URL || 'https://mkttickets.siegerspintech.com').replace(/\/$/, '');
const PAGE_URL = `${APP_URL}/mrm-report`;

const changes = { readOnlyHint: false, destructiveHint: false, idempotentHint: true };
const destructive = { readOnlyHint: false, destructiveHint: true, idempotentHint: true };

const bad = (message) => new portal.PortalError(400, message);

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const checkMonth = (m, name = 'month') => {
  if (!MONTH_RE.test(String(m || ''))) throw bad(`"${name}" must be a month as YYYY-MM, e.g. 2026-09.`);
  return String(m);
};
const monthArg = { type: 'string', description: 'Review month as YYYY-MM. Defaults to last month.' };

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
// Keys that would reach Object.prototype through a merge.
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const kindOf = (v) => (v === undefined || v === null ? 'nothing' : Array.isArray(v) ? 'list' : isPlainObject(v) ? 'object' : 'value');
const KIND_WORD = { list: 'a list', object: 'a set of named values', value: 'a single value' };

// Objects merge key by key; arrays and scalars replace; null removes the key.
// What is already saved keeps its shape: a list stays a list, a set of named
// values stays one. Without that, a patch written as { projects: { 0: {...} } }
// (the natural way to "change the first row") would replace the saved rows
// with an object and report success.
const deepMerge = (target, patch, path = '') => {
  const out = isPlainObject(target) ? { ...target } : {};
  for (const [k, v] of Object.entries(patch)) {
    if (UNSAFE_KEYS.has(k)) throw bad(`"${k}" is not a key that can be set.`);
    const at = path ? `${path}.${k}` : k;
    if (v === null) {
      delete out[k];
      continue;
    }
    const have = kindOf(out[k]);
    const want = kindOf(v);
    if (have !== 'nothing' && have !== want) {
      throw bad(
        `"${at}" is saved as ${KIND_WORD[have]}, so it cannot be replaced by ${KIND_WORD[want]}.` +
          (have === 'list' ? ' To change one row, read the input and pass the whole list back with that row changed.' : '')
      );
    }
    out[k] = want === 'object' ? deepMerge(out[k], v, at) : v;
  }
  return out;
};

// The same guard for a whole-value replace: wherever a key exists on both
// sides, a list must stay a list and named values stay named values. Rows
// inside a list are not compared.
const assertSameShape = (current, next, path = '') => {
  if (!isPlainObject(current) || !isPlainObject(next)) return;
  for (const [k, v] of Object.entries(next)) {
    if (UNSAFE_KEYS.has(k)) throw bad(`"${k}" is not a key that can be set.`);
    const at = path ? `${path}.${k}` : k;
    const have = kindOf(current[k]);
    const want = kindOf(v);
    if (have !== 'nothing' && want !== 'nothing' && have !== want) {
      throw bad(`"${at}" is saved as ${KIND_WORD[have]}, so it cannot be replaced by ${KIND_WORD[want]}.`);
    }
    if (want === 'object') assertSameShape(current[k], v, at);
  }
};

// A number, or null / "" to clear. Anything else is refused rather than
// guessed at: Number(true) is 1 and Number([]) is 0.
const numOrNull = (v, name) => {
  if (v === null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  throw bad(`"${name}" must be a number (or null to clear it).`);
};
// For a field the tool requires: leaving it out is a mistake, not a request to
// clear what is saved. (The MCP layer does not check arguments against the
// schema, so a mis-named field arrives here as undefined.)
const requiredNum = (v, name) => {
  if (v === undefined) throw bad(`Each entry needs "${name}" (a number, or null to clear what is saved).`);
  return numOrNull(v, name);
};
const boolOr = (v, fallback, name) => {
  if (v === undefined || v === null) return fallback;
  if (v === true || v === false) return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  throw bad(`"${name}" must be true or false.`);
};
const entriesOf = (list, name, max) => {
  if (!Array.isArray(list) || !list.length) throw bad(`Pass "${name}" as a list with at least one entry.`);
  if (list.length > max) throw bad(`At most ${max} entries per call; send the rest in another call.`);
  if (!list.every(isPlainObject)) throw bad(`Every entry in "${name}" must be an object.`);
  return list;
};
const clone = (v) => JSON.parse(JSON.stringify(v));

// One edit of an input at a time. Every edit is read → change → save of the
// whole value, and a client may issue several tool calls at once (this month's
// and last month's brand figures, say); unserialised, each would save over the
// other and both would report success. The MCP server is one process, so a
// promise chain per input key is enough. An edit made on the web page at the
// same moment can still be overwritten, exactly as between two browser tabs.
const queues = new Map();
const serial = (key, fn) => {
  const run = (queues.get(key) || Promise.resolve()).then(fn, fn);
  const tail = run.catch(() => {});
  queues.set(key, tail);
  tail.then(() => {
    if (queues.get(key) === tail) queues.delete(key);
  });
  return run;
};

// What each input is, for an agent that has never seen the page.
const INPUT_GUIDE = {
  spend: 'Marketing spend in ₹ lakh: { [division]: { [source]: { "YYYY-MM": lakh } } }. Ads is read from Google Ads unless typed. Use mrm_set_spend.',
  abm: 'ABM slide: { picked: { [abmAccountId]: { include, action, quotationLakh } }, accounts: [typed rows] }. Use mrm_tick_abm_accounts.',
  exhibitions: 'Expo slide: { projects: [ticked portal projects with dates, budget, spend, remarks], manual: [events without a project], newExpos: [strategic new exhibitions] }. Use mrm_tick_exhibition_projects for projects.',
  brand: 'Brand Visibility Index: { months: { "YYYY-MM": figures }, targets: full-marks level per figure, weights }. Use mrm_set_brand_figures.',
  linkedin: 'LinkedIn slide wording: { doneThisMonth: [..], nextMonthPlan: [..] }.',
  seo: 'SEO keywords: { keywords: [{ keyword, division, ranks: { "YYYY-MM": rank } }], notes }. Use mrm_set_seo_ranks.',
  collaterals: 'Collateral slide: { tickets: { [ticketId]: { include, location, type, label } }, completed, planned (older typed lists) }. Use mrm_tick_collateral_tickets.',
  targets: 'Monthly targets per fiscal year, e.g. { 2026: { linkedinFollowers: { "Sieger Parking": { default: 765 } } } }.',
  history: 'Figures already presented to management, shown as presented. Normally written by mrm_lock_month.',
  settings: 'Definitions: divisions, marketing sources, ticket categories, quote statuses, LinkedIn pages. Change only when the business definition changes.',
};

// A fresh read every time an input is about to be changed: the portal client
// caches GETs for twenty seconds, and merging into a stale copy would undo an
// edit somebody just saved on the page.
const readInputs = async (ctx) => {
  portal.clearCache();
  const res = await portal.get(ctx.credential, '/reports/mrm/inputs');
  return { inputs: res?.inputs || {}, meta: res?.meta || {}, keys: res?.keys || Object.keys(res?.inputs || {}) };
};

// The inputs the page has an editor for. Older ones (ABP wording, agents,
// inaugurations, export fill-ins) are still stored but no longer feed the deck,
// so they are not offered here either.
const editable = (keys) => keys.filter((k) => Object.prototype.hasOwnProperty.call(INPUT_GUIDE, k));
const checkKey = (key, keys) => {
  const k = String(key || '');
  const allowed = editable(keys);
  if (!allowed.includes(k)) throw bad(`No MRM input called "${k}". Inputs: ${allowed.join(', ')}.`);
  return k;
};

const saveKey = (ctx, key, value) =>
  portal.mutate(ctx.credential, 'PUT', `/reports/mrm/inputs/${encodeURIComponent(key)}`, { value });

const lc = (v) => String(v ?? '').trim().toLowerCase();

// Which project an exhibition row stands for. A row carries a projectId once
// somebody has edited it; a built-in row carries projectMatch and belongs to
// the first project, by target date, whose name contains it. That is the rule
// services/mrmData.js applies when it builds the slide, so the list and the
// tick tool agree with what the deck shows.
const projectResolver = (projects) => {
  const asc = [...projects].sort((a, b) => String(a.target_date || '9999').localeCompare(String(b.target_date || '9999')));
  return (row) =>
    (row?.projectId && projects.find((p) => String(p.id) === String(row.projectId))) ||
    (row?.projectMatch && asc.find((p) => lc(p.name).includes(lc(row.projectMatch)))) ||
    null;
};

// Older saved targets and history kept LinkedIn figures for one page, flat
// (targets[fy].linkedinFollowers = { default: 765 }; history.linkedinFollowersGained
// = { 'YYYY-MM': n }). The page folds those under the first page's name before
// it writes per-page figures; a patch has to do the same, or the two shapes mix
// and the report ignores the new one.
const isFlatMonths = (o) => isPlainObject(o) && Object.keys(o).some((k) => /^\d{4}-\d{2}$/.test(k) || k === 'default');
const foldLinkedinShape = (key, value, settings) => {
  if (!isPlainObject(value)) return value;
  const orgs = Array.isArray(settings?.linkedinOrgs) ? settings.linkedinOrgs : [];
  const first = (typeof orgs[0] === 'string' ? orgs[0] : orgs[0]?.org) || settings?.linkedinOrg || 'Sieger Parking';
  const out = clone(value);
  if (key === 'history' && isFlatMonths(out.linkedinFollowersGained)) out.linkedinFollowersGained = { [first]: out.linkedinFollowersGained };
  if (key === 'targets') {
    for (const year of Object.keys(out)) {
      if (isFlatMonths(out[year]?.linkedinFollowers)) out[year].linkedinFollowers = { [first]: out[year].linkedinFollowers };
    }
  }
  return out;
};

// ---------------------------------------------------------------
// Shaping the report for a model
// ---------------------------------------------------------------
const cell = (c) => (c ? { spendLakh: c.spendLakh, leads: c.leads, converted: c.converted, opps: c.opps, quotes: c.quotes, pipelineCr: c.pipelineCr, pipelineCrPerLakhSpent: c.efficiency } : null);

const sections = {
  pipeline: (m) => ({
    definitions: m.funnel?.definitions,
    overall: { marketing: { month: cell(m.funnel?.overall?.marketing?.month), ytd: cell(m.funnel?.overall?.marketing?.ytd) }, includingSalesCreated: { month: cell(m.funnel?.overall?.total?.month), ytd: cell(m.funnel?.overall?.total?.ytd) } },
    divisions: (m.funnel?.divisions || []).map((d) => ({
      key: d.key,
      label: d.label,
      marketingSources: { month: cell(d.marketingTotal?.month), ytd: cell(d.marketingTotal?.ytd) },
      sources: (d.sources || []).map((s) => ({ key: s.key, label: s.label, marketing: s.marketing, month: cell(s.month), ytd: cell(s.ytd) })),
    })),
  }),
  abm: (m) => m.abm,
  expo: (m) => ({ rows: m.exhibitions?.rows, totals: m.exhibitions?.totals, leadsBySalesperson: m.exhibitions?.byOwner, strategicNewExpos: m.exhibitions?.newExpos }),
  brand: (m) => m.brand,
  linkedin: (m) => ({
    pages: (m.linkedin?.pages || []).map((p) => ({ page: p.label, org: p.org, followers: p.followersTotal, month: p.month, gainedByMonth: p.series?.current?.values, months: p.series?.categories })),
    doneThisMonth: m.linkedin?.doneThisMonth,
    nextMonthPlan: m.linkedin?.nextMonthPlan,
  }),
  engagement: (m) => m.engagement,
  seo: (m) => m.seo,
  collaterals: (m) => m.collaterals,
};

const summary = (m) => ({
  month: m.meta?.month,
  fiscalYear: m.meta?.fiscalYear,
  salesforceSyncedAt: m.meta?.salesforce?.syncedAt || null,
  warnings: m.warnings || [],
  pipeline: {
    marketingSourcesMonth: cell(m.funnel?.overall?.marketing?.month),
    marketingSourcesYtd: cell(m.funnel?.overall?.marketing?.ytd),
    byDivisionMonth: Object.fromEntries((m.funnel?.divisions || []).map((d) => [d.key, cell(d.marketingTotal?.month)])),
  },
  abm: m.abm?.totals,
  // Whole fiscal year, not the month: every exhibition on the tracker, and the
  // spend includes what is typed as expected for events still to come.
  expoFiscalYear: m.exhibitions
    ? { events: (m.exhibitions.rows || []).length, spendOrEstimateLakh: m.exhibitions.totals?.spendLakh, leads: m.exhibitions.totals?.leads, converted: m.exhibitions.totals?.converted }
    : null,
  brandIndex: m.brand ? { index: m.brand.index, change: m.brand.change, prevIndex: m.brand.prevIndex, scored: `${m.brand.scored} of ${m.brand.totalComponents}`, notScored: m.brand.missing } : null,
  linkedin: (m.linkedin?.pages || []).map((p) => ({ page: p.label, followers: p.followersTotal, gained: p.month?.achieved, target: p.month?.target })),
  engagement: m.engagement ? { planned: m.engagement.plan, completed: m.engagement.actual, ytd: `${m.engagement.ytdActual}/${m.engagement.ytdPlan}` } : null,
  seo: m.seo ? { targeted: m.seo.targeted, top10: m.seo.top10, averageRank: m.seo.avgRank } : null,
  collaterals: m.collaterals?.planVsActual,
  sections: Object.keys(sections),
  page: PAGE_URL,
});

const tools = [
  // ---------------------------------------------------------------
  // Reading
  // ---------------------------------------------------------------
  {
    name: 'mrm_report',
    title: 'MRM report figures',
    description:
      'The monthly Management Review Meeting figures behind the deck: marketing qualified pipeline by division and source ' +
      '(spend, leads, converted, opportunities, quotes, pipeline = open quotes), ABM accounts, expo plan vs actual, the Brand ' +
      'Visibility Index, LinkedIn, engagement activities, SEO and collateral plan vs actual. Marketing admins only. With no ' +
      'section it returns a one-screen summary; pass a section for its detail. Past months may show figures locked as presented.',
    inputSchema: {
      type: 'object',
      properties: {
        month: monthArg,
        section: { type: 'string', enum: Object.keys(sections), description: 'One part of the report in full. Omit for the summary.' },
      },
    },
    handler: async (args, ctx) => {
      const query = args.month ? { month: checkMonth(args.month) } : {};
      const model = await portal.get(ctx.credential, '/reports/mrm/data', query);
      if (args.section) {
        const pick = sections[args.section];
        if (!pick) throw bad(`No section "${args.section}". Sections: ${Object.keys(sections).join(', ')}.`);
        return { month: model.meta?.month, section: args.section, data: pick(model), warnings: model.warnings || [] };
      }
      return summary(model);
    },
  },

  {
    name: 'mrm_inputs',
    title: 'MRM inputs',
    description:
      'What the MRM deck cannot compute and somebody maintains: spend, ABM ticks, exhibitions, brand-visibility figures, ' +
      'LinkedIn wording, SEO ranks, collateral ticks, targets, presented figures and definitions. With no key it lists the ' +
      'inputs, what each holds and which have been edited; with a key it returns that input\'s current value. Read this ' +
      'before changing an input with mrm_update_input.',
    inputSchema: {
      type: 'object',
      properties: { key: { type: 'string', description: 'One input to return in full, e.g. "spend" or "brand".' } },
    },
    handler: async (args, ctx) => {
      const { inputs, meta, keys } = await readInputs(ctx);
      const stored = new Map((meta.stored || []).map((s) => [s.key, s]));
      if (args.key) {
        const key = checkKey(args.key, keys);
        const s = stored.get(key);
        return { key, about: INPUT_GUIDE[key] || null, edited: Boolean(s), updatedAt: s?.updated_at || null, updatedBy: s?.updated_by_name || null, value: inputs[key] };
      }
      return {
        inputs: editable(keys).map((k) => ({ key: k, about: INPUT_GUIDE[k] || null, edited: stored.has(k), updatedAt: stored.get(k)?.updated_at || null, updatedBy: stored.get(k)?.updated_by_name || null })),
        savingAvailable: meta.migrationNeeded !== true,
        page: PAGE_URL,
      };
    },
  },

  {
    name: 'mrm_pick_list',
    title: 'What can be ticked for the MRM deck',
    description:
      'The lists the MRM page ticks from, with ids: "projects" (portal projects, to mark as exhibitions), "abm_accounts" ' +
      '(accounts in the ABM module, Lost ones left out) and "collateral_tickets" (video, animation and collateral tickets ' +
      'for the month). Use the ids with mrm_tick_exhibition_projects, mrm_tick_abm_accounts and mrm_tick_collateral_tickets.',
    inputSchema: {
      type: 'object',
      properties: {
        list: { type: 'string', enum: ['projects', 'abm_accounts', 'collateral_tickets'] },
        month: { ...monthArg, description: 'For collateral_tickets: the review month, YYYY-MM. Defaults to last month.' },
        search: { type: 'string', description: 'Only rows whose name or title contains this.' },
      },
      required: ['list'],
    },
    handler: async (args, ctx) => {
      const paths = { projects: '/reports/mrm/projects', abm_accounts: '/reports/mrm/abm-accounts', collateral_tickets: '/reports/mrm/collateral-candidates' };
      const path = paths[args.list];
      if (!path) throw bad('list must be one of: projects, abm_accounts, collateral_tickets.');
      const query = args.list === 'collateral_tickets' && args.month ? { month: checkMonth(args.month) } : {};
      const [rows, { inputs }] = await Promise.all([portal.get(ctx.credential, path, query), readInputs(ctx)]);
      const q = lc(args.search);
      const all = (Array.isArray(rows) ? rows : []).filter((r) => !q || lc(`${r.name || ''} ${r.title || ''}`).includes(q));
      // Say which are already on the deck, so the agent does not have to cross-reference.
      const ex = inputs.exhibitions;
      const resolve = args.list === 'projects' ? projectResolver(Array.isArray(rows) ? rows : []) : () => null;
      const exhibitionIds = new Set((Array.isArray(ex) ? [] : ex?.projects || []).map((r) => resolve(r)?.id).filter(Boolean));
      const ticked = (r) =>
        args.list === 'projects'
          ? exhibitionIds.has(r.id)
          : args.list === 'abm_accounts'
            ? inputs.abm?.picked?.[r.id]?.include === true
            : inputs.collaterals?.tickets?.[r.id]?.include === true;
      const shown = all.slice(0, 200).map((r) => ({ ...r, onDeck: ticked(r) }));
      return { list: args.list, count: all.length, rows: shown, ...(all.length > shown.length ? { note: `Showing 200 of ${all.length}; narrow with search.` } : {}) };
    },
  },

  // ---------------------------------------------------------------
  // Editing
  // ---------------------------------------------------------------
  {
    name: 'mrm_set_spend',
    title: 'Enter marketing spend',
    description:
      'Sets marketing spend in ₹ lakh for one or more division / source / month cells of the MRM pipeline slides. Other ' +
      'cells are left as they are. Pass lakh: null to clear a cell. Ads spend comes from Google Ads when its cell is blank, ' +
      'so type it only to override. Divisions and sources are the keys in the "settings" input (normally CPS, ASTOR, TMD and ' +
      'website, ads, database, scouter, expo).',
    annotations: changes,
    inputSchema: {
      type: 'object',
      properties: {
        entries: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              division: { type: 'string', description: 'Division key, e.g. CPS.' },
              source: { type: 'string', description: 'Source key, e.g. website.' },
              month: { type: 'string', description: 'YYYY-MM.' },
              lakh: { type: ['number', 'null'], description: 'Spend in ₹ lakh; null clears the cell.' },
            },
            required: ['division', 'source', 'month', 'lakh'],
          },
        },
      },
      required: ['entries'],
    },
    handler: async (args, ctx) => {
      requireWrite(ctx);
      const entries = entriesOf(args.entries, 'entries', 500);
      return serial('spend', async () => {
        const { inputs } = await readInputs(ctx);
        const keysOf = (list) => (Array.isArray(list) ? list : []).map((x) => x?.key).filter((k) => typeof k === 'string' && !UNSAFE_KEYS.has(k));
        const divisions = keysOf(inputs.settings?.divisions);
        const sources = keysOf(inputs.settings?.sources);
        const spend = isPlainObject(inputs.spend) ? clone(inputs.spend) : {};
        const written = [];
        for (const e of entries) {
          const division = divisions.find((d) => lc(d) === lc(e.division));
          const source = sources.find((x) => lc(x) === lc(e.source));
          if (!division) throw bad(`No division "${e.division}". Divisions: ${divisions.join(', ')}.`);
          if (!source) throw bad(`No source "${e.source}". Sources: ${sources.join(', ')}.`);
          const month = checkMonth(e.month);
          const lakh = requiredNum(e.lakh, 'lakh');
          if (lakh !== null && lakh < 0) throw bad('Spend cannot be negative.');
          spend[division] = isPlainObject(spend[division]) ? spend[division] : {};
          spend[division][source] = isPlainObject(spend[division][source]) ? spend[division][source] : {};
          spend[division][source][month] = lakh;
          written.push({ division, source, month, lakh });
        }
        await saveKey(ctx, 'spend', spend);
        return { saved: written, message: `Saved ${written.length} spend cell(s).`, page: PAGE_URL };
      });
    },
  },

  {
    name: 'mrm_set_brand_figures',
    title: 'Enter brand visibility figures',
    description:
      'Enters a month\'s figures for the Brand Visibility Index slide, and optionally the full-marks level ("target") and ' +
      `weight of each scored figure. Figure keys: ${BRAND_METRICS.map((m) => m.key).join(', ')}. ` +
      'enquiries, opportunities and linkedinFollowers are filled by the portal; type them only to override. A null value ' +
      'clears a figure. Figures, targets and weights not mentioned are left as they are. The index compares with the ' +
      'previous month only when both months are scored on the same components, so enter last month\'s figures too the first time.',
    annotations: changes,
    inputSchema: {
      type: 'object',
      properties: {
        month: { type: 'string', description: 'YYYY-MM the figures belong to.' },
        figures: { type: 'object', description: 'Figure key → number (or null to clear).', additionalProperties: { type: ['number', 'null'] } },
        targets: { type: 'object', description: 'Scored figure key → the level that counts as full marks.', additionalProperties: { type: ['number', 'null'] } },
        weights: { type: 'object', description: 'Scored figure key → weight in percent. Blank uses the default.', additionalProperties: { type: ['number', 'null'] } },
      },
      required: ['month'],
    },
    handler: async (args, ctx) => {
      requireWrite(ctx);
      const month = checkMonth(args.month);
      const metricKeys = BRAND_METRICS.map((m) => m.key);
      const scoredKeys = BRAND_METRICS.filter((m) => m.component).map((m) => m.key);
      const clean = (obj, allowed, what) => {
        const out = {};
        for (const [k, v] of Object.entries(isPlainObject(obj) ? obj : {})) {
          if (!allowed.includes(k)) throw bad(`"${k}" is not a ${what}. Use: ${allowed.join(', ')}.`);
          const n = numOrNull(v, k);
          if (n !== null && n < 0) throw bad(`"${k}" cannot be negative.`);
          out[k] = n;
        }
        return out;
      };
      const figures = clean(args.figures, metricKeys, 'figure key');
      const targets = clean(args.targets, scoredKeys, 'scored figure key');
      const weights = clean(args.weights, scoredKeys, 'scored figure key');
      if (!Object.keys(figures).length && !Object.keys(targets).length && !Object.keys(weights).length) {
        throw bad('Nothing to save: pass figures, targets or weights.');
      }
      await serial('brand', async () => {
        const { inputs } = await readInputs(ctx);
        const brand = isPlainObject(inputs.brand) ? clone(inputs.brand) : {};
        const obj = (v) => (isPlainObject(v) ? v : {});
        brand.months = { ...obj(brand.months), [month]: { ...obj(obj(brand.months)[month]), ...figures } };
        brand.targets = { ...obj(brand.targets), ...targets };
        brand.weights = { ...obj(brand.weights), ...weights };
        await saveKey(ctx, 'brand', brand);
      });
      portal.clearCache();
      const model = await portal.get(ctx.credential, '/reports/mrm/data', { month });
      const b = model.brand || {};
      return {
        saved: { month, figures, targets, weights },
        index: { value: b.index ?? null, change: b.change ?? null, scored: `${b.scored ?? 0} of ${b.totalComponents ?? 7}`, notScored: b.missing || [] },
        message: b.index == null ? 'Saved. No component can be scored yet: each needs the month\'s figure and a full-marks level.' : `Saved. The index for ${month} is ${b.index} / 100.`,
        page: PAGE_URL,
      };
    },
  },

  {
    name: 'mrm_set_seo_ranks',
    title: 'Enter SEO keyword ranks',
    description:
      'Records the Google rank of targeted keywords for a month on the MRM SEO slide. A keyword not yet on the list is ' +
      'added; ranks for other months and other keywords are kept. rank: null clears that month for the keyword. To drop a ' +
      'keyword altogether, edit the "seo" input with mrm_update_input.',
    annotations: changes,
    inputSchema: {
      type: 'object',
      properties: {
        month: { type: 'string', description: 'YYYY-MM the ranks were measured for.' },
        ranks: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              keyword: { type: 'string' },
              rank: { type: ['number', 'null'], description: 'Position on Google, 1 = top.' },
              division: { type: 'string', description: 'Optional: CPS, ASTOR or TMD.' },
            },
            required: ['keyword', 'rank'],
          },
        },
        note: { type: 'string', description: 'Optional footnote for the slide, e.g. how the ranks were checked.' },
      },
      required: ['month', 'ranks'],
    },
    handler: async (args, ctx) => {
      requireWrite(ctx);
      const month = checkMonth(args.month);
      const rows = entriesOf(args.ranks, 'ranks', 300);
      return serial('seo', async () => {
        const { inputs } = await readInputs(ctx);
        const seo = isPlainObject(inputs.seo) ? clone(inputs.seo) : {};
        const keywords = (Array.isArray(seo.keywords) ? seo.keywords : []).filter(isPlainObject);
        const added = [];
        for (const r of rows) {
          const name = typeof r.keyword === 'string' ? r.keyword.trim() : '';
          if (!name) throw bad('Every entry needs a keyword.');
          const rank = requiredNum(r.rank, 'rank');
          if (rank !== null && (rank < 1 || !Number.isInteger(rank))) throw bad(`Rank for "${name}" must be a whole number from 1.`);
          let kw = keywords.find((k) => lc(k.keyword) === lc(name));
          if (!kw) {
            kw = { keyword: name, division: '', ranks: {} };
            keywords.push(kw);
            added.push(name);
          }
          if (r.division !== undefined) kw.division = String(r.division || '');
          kw.ranks = { ...(isPlainObject(kw.ranks) ? kw.ranks : {}), [month]: rank };
        }
        seo.keywords = keywords;
        if (args.note !== undefined) seo.notes = String(args.note || '');
        await saveKey(ctx, 'seo', seo);
        return { saved: rows.length, month, addedKeywords: added, totalKeywords: keywords.length, message: `Saved ${rows.length} rank(s) for ${month}.`, page: PAGE_URL };
      });
    },
  },

  {
    name: 'mrm_tick_abm_accounts',
    title: 'Choose ABM accounts for the deck',
    description:
      'Ticks or unticks accounts from the ABM module for the MRM ABM slide, and optionally sets the "action required" text ' +
      'or a quotation in ₹ lakh that overrides what the module and Salesforce say. Identify an account by id (from ' +
      'mrm_pick_list abm_accounts) or by its exact name. Accounts not mentioned keep their state. The slide fits 16.',
    annotations: changes,
    inputSchema: {
      type: 'object',
      properties: {
        accounts: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'ABM account id.' },
              name: { type: 'string', description: 'Exact account name, if the id is not known.' },
              include: { type: 'boolean', description: 'true to show on the slide (default), false to take off.' },
              action: { type: ['string', 'null'], description: 'Action required; null or "" goes back to the module\'s next action.' },
              quotationLakh: { type: ['number', 'null'], description: 'Quotation in ₹ lakh; null goes back to the automatic figure.' },
            },
          },
        },
      },
      required: ['accounts'],
    },
    handler: async (args, ctx) => {
      requireWrite(ctx);
      const wanted = entriesOf(args.accounts, 'accounts', 100);
      return serial('abm', async () => {
      const { inputs } = await readInputs(ctx);
      const candidates = await portal.get(ctx.credential, '/reports/mrm/abm-accounts');
      const list = Array.isArray(candidates) ? candidates : [];
      const abm = isPlainObject(inputs.abm) ? clone(inputs.abm) : {};
      abm.picked = isPlainObject(abm.picked) ? abm.picked : {};
      const done = [];
      for (const w of wanted) {
        if (!w.id && !w.name) throw bad('Each account needs an id or a name.');
        const hit = w.id ? list.find((a) => String(a.id) === String(w.id)) : list.filter((a) => lc(a.name) === lc(w.name));
        const account = Array.isArray(hit) ? (hit.length === 1 ? hit[0] : null) : hit;
        if (!account) {
          throw bad(
            Array.isArray(hit) && hit.length > 1
              ? `More than one ABM account is called "${w.name}"; use the id from mrm_pick_list.`
              : `No ABM account ${w.id ? `with id ${w.id}` : `called "${w.name}"`} on the list (Lost accounts are left off). See mrm_pick_list abm_accounts.`
          );
        }
        const id = String(account.id);
        if (UNSAFE_KEYS.has(id)) throw bad('That account id cannot be used.');
        const entry = { ...(isPlainObject(abm.picked[id]) ? abm.picked[id] : {}) };
        entry.include = boolOr(w.include, true, 'include');
        if (w.action !== undefined) entry.action = w.action === null ? '' : String(w.action);
        if (w.quotationLakh !== undefined) entry.quotationLakh = numOrNull(w.quotationLakh, 'quotationLakh');
        abm.picked[id] = entry;
        done.push({ id, name: account.name, onDeck: entry.include });
      }
      await saveKey(ctx, 'abm', abm);
      const total = Object.values(abm.picked).filter((p) => p?.include === true).length;
      return { updated: done, accountsOnDeck: total, message: `${total} account(s) are now ticked for the ABM slide.`, page: PAGE_URL };
      });
    },
  },

  {
    name: 'mrm_tick_collateral_tickets',
    title: 'Choose collateral tickets for the deck',
    description:
      'Ticks or unticks video, animation and collateral tickets for the MRM collateral slide, with an optional location, ' +
      'type and the name to show. Ids come from mrm_pick_list collateral_tickets. While no ticket is ticked the slide lists ' +
      'every collateral ticket of the month on its own; ticking narrows it to the chosen ones.',
    annotations: changes,
    inputSchema: {
      type: 'object',
      properties: {
        tickets: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Ticket id.' },
              include: { type: 'boolean', description: 'true to list on the slide (default), false to take off.' },
              location: { type: 'string' },
              type: { type: 'string', description: 'e.g. Video, Video + Testimonial, Photos, Animation, Collateral.' },
              label: { type: 'string', description: 'Name on the slide; blank uses the ticket title.' },
            },
            required: ['id'],
          },
        },
      },
      required: ['tickets'],
    },
    handler: async (args, ctx) => {
      requireWrite(ctx);
      const wanted = entriesOf(args.tickets, 'tickets', 100);
      // Checked before anything is read for saving: every id, and that the
      // ticket is one this caller can see (the route answers 404/403 otherwise).
      // The entry is then keyed by the id the route returned, not by what was typed.
      const checked = new Map();
      for (const w of wanted) {
        const typed = typeof w.id === 'string' || typeof w.id === 'number' ? String(w.id).trim() : '';
        if (!typed || UNSAFE_KEYS.has(typed)) throw bad('Every entry needs a ticket id.');
        const ticket = await portal.get(ctx.credential, `/tickets/${encodeURIComponent(typed)}`);
        const id = String(ticket?.id ?? '');
        if (!id || UNSAFE_KEYS.has(id)) throw bad(`No ticket with id ${typed}.`);
        checked.set(id, w); // a ticket named twice keeps its last entry
      }
      return serial('collaterals', async () => {
        const { inputs } = await readInputs(ctx);
        const col = isPlainObject(inputs.collaterals) ? clone(inputs.collaterals) : {};
        col.tickets = isPlainObject(col.tickets) ? col.tickets : {};
        for (const [id, w] of checked) {
          const entry = { ...(isPlainObject(col.tickets[id]) ? col.tickets[id] : {}) };
          entry.include = boolOr(w.include, true, 'include');
          for (const f of ['location', 'type', 'label']) if (w[f] !== undefined) entry[f] = String(w[f] ?? '');
          col.tickets[id] = entry;
        }
        await saveKey(ctx, 'collaterals', col);
        const total = Object.values(col.tickets).filter((t) => t?.include === true).length;
        return { updated: [...checked.keys()], ticketsOnDeck: total, message: `${total} ticket(s) are now ticked for the collateral slide.`, page: PAGE_URL };
      });
    },
  },

  {
    name: 'mrm_tick_exhibition_projects',
    title: 'Choose exhibition projects for the deck',
    description:
      'Marks portal projects as exhibitions on the MRM expo slide, or takes them off, and sets each one\'s event dates, ' +
      'budget and spend in ₹ lakh, remarks and a status override. Project ids come from mrm_pick_list projects. Fields not ' +
      'mentioned are kept. Status is worked out from the project\'s tasks unless statusOverride is set. Events without a ' +
      'project and the "strategic new exhibitions" list live in the same "exhibitions" input: edit those with mrm_update_input.',
    annotations: changes,
    inputSchema: {
      type: 'object',
      properties: {
        projects: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              projectId: { type: 'string' },
              include: { type: 'boolean', description: 'true to show as an exhibition (default), false to take off the slide.' },
              name: { type: 'string', description: 'Name on the slide; blank uses the project name.' },
              from: { type: 'string', description: 'First day of the event, YYYY-MM-DD.' },
              to: { type: 'string', description: 'Last day of the event, YYYY-MM-DD.' },
              budgetLakh: { type: ['number', 'null'] },
              spendLakh: { type: ['number', 'null'], description: 'Typed spend; null falls back to expense claims.' },
              statusOverride: { type: 'string', description: 'e.g. Done, 40%, Cancelled. "" goes back to automatic.' },
              claimMatch: { type: 'array', items: { type: 'string' }, description: 'Words that identify this event\'s expense claims by title.' },
              countLeads: { type: 'boolean', description: 'false for events where no leads are expected.' },
              remarks: { type: 'string' },
            },
            required: ['projectId'],
          },
        },
      },
      required: ['projects'],
    },
    handler: async (args, ctx) => {
      requireWrite(ctx);
      const wanted = entriesOf(args.projects, 'projects', 100);
      return serial('exhibitions', async () => {
      const { inputs } = await readInputs(ctx);
      const projects = await portal.get(ctx.credential, '/reports/mrm/projects');
      const known = Array.isArray(projects) ? projects : [];
      const resolve = projectResolver(known);
      const cur = inputs.exhibitions;
      // An older saved value is a plain list of typed events; keep them as such.
      const ex = Array.isArray(cur) ? { projects: [], manual: clone(cur), newExpos: [] } : clone(isPlainObject(cur) ? cur : {});
      ex.projects = (Array.isArray(ex.projects) ? ex.projects : []).filter(isPlainObject);
      const day = (v, name) => {
        if (v === undefined) return undefined;
        if (v === '' || v === null) return '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) throw bad(`"${name}" must be a date as YYYY-MM-DD.`);
        return String(v);
      };
      const done = [];
      for (const w of wanted) {
        const project = known.find((p) => String(p.id) === String(w.projectId));
        if (!project) throw bad(`No project with id ${w.projectId}. See mrm_pick_list projects.`);
        // A built-in row finds its project by name until somebody edits it; it
        // is this project's row only if it resolves to this project.
        const idx = ex.projects.findIndex((r) => String(resolve(r)?.id ?? '') === String(project.id));
        if (boolOr(w.include, true, 'include') === false) {
          if (idx >= 0) ex.projects.splice(idx, 1);
          done.push({ projectId: project.id, name: project.name, onDeck: false });
          continue;
        }
        const row = idx >= 0 ? { ...ex.projects[idx] } : {};
        row.projectId = project.id;
        delete row.projectMatch;
        const from = day(w.from, 'from');
        const to = day(w.to, 'to');
        if (from !== undefined) row.from = from;
        if (to !== undefined) row.to = to;
        if (w.name !== undefined) row.name = String(w.name || '') || undefined;
        if (w.budgetLakh !== undefined) row.budgetLakh = numOrNull(w.budgetLakh, 'budgetLakh');
        if (w.spendLakh !== undefined) row.spendLakh = numOrNull(w.spendLakh, 'spendLakh');
        if (w.statusOverride !== undefined) row.statusOverride = String(w.statusOverride || '');
        if (w.claimMatch !== undefined) {
          // One phrase is accepted as a one-item list; anything else that is
          // not a list is refused rather than saved as "no claims".
          const words = typeof w.claimMatch === 'string' ? [w.claimMatch] : w.claimMatch;
          if (!Array.isArray(words)) throw bad('"claimMatch" must be a list of words or phrases.');
          row.claimMatch = words.map((x) => String(x ?? '').trim()).filter(Boolean);
        }
        if (w.countLeads !== undefined) row.countLeads = boolOr(w.countLeads, true, 'countLeads');
        if (w.remarks !== undefined) row.remarks = String(w.remarks || '');
        if (idx >= 0) ex.projects[idx] = row;
        else ex.projects.push(row);
        done.push({ projectId: project.id, name: row.name || project.name, onDeck: true });
      }
      await saveKey(ctx, 'exhibitions', ex);
      return { updated: done, exhibitionProjects: ex.projects.length, message: `${ex.projects.length} project(s) are now on the expo slide.`, page: PAGE_URL };
      });
    },
  },

  {
    name: 'mrm_update_input',
    title: 'Edit an MRM input',
    description:
      'Changes any input of the MRM report: the general tool behind the page\'s "Deck content you maintain" panel. Read the ' +
      'input first with mrm_inputs: there is no undo and no history of earlier values. Pass `patch` to change part of it: ' +
      'named values are merged key by key, a list replaces the list that was there (so send the whole list, with the one ' +
      'row changed), and null removes a key. A list cannot be replaced by named values or the reverse. Pass `value` instead ' +
      'to replace the whole input. For spend, ' +
      'brand figures, SEO ranks and the tick lists prefer their own tools, which cannot drop what they were not told about. ' +
      'Examples: LinkedIn wording → key "linkedin", patch { "nextMonthPlan": ["...", "..."] }; a follower target → key ' +
      '"targets", patch { "2026": { "linkedinFollowers": { "Sieger": { "default": 900 } } } }.',
    // Destructive: a whole-value replace or a null in a patch discards what was saved.
    annotations: destructive,
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'The input, e.g. linkedin, targets, exhibitions, settings.' },
        patch: { type: 'object', description: 'Partial change, merged into the current value.' },
        value: {
          description: 'The complete new value. Replaces everything in this input, with no undo.',
          anyOf: [{ type: 'object' }, { type: 'array', items: {} }],
        },
      },
      required: ['key'],
    },
    handler: async (args, ctx) => {
      requireWrite(ctx);
      const hasPatch = args.patch !== undefined && args.patch !== null;
      const hasValue = args.value !== undefined && args.value !== null;
      if (hasPatch === hasValue) throw bad('Pass exactly one of `patch` (change part) or `value` (replace all).');
      if (hasPatch && !isPlainObject(args.patch)) throw bad('`patch` must be an object.');
      if (hasPatch && !Object.keys(args.patch).length) throw bad('The patch is empty: nothing to change.');
      if (hasValue && typeof args.value !== 'object') throw bad('`value` must be an object or a list.');
      return serial(String(args.key || ''), async () => {
        const { inputs, keys } = await readInputs(ctx);
        const key = checkKey(args.key, keys);
        // Older one-page LinkedIn figures are folded under the page's name first,
        // as the page does, so per-page figures do not land beside a flat one.
        const current = foldLinkedinShape(key, inputs[key], inputs.settings);
        let next;
        if (hasValue) {
          next = args.value;
          if (Array.isArray(current) !== Array.isArray(next)) throw bad(`"${key}" must stay ${Array.isArray(current) ? 'a list' : 'an object'}.`);
          assertSameShape(current, next);
        } else {
          if (!isPlainObject(current)) throw bad(`"${key}" is a list, so it cannot be patched; pass the whole list as \`value\`.`);
          next = deepMerge(current, args.patch);
        }
        await saveKey(ctx, key, next);
        return {
          key,
          changed: hasPatch ? Object.keys(args.patch) : 'whole input replaced',
          message: `Saved "${key}". The deck and the page use it from now on.`,
          page: PAGE_URL,
        };
      });
    },
  },

  {
    name: 'mrm_lock_month',
    title: 'Lock a month\'s presented figures',
    description:
      'Saves the figures the deck shows for the month (LinkedIn follower gains and the older lead figures) as "presented", ' +
      'so the deck keeps showing them after Salesforce and LinkedIn move on. Meant to be done once, right after the review ' +
      'meeting. A month that already has presented figures keeps them: locking again does not recount it. To refresh a ' +
      'locked figure, clear that month\'s cell in the "history" input (mrm_update_input with null) and lock again.',
    annotations: changes,
    inputSchema: { type: 'object', properties: { month: { type: 'string', description: 'YYYY-MM to lock.' } }, required: ['month'] },
    handler: async (args, ctx) => {
      requireWrite(ctx);
      const month = checkMonth(args.month);
      // Locking rewrites the "history" input, so it waits its turn behind any edit of it.
      const res = await serial('history', () => portal.mutate(ctx.credential, 'POST', '/reports/mrm/lock', { month }));
      return { month, written: res?.written || {}, message: res?.message || `Locked ${month}.`, page: PAGE_URL };
    },
  },

  {
    name: 'mrm_reset_input',
    title: 'Reset an MRM input to its default',
    description:
      'Discards the saved version of one MRM input and goes back to the built-in default. Everything typed into that ' +
      'input is lost and there is no undo: read it with mrm_inputs first and keep a copy if it might be wanted. To change ' +
      'part of an input use mrm_update_input instead.',
    annotations: destructive,
    inputSchema: { type: 'object', properties: { key: { type: 'string', description: 'The input to reset.' } }, required: ['key'] },
    handler: async (args, ctx) => {
      requireWrite(ctx);
      return serial(String(args.key || ''), async () => {
        const { keys } = await readInputs(ctx);
        const key = checkKey(args.key, keys);
        await portal.mutate(ctx.credential, 'DELETE', `/reports/mrm/inputs/${encodeURIComponent(key)}`);
        return { key, message: `Reset "${key}" to the built-in default. This cannot be undone.`, page: PAGE_URL };
      });
    },
  },
];

module.exports = { tools, deepMerge, assertSameShape, foldLinkedinShape, projectResolver };
