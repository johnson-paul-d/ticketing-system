// =====================================================
// MRM: marketing qualified pipeline, ABM, engagement, SEO
// =====================================================
// The parts of the MRM deck that follow the review's own structure rather
// than a data source: per division and per marketing source, the chain
//   spend → leads → converted → opportunities → quotes → pipeline → efficiency
// where pipeline is the open quote value on the opportunities and efficiency
// is the quote value raised per lakh of spend. Read from the Salesforce
// mirror (leads, opportunities, quotes, currency rates), Google Ads (ad
// spend) and the typed inputs (other spend, ABM list, SEO ranks).
//
// Everything is computed for the fiscal year to date; the month and the YTD
// figures are the same counts over two ranges of months.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const round = (v, dp = 1) => (v == null ? null : Math.round(v * 10 ** dp) / 10 ** dp);

// Which source a lead or opportunity belongs to, by its Salesforce LeadSource.
const sourceKeyFor = (sources, leadSource) => {
  const raw = String(leadSource || '').trim();
  const low = raw.toLowerCase();
  for (const s of sources) {
    if ((s.leadSources || []).some((x) => String(x).toLowerCase() === low)) return s.key;
    if (s.match && low.includes(String(s.match).toLowerCase())) return s.key;
  }
  return 'other';
};
const divisionKeyFor = (divisions, sfDivision) => {
  const d = String(sfDivision || '').trim().toLowerCase();
  const hit = divisions.find((x) => (x.salesforce || []).some((v) => String(v).toLowerCase() === d));
  return hit ? hit.key : null;
};

const OTHER = { key: 'other', label: 'Sales-created / other' };

const emptyCell = () => ({ spendLakh: null, leads: 0, converted: 0, opps: 0, quotes: 0, pipelineCr: 0, efficiency: null });

/**
 * @param ctx  { salesforce, salesforceConfigured, supabase, pageAll, chunk, safely, istMonth,
 *               inputs, month, fyStart, fyMonths, elapsed, monthStartUtc, addMonths, monthEndDay }
 */
