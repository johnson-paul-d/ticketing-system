// =====================================================
// MRM: Sieger Brand Visibility Index
// =====================================================
// One number out of 100 for how visible the brand was in the month, and the
// figures behind it. The figures that no system here measures (website
// visitors, Google impressions, LinkedIn impressions, video views, branded
// searches, PR mentions) are typed in on the MRM page each month. Followers
// come from the LinkedIn sync; enquiries and opportunities from Salesforce
// (marketing sources, all divisions), unless a figure is typed over them.
//
// The index is a weighted average of component scores. A component's score is
// its figure against the level that counts as full marks ("target"), capped
// at 100:
//     score  = min(100, actual / target × 100)
//     index  = Σ (weight × score) / Σ weight          over scored components
// A component with no figure or no target for the month is left out of both
// sums rather than counted as zero, and the slide says how many were scored:
// an index quietly dragged down by a figure nobody entered would be read as a
// drop in visibility.
//
// The "up N from M" trend is only given when the previous month was scored on
// exactly the same components, from figures on the same basis. Enquiries are
// read from Salesforce for every month, so a previous month in which nothing
// was typed still has a one-component index; comparing seven components
// against one would print a trend that means nothing.
//
// Figures can also be entered per division (each division has its own
// website, Search Console property and video channel). Then:
//   - a division's index is worked out the same way from its own figures,
//     against its own full-marks levels where set, else the company ones.
//     Enquiries (from Salesforce per division) count for a division only when
//     a full-marks level has been set for that division: the company level is
//     for all divisions together and would mis-score every one of them;
//   - a division with no typed figure in the month gets no index, whatever
//     Salesforce knows about it: nobody is measuring it yet;
//   - the company figure for a typed metric is the typed company figure if
//     there is one, else the sum of the division figures entered for the
//     month, else what the portal computed. The slide says which it was. A
//     sum over a different set of divisions than last month is not compared
//     with it (no change percentage, no index trend).
//
//   inputs.brand = {
//     weights: { [metricKey]: percent },        // defaults below
//     targets: { [metricKey]: number },         // the level that scores 100
//     months:  { 'YYYY-MM': { [metricKey]: number } },
//     divisions: { 'YYYY-MM': { [divisionKey]: { [metricKey]: number } } },   // optional
//     divisionTargets: { [divisionKey]: { [metricKey]: number } },           // optional
//   }

const round = (v, dp = 0) => (v == null ? null : Math.round(v * 10 ** dp) / 10 ** dp);

// Every figure on the slide. `component` + `weight` mark the seven that make
// up the index; `auto` marks the ones the portal fills unless typed.
// Keep in step with BRAND_METRICS in frontend/src/components/mrm/BrandEditor.jsx.
const METRICS = [
  { key: 'websiteVisitors', label: 'Website visitors', group: 'digital', component: 'Website traffic', weight: 20 },
  { key: 'searchImpressions', label: 'Google search impressions', group: 'digital', component: 'Google visibility', weight: 25 },
  { key: 'organicTraffic', label: 'Organic traffic', group: 'digital' },
  { key: 'brandedSearches', label: 'Branded searches', group: 'digital', component: 'Branded searches', weight: 10 },
  { key: 'linkedinImpressions', label: 'LinkedIn impressions', group: 'social', component: 'LinkedIn reach', weight: 15 },
  { key: 'videoViews', label: 'Video views', group: 'social', component: 'Video reach', weight: 10 },
  { key: 'prMentions', label: 'PR / media mentions', group: 'social', component: 'PR / media visibility', weight: 10 },
  { key: 'linkedinFollowers', label: 'LinkedIn followers', group: 'social', auto: true },
  { key: 'enquiries', label: 'Marketing enquiries', group: 'business', component: 'Enquiries generated', weight: 10, auto: true },
  { key: 'opportunities', label: 'Qualified opportunities influenced', group: 'business', auto: true },
];
const METRIC = Object.fromEntries(METRICS.map((m) => [m.key, m]));
const GROUPS = [
  { key: 'digital', title: 'Digital Visibility' },
  { key: 'social', title: 'Social & Content' },
  { key: 'business', title: 'Business Impact' },
];
// Slide order of the index components (heaviest first, as the team lists them).
const COMPONENT_ORDER = ['searchImpressions', 'websiteVisitors', 'linkedinImpressions', 'videoViews', 'brandedSearches', 'prMentions', 'enquiries'];

const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const obj = (v) => (isObj(v) ? v : {});
const sameSet = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((k) => b.includes(k));

/**
 * @param ctx        { inputs, month, addMonths }
 * @param auto       { [ym]: { enquiries, opportunities, linkedinFollowers, followersGained,
 *                            byDivision: { [divisionKey]: { enquiries, opportunities } } } } — what the portal knows
 * @param divisions  [{ key, label }] — the divisions figures may be entered for (Definitions)
 */
