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
// exactly the same components. Enquiries are read from Salesforce for every
// month, so a previous month in which nothing was typed still has a
// one-component index; comparing seven components against one would print a
// trend that means nothing.
//
//   inputs.brand = {
//     weights: { [metricKey]: percent },        // defaults below
//     targets: { [metricKey]: number },         // the level that scores 100
//     months:  { 'YYYY-MM': { [metricKey]: number } },
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
const GROUPS = [
  { key: 'digital', title: 'Digital Visibility' },
  { key: 'social', title: 'Social & Content' },
  { key: 'business', title: 'Business Impact' },
];
// Slide order of the index components (heaviest first, as the team lists them).
const COMPONENT_ORDER = ['searchImpressions', 'websiteVisitors', 'linkedinImpressions', 'videoViews', 'brandedSearches', 'prMentions', 'enquiries'];

const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

/**
 * @param ctx   { inputs, month, addMonths }
 * @param auto  { [ym]: { enquiries, opportunities, linkedinFollowers, followersGained } } — what the portal knows
 */
const buildBrand = (ctx, auto = {}) => {
  const { inputs, month, addMonths } = ctx;
  const prevMonth = addMonths(month, -1);
  const brand = inputs.brand || {};
  const weights = brand.weights || {};
  const targets = brand.targets || {};

  // A typed figure wins over what the portal computed.
  const valueOf = (key, ym) => {
    const typed = num(brand.months?.[ym]?.[key]);
    if (typed !== null) return { value: typed, source: 'typed' };
    const a = num(auto[ym]?.[key]);
    if (a !== null) return { value: a, source: 'auto' };
    return { value: null, source: 'none' };
  };

  const weightOf = (m) => {
    const w = num(weights[m.key]);
    return w !== null ? w : m.weight;
  };

  const scoreFor = (ym) => {
    const components = COMPONENT_ORDER.map((key) => {
      const m = METRICS.find((x) => x.key === key);
      const { value, source } = valueOf(key, ym);
      const target = num(targets[key]);
      const weight = weightOf(m);
      const score = value !== null && target !== null && target > 0 ? Math.max(0, Math.min(100, (value / target) * 100)) : null;
      return { key, label: m.component, metricLabel: m.label, weight, value, source, target, score: score === null ? null : round(score, 0) , rawScore: score };
    });
    const scored = components.filter((c) => c.rawScore !== null && c.weight > 0);
    const weightSum = scored.reduce((s, c) => s + c.weight, 0);
    const index = weightSum > 0 ? round(scored.reduce((s, c) => s + c.weight * c.rawScore, 0) / weightSum, 0) : null;
    for (const c of components) {
      // Points this component adds to the index, on the scale of the scored weights.
      c.points = c.rawScore !== null && weightSum > 0 ? round((c.weight * c.rawScore) / weightSum, 1) : null;
      delete c.rawScore;
    }
    return { index, components, scored: scored.length, scoredKeys: scored.map((c) => c.key), total: components.filter((c) => c.weight > 0).length };
  };

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
        prev: prev.value,
        changePct: pct(cur.value, prev.value),
        // Followers also show what was gained in the month.
        gained: m.key === 'linkedinFollowers' ? num(auto[month]?.followersGained) : null,
      };
    }),
  }));

  const weightTotal = now.components.reduce((s, c) => s + (c.weight || 0), 0);
  // Like for like only: the same components scored in both months.
  const comparable =
    now.index !== null &&
    before.index !== null &&
    now.scoredKeys.length === before.scoredKeys.length &&
    now.scoredKeys.every((k) => before.scoredKeys.includes(k));
  return {
    month,
    prevMonth,
    index: now.index,
    // The previous month's own index (on whatever it was scored on). Only
    // quote it as a trend when `comparable` is true.
    prevIndex: before.index,
    comparable,
    change: comparable ? now.index - before.index : null,
    scored: now.scored,
    totalComponents: now.total,
    prevScored: before.scored,
    components: now.components.map((c) => ({ ...c, prevValue: valueOf(c.key, prevMonth).value })),
    groups,
    weightTotal,
    missing: now.components
      .filter((c) => c.score === null && c.weight > 0)
      .map((c) => ({ label: c.label, reason: c.value === null ? 'no figure for the month' : 'no target set' })),
    formula: 'Index = sum of weight × score over the scored components ÷ their total weight; score = actual ÷ target × 100, capped at 100.',
  };
};

module.exports = { buildBrand, BRAND_METRICS: METRICS };