const buildFunnel = async (ctx) => {
  const { salesforce, salesforceConfigured, supabase, pageAll, chunk, safely, istMonth, inputs, month, fyStart, fyMonths, elapsed, monthStartUtc, addMonths, monthEndDay } = ctx;
  const S = inputs.settings;
  const divisions = Array.isArray(S.divisions) && S.divisions.length ? S.divisions : [];
  const sources = Array.isArray(S.sources) && S.sources.length ? S.sources : [];
  const openStatuses = new Set((S.openQuoteStatuses || ['In Review', 'Presented', 'Negotiation']).map((s) => String(s).toLowerCase()));
  const rangeStartUtc = monthStartUtc(fyStart);
  const rangeEndUtc = monthStartUtc(addMonths(month, 1));

  // counts[division][source][month] = { leads, converted, opps, quotes, pipelineInr }
  const counts = {};
  const bump = (d, s, m, field, by = 1) => {
    if (!d || !m) return;
    counts[d] = counts[d] || {};
    counts[d][s] = counts[d][s] || {};
    counts[d][s][m] = counts[d][s][m] || { leads: 0, converted: 0, opps: 0, quotes: 0, pipelineInr: 0 };
    counts[d][s][m][field] += by;
  };

  if (salesforceConfigured) {
    await safely('Pipeline: leads', async () => {
      const rows = await pageAll(
        () =>
          salesforce
            .from('lead')
            .select('Id, LeadSource, Divisions__c, IsConverted, ConvertedDate, CreatedDate')
            .eq('IsDeleted', false)
            .gte('CreatedDate', rangeStartUtc)
            .lt('CreatedDate', rangeEndUtc),
        'Id'
      );
      for (const r of rows) {
        const d = divisionKeyFor(divisions, r.Divisions__c);
        const s = sourceKeyFor(sources, r.LeadSource);
        bump(d, s, istMonth(r.CreatedDate), 'leads');
      }
      // Conversions are counted in the month they happened, whatever month
      // the lead came in.
      const conv = await pageAll(
        () =>
          salesforce
            .from('lead')
            .select('Id, LeadSource, Divisions__c, ConvertedDate')
            .eq('IsDeleted', false)
            .eq('IsConverted', true)
            .gte('ConvertedDate', `${fyStart}-01`)
            .lte('ConvertedDate', monthEndDay),
        'Id'
      );
      for (const r of conv) {
        bump(divisionKeyFor(divisions, r.Divisions__c), sourceKeyFor(sources, r.LeadSource), String(r.ConvertedDate).slice(0, 7), 'converted');
      }
    });

    await safely('Pipeline: opportunities and quotes', async () => {
      const { data: rates, error: rateErr } = await salesforce.from('currencytype').select('IsoCode, ConversionRate');
      if (rateErr) throw new Error(rateErr.message);
      const rateOf = Object.fromEntries((rates || []).map((r) => [r.IsoCode, Number(r.ConversionRate) || 1]));
      const toInr = (amount, iso) => Number(amount || 0) / (rateOf[iso] || 1);

      const opps = await pageAll(
        () =>
          salesforce
            .from('opportunity')
            .select('Id, Division__c, LeadSource, CreatedDate')
            .eq('IsDeleted', false)
            .gte('CreatedDate', rangeStartUtc)
            .lt('CreatedDate', rangeEndUtc),
        'Id'
      );
      const oppKey = new Map(); // opp id -> [division, source, month]
      for (const o of opps) {
        const k = [divisionKeyFor(divisions, o.Division__c), sourceKeyFor(sources, o.LeadSource), istMonth(o.CreatedDate)];
        oppKey.set(o.Id, k);
        bump(k[0], k[1], k[2], 'opps');
      }

      // Quotes on those opportunities: every quote counts as a quote, the
      // open ones as pipeline, in the opportunity's month.
      for (const ids of chunk([...oppKey.keys()], 80)) {
        const { data, error } = await salesforce
          .from('quote')
          .select('Id, OpportunityId, Status, GrandTotal, CurrencyIsoCode')
          .eq('IsDeleted', false)
          .in('OpportunityId', ids);
        if (error) throw new Error(error.message);
        for (const q of data || []) {
          const k = oppKey.get(q.OpportunityId);
          if (!k) continue;
          bump(k[0], k[1], k[2], 'quotes');
          if (openStatuses.has(String(q.Status || '').toLowerCase())) bump(k[0], k[1], k[2], 'pipelineInr', toInr(q.GrandTotal, q.CurrencyIsoCode));
        }
      }
    });
  }

  // Spend: typed per month; "ads" from Google Ads when not typed.
  const typedSpend = inputs.spend || {};
  const adsSpend = {}; // division -> month -> lakh
  await safely('Pipeline: ad spend', async () => {
    const accounts = divisions.filter((d) => d.adsAccount).map((d) => d.adsAccount);
    if (!accounts.length) return;
    const rows = await pageAll(
      () =>
        supabase
          .from('google_ads_campaign_analysis')
          .select('id, report_date, cost, account_name')
          .in('account_name', accounts)
          .gte('report_date', `${fyStart}-01`)
          .lte('report_date', monthEndDay),
      'id'
    );
    for (const r of rows) {
      const d = divisions.find((x) => x.adsAccount === r.account_name);
      if (!d) continue;
      const m = String(r.report_date).slice(0, 7);
      adsSpend[d.key] = adsSpend[d.key] || {};
      adsSpend[d.key][m] = (adsSpend[d.key][m] || 0) + Number(r.cost || 0) / 1e5;
    }
  });
  const spendFor = (dKey, sKey, m) => {
    const typed = typedSpend?.[dKey]?.[sKey]?.[m];
    if (typed != null && typed !== '') return Number(typed);
    if (sKey === 'ads' && adsSpend[dKey]?.[m] != null) return round(adsSpend[dKey][m], 2);
    return null;
  };

  // Sum a source over a set of months.
  const cellFor = (dKey, sKey, months) => {
    const c = emptyCell();
    let spend = null;
    for (const m of months) {
      const x = counts[dKey]?.[sKey]?.[m];
      if (x) {
        c.leads += x.leads;
        c.converted += x.converted;
        c.opps += x.opps;
        c.quotes += x.quotes;
        c.pipelineCr += x.pipelineInr / 1e7;
      }
      const sp = spendFor(dKey, sKey, m);
      if (sp != null) spend = (spend || 0) + sp;
    }
    c.spendLakh = spend == null ? null : round(spend, 2);
    c.pipelineCr = round(c.pipelineCr, 2);
    // Open quote value raised per ₹1 lakh spent, in ₹ crore.
    c.efficiency = spend ? round(c.pipelineCr / spend, 2) : null;
    return c;
  };
  const addCells = (cells) => {
    const t = emptyCell();
    let spend = null;
    for (const c of cells) {
      t.leads += c.leads;
      t.converted += c.converted;
      t.opps += c.opps;
      t.quotes += c.quotes;
      t.pipelineCr += c.pipelineCr;
      if (c.spendLakh != null) spend = (spend || 0) + c.spendLakh;
    }
    t.spendLakh = spend == null ? null : round(spend, 2);
    t.pipelineCr = round(t.pipelineCr, 2);
    t.efficiency = spend ? round(t.pipelineCr / spend, 2) : null;
    return t;
  };

  const divisionModels = divisions.map((d) => {
    const srcRows = [...sources, OTHER].map((s) => ({
      key: s.key,
      label: s.label,
      marketing: s.key !== 'other',
      month: cellFor(d.key, s.key, [month]),
      ytd: cellFor(d.key, s.key, elapsed),
    }));
    const marketing = srcRows.filter((r) => r.marketing);
    return {
      key: d.key,
      label: d.label,
      sources: srcRows,
      marketingTotal: { month: addCells(marketing.map((r) => r.month)), ytd: addCells(marketing.map((r) => r.ytd)) },
      total: { month: addCells(srcRows.map((r) => r.month)), ytd: addCells(srcRows.map((r) => r.ytd)) },
      trend: {
        categories: fyMonths.map((m) => MONTHS[Number(m.slice(5)) - 1]),
        leads: fyMonths.map((m) => (m <= month ? sources.reduce((s, x) => s + (counts[d.key]?.[x.key]?.[m]?.leads || 0), 0) : null)),
        converted: fyMonths.map((m) => (m <= month ? sources.reduce((s, x) => s + (counts[d.key]?.[x.key]?.[m]?.converted || 0), 0) : null)),
      },
    };
  });

  return {
    divisions: divisionModels,
    sources: [...sources.map((s) => ({ key: s.key, label: s.label })), OTHER],
    overall: {
      marketing: {
        month: addCells(divisionModels.map((d) => d.marketingTotal.month)),
        ytd: addCells(divisionModels.map((d) => d.marketingTotal.ytd)),
      },
      total: {
        month: addCells(divisionModels.map((d) => d.total.month)),
        ytd: addCells(divisionModels.map((d) => d.total.ytd)),
      },
    },
    adsSpendMonths: adsSpend,
    definitions: {
      leads: 'Salesforce leads created in the period, by lead source and division',
      converted: 'Leads converted in the period',
      opps: 'Opportunities created in the period, by the opportunity\'s lead source',
      quotes: 'Quotes raised on those opportunities',
      pipeline: `Open quotes (${[...openStatuses].join(', ')}) on those opportunities, ₹ crore at Salesforce rates`,
      efficiency: 'Open quote value in ₹ crore per ₹1 lakh of spend',
    },
  };
};