const buildBrand = (ctx, auto = {}, divisions = []) => {
  const { inputs, month, addMonths } = ctx;
  const prevMonth = addMonths(month, -1);
  const brand = obj(inputs.brand);
  const weights = obj(brand.weights);
  const targets = obj(brand.targets);
  const byDiv = obj(brand.divisions);
  const divTargets = obj(brand.divisionTargets);
  const divisionList = (Array.isArray(divisions) ? divisions : []).filter((d) => d && d.key).map((d) => ({ key: String(d.key), label: d.label || String(d.key) }));
  const divisionKeys = divisionList.map((d) => d.key);

  // The figure a division entered for a metric in a month (typed only).
  const typedDivision = (dk, key, ym) => num(obj(obj(byDiv[ym])[dk])[key]);
  // Divisions with a typed figure for the metric in the month, in Definitions order.
  const divisionsWith = (key, ym) => divisionList.filter((d) => typedDivision(d.key, key, ym) !== null);
  // Whether anybody typed anything for the division in the month.
  const divisionTyped = (dk, ym) => METRICS.some((m) => typedDivision(dk, m.key, ym) !== null);

  // Company figure: typed total, else (for figures that are typed by hand)
  // the sum of the division figures, else auto.
  const valueOf = (key, ym) => {
    const typed = num(obj(brand.months)[ym]?.[key]);
    if (typed !== null) return { value: typed, source: 'typed' };
    if (!METRIC[key]?.auto) {
      const parts = divisionsWith(key, ym);
      if (parts.length) return { value: parts.reduce((s, d) => s + typedDivision(d.key, key, ym), 0), source: 'divisions', divisions: parts.map((d) => d.key) };
    }
    const a = num(auto[ym]?.[key]);
    if (a !== null) return { value: a, source: 'auto' };
    return { value: null, source: 'none' };
  };
  // A division's figure: typed for the division, else what the portal computed for it.
  const divisionValueOf = (dk, key, ym) => {
    const typed = typedDivision(dk, key, ym);
    if (typed !== null) return { value: typed, source: 'typed' };
    const a = num(obj(obj(auto[ym]?.byDivision)[dk])[key]);
    if (a !== null) return { value: a, source: 'auto' };
    return { value: null, source: 'none' };
  };
  // Full marks: the division's own level, else the company one — except for
  // figures the portal fills per division (enquiries), whose company level is
  // for all divisions together.
  const targetOf = (key, dk) => {
    if (dk) {
      const t = num(obj(divTargets[dk])[key]);
      if (t !== null) return t;
      if (METRIC[key]?.auto) return null;
    }
    return num(targets[key]);
  };
  // Two months' company figures are on the same basis when neither is a
  // division sum, or both sum the same divisions.
  const sameBasis = (cur, prev) =>
    (cur.source !== 'divisions' && prev.source !== 'divisions') || sameSet(cur.summedFrom ?? cur.divisions, prev.summedFrom ?? prev.divisions);

  const weightOf = (m) => {
    const w = num(weights[m.key]);
    return w !== null ? w : m.weight;
  };

  // The index for one month, for the company (dk undefined) or one division.
  const scoreFor = (ym, dk) => {
    const measured = !dk || divisionTyped(dk, ym);
    const components = COMPONENT_ORDER.map((key) => {
      const m = METRIC[key];
      const { value, source, divisions: parts } = dk ? divisionValueOf(dk, key, ym) : valueOf(key, ym);
      const target = targetOf(key, dk);
      const weight = weightOf(m);
      const score = measured && value !== null && target !== null && target > 0 ? Math.max(0, Math.min(100, (value / target) * 100)) : null;
      return { key, label: m.component, metricLabel: m.label, weight, value, source, summedFrom: parts, target, score: score === null ? null : round(score, 0), rawScore: score };
    });
    const scored = components.filter((c) => c.rawScore !== null && c.weight > 0);
    const weightSum = scored.reduce((s, c) => s + c.weight, 0);
    const index = weightSum > 0 ? round(scored.reduce((s, c) => s + c.weight * c.rawScore, 0) / weightSum, 0) : null;
    for (const c of components) {
      // Points this component adds to the index, on the scale of the scored weights.
      c.points = c.rawScore !== null && weightSum > 0 ? round((c.weight * c.rawScore) / weightSum, 1) : null;
      delete c.rawScore;
    }
    return { index, components, scored: scored.length, scoredKeys: scored.map((c) => c.key), total: components.filter((c) => c.weight > 0).length, measured };
  };

  // Like for like only: the same components scored in both months, from
  // figures on the same basis.
  const comparable = (now, before) =>
    now.index !== null &&
    before.index !== null &&
    sameSet(now.scoredKeys, before.scoredKeys) &&
    now.scoredKeys.every((k) => sameBasis(now.components.find((c) => c.key === k), before.components.find((c) => c.key === k)));

  const now = scoreFor(month);
  const before = scoreFor(prevMonth);

  const pct = (cur, prev) => (cur !== null && prev !== null && prev > 0 ? round(((cur - prev) / prev) * 100, 0) : null);
  const groups = GROUPS.map((g) => ({
    key: g.key,
    title: g.title,
    items: METRICS.filter((m) => m.group === g.key).map((m) => {
      const cur = valueOf(m.key, month);
      const prev = valueOf(m.key, prevMonth);
      return {
        key: m.key,
        label: m.label,
        value: cur.value,
        source: cur.source,
        summedFrom: cur.divisions,
        prev: prev.value,
        // No percentage when the two months sum different divisions.
        changePct: sameBasis(cur, prev) ? pct(cur.value, prev.value) : null,
        // Followers also show what was gained in the month.
        gained: m.key === 'linkedinFollowers' ? num(auto[month]?.followersGained) : null,
      };
    }),
  }));

  const missingOf = (scored) =>
    scored.components
      .filter((c) => c.score === null && c.weight > 0)
      .map((c) => ({ label: c.label, reason: !scored.measured ? 'no figures entered for the division' : c.value === null ? 'no figure for the month' : 'no full-marks level' }));

  // Per-division indexes, only once somebody has entered a division figure
  // for the month or the one before: a deck without them is unchanged.
  const anyDivisionFigure = [month, prevMonth].some((ym) => divisionKeys.some((dk) => divisionTyped(dk, ym)));
  const divisionModels = anyDivisionFigure
    ? divisionList.map((d) => {
        const dNow = scoreFor(month, d.key);
        const dBefore = scoreFor(prevMonth, d.key);
        const like = comparable(dNow, dBefore);
        const missing = missingOf(dNow);
        return {
          key: d.key,
          label: d.label,
          index: dNow.index,
          prevIndex: dBefore.index,
          comparable: like,
          change: like ? dNow.index - dBefore.index : null,
          scored: dNow.scored,
          totalComponents: dNow.total,
          // Why there is no index, when there is none: 'no figures' or 'no full-marks level'.
          reason: dNow.index !== null ? null : !dNow.measured || missing.every((m) => m.reason === 'no figure for the month') ? 'no figures' : 'no full-marks level',
          components: dNow.components.map((c) => ({ ...c, prevValue: divisionValueOf(d.key, c.key, prevMonth).value })),
          // Every figure on the slide for the division, this month and last.
          figures: METRICS.map((m) => {
            const cur = divisionValueOf(d.key, m.key, month);
            const prev = divisionValueOf(d.key, m.key, prevMonth);
            return { key: m.key, label: m.label, value: cur.value, source: cur.source, prev: prev.value, changePct: pct(cur.value, prev.value) };
          }),
          missing,
        };
      })
    : [];

  // Division keys with stored figures or levels that are not in Definitions
  // any more (renamed, or saved through the raw input): they count nowhere.
  const orphanDivisions = [...new Set([...Object.keys(obj(byDiv[month])), ...Object.keys(obj(byDiv[prevMonth])), ...Object.keys(divTargets)])].filter((k) => !divisionKeys.includes(k));

  const weightTotal = now.components.reduce((s, c) => s + (c.weight || 0), 0);
  const like = comparable(now, before);
  return {
    month,
    prevMonth,
    index: now.index,
    // The previous month's own index (on whatever it was scored on). Only
    // quote it as a trend when `comparable` is true.
    prevIndex: before.index,
    comparable: like,
    change: like ? now.index - before.index : null,
    scored: now.scored,
    totalComponents: now.total,
    prevScored: before.scored,
    components: now.components.map((c) => ({ ...c, prevValue: valueOf(c.key, prevMonth).value })),
    groups,
    // Company figures that are the sum of division figures, by metric key.
    summed: Object.fromEntries(METRICS.map((m) => [m.key, valueOf(m.key, month)]).filter(([, v]) => v.source === 'divisions').map(([k, v]) => [k, v.divisions])),
    divisions: divisionModels,
    orphanDivisions,
    weightTotal,
    missing: missingOf(now).map((m) => (m.reason === 'no full-marks level' ? { ...m, reason: 'no target set' } : m)),
    formula: 'Index = sum of weight × score over the scored components ÷ their total weight; score = actual ÷ target × 100, capped at 100.',
  };
};

module.exports = { buildBrand, BRAND_METRICS: METRICS };