// Targeted ABM accounts: typed list, open quote value looked up by account name.
const buildAbm = async (ctx) => {
  const { salesforce, salesforceConfigured, safely, inputs } = ctx;
  const S = inputs.settings;
  const openStatuses = new Set((S.openQuoteStatuses || ['In Review', 'Presented', 'Negotiation']).map((s) => String(s).toLowerCase()));
  const list = inputs.abm?.accounts || [];
  const rows = list.map((a) => ({
    account: a.account || '',
    division: a.division || '',
    owner: a.owner || '',
    status: a.status || '',
    quotationLakh: a.quotationLakh != null && a.quotationLakh !== '' ? Number(a.quotationLakh) : null,
    quotationSource: a.quotationLakh != null && a.quotationLakh !== '' ? 'typed' : 'none',
    openOpps: null,
    stage: '',
    action: a.action || '',
  }));
  if (salesforceConfigured && rows.length) {
    await safely('ABM accounts', async () => {
      const { data: rates } = await salesforce.from('currencytype').select('IsoCode, ConversionRate');
      const rateOf = Object.fromEntries((rates || []).map((r) => [r.IsoCode, Number(r.ConversionRate) || 1]));
      for (const r of rows) {
        if (!r.account) continue;
        const { data: accts, error } = await salesforce.from('account').select('Id, Name').ilike('Name', `%${r.account.replace(/[%_]/g, '')}%`).limit(20);
        if (error) throw new Error(error.message);
        const ids = (accts || []).map((a) => a.Id);
        if (!ids.length) continue;
        const { data: opps, error: oErr } = await salesforce
          .from('opportunity')
          .select('Id, StageName, IsClosed')
          .eq('IsDeleted', false)
          .in('AccountId', ids);
        if (oErr) throw new Error(oErr.message);
        const open = (opps || []).filter((o) => !o.IsClosed);
        r.openOpps = open.length;
        r.stage = [...new Set(open.map((o) => o.StageName))].join(', ');
        if (open.length) {
          const { data: quotes, error: qErr } = await salesforce
            .from('quote')
            .select('OpportunityId, Status, GrandTotal, CurrencyIsoCode')
            .eq('IsDeleted', false)
            .in('OpportunityId', open.map((o) => o.Id));
          if (qErr) throw new Error(qErr.message);
          const inr = (quotes || [])
            .filter((q) => openStatuses.has(String(q.Status || '').toLowerCase()))
            .reduce((s, q) => s + Number(q.GrandTotal || 0) / (rateOf[q.CurrencyIsoCode] || 1), 0);
          if (r.quotationSource === 'none' && inr > 0) {
            r.quotationLakh = round(inr / 1e5, 1);
            r.quotationSource = 'salesforce';
          }
        }
      }
    });
  }
  return {
    rows,
    totals: {
      accounts: rows.length,
      quoted: rows.filter((r) => r.quotationLakh).length,
      quotationLakh: round(rows.reduce((s, r) => s + (r.quotationLakh || 0), 0), 1),
    },
  };
};

// Customer engagement activities: tickets in the engagement categories, plan
// (due in the month) against actual (completed in the month).
const buildEngagement = async (ctx) => {
  const { supabase, pageAll, safely, inputs, month, fyStart, monthEndDay } = ctx;
  const S = inputs.settings;
  const cats = S.engagementCategories?.length ? S.engagementCategories : ['Customer Engagement'];
  return safely(
    'Engagement activities',
    async () => {
      const rows = await pageAll(
        () =>
          supabase
            .from('tickets')
            .select('id, title, status, category, division, due_date, completed_date, assigned_to_name')
            .in('category', cats)
            .eq('deleted', false),
        'id'
      );
      const done = (t) => /^(completed|closed)$/i.test(String(t.status || ''));
      const inMonth = (d) => d && String(d).slice(0, 7) === month;
      const shape = (t) => ({
        title: t.title,
        division: t.division || '',
        assignee: t.assigned_to_name || '',
        due: t.due_date || null,
        completed: t.completed_date || null,
        status: done(t) ? 'Completed' : /progress/i.test(t.status || '') ? 'In progress' : 'Planned',
        done: done(t),
      });
      const planned = rows.filter((t) => inMonth(t.due_date)).map(shape);
      const actual = rows.filter((t) => done(t) && inMonth(t.completed_date)).map(shape);
      const ytdDone = rows.filter((t) => done(t) && t.completed_date && t.completed_date >= `${fyStart}-01` && t.completed_date <= monthEndDay).length;
      const ytdPlanned = rows.filter((t) => t.due_date && t.due_date >= `${fyStart}-01` && t.due_date <= monthEndDay).length;
      const list = [...new Map([...planned, ...actual].map((r) => [r.title + r.due, r])).values()].sort((a, b) =>
        Number(b.done) - Number(a.done) || String(a.due || '9999').localeCompare(String(b.due || '9999'))
      );
      return { categories: cats, plan: planned.length, actual: actual.length, ytdPlan: ytdPlanned, ytdActual: ytdDone, rows: list };
    },
    { categories: cats, plan: 0, actual: 0, ytdPlan: 0, ytdActual: 0, rows: [] }
  );
};

// SEO: typed keyword ranks, review month against the month before.
const buildSeo = (ctx) => {
  const { inputs, month, addMonths } = ctx;
  const prev = addMonths(month, -1);
  const kws = inputs.seo?.keywords || [];
  const rows = kws
    .filter((k) => k.keyword)
    .map((k) => {
      const rank = k.ranks?.[month] != null && k.ranks[month] !== '' ? Number(k.ranks[month]) : null;
      const prevRank = k.ranks?.[prev] != null && k.ranks[prev] !== '' ? Number(k.ranks[prev]) : null;
      return {
        keyword: k.keyword,
        division: k.division || '',
        rank,
        prevRank,
        change: rank != null && prevRank != null ? prevRank - rank : null, // positive = moved up
      };
    });
  const ranked = rows.filter((r) => r.rank != null);
  return {
    targeted: rows.length,
    ranked: ranked.length,
    top10: ranked.filter((r) => r.rank <= 10).length,
    top3: ranked.filter((r) => r.rank <= 3).length,
    avgRank: ranked.length ? round(ranked.reduce((s, r) => s + r.rank, 0) / ranked.length, 1) : null,
    improved: rows.filter((r) => r.change > 0).length,
    declined: rows.filter((r) => r.change < 0).length,
    rows: rows.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999)),
    notes: inputs.seo?.notes || '',
    prevMonth: prev,
  };
};

module.exports = { buildFunnel, buildAbm, buildEngagement, buildSeo, sourceKeyFor, divisionKeyFor };
