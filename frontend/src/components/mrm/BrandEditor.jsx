import { useState } from "react";
import { field, label, th } from "./InputEditors";

// =====================================================
// MRM inputs: Sieger Brand Visibility Index
// =====================================================
// The month's visibility figures, the level of each that counts as full marks,
// and the weights. Same contract as the other editors: value in, whole
// replacement value out.
//   value = {
//     weights: { [key]: percent }, targets: { [key]: n }, months: { 'YYYY-MM': { [key]: n } },
//     divisions: { 'YYYY-MM': { [divisionKey]: { [key]: n } } },   // the same figures per division (optional)
//     divisionTargets: { [divisionKey]: { [key]: n } },            // full marks per division (optional)
//   }

// Keep in step with METRICS in backend/services/mrmBrand.js.
const BRAND_METRICS = [
  { key: "searchImpressions", label: "Google search impressions", component: "Google visibility", weight: 25, from: "Google Search Console → Performance → Total impressions" },
  { key: "websiteVisitors", label: "Website visitors", component: "Website traffic", weight: 20, from: "Google Analytics → Users" },
  { key: "linkedinImpressions", label: "LinkedIn impressions", component: "LinkedIn reach", weight: 15, from: "LinkedIn page analytics → Impressions (all pages)" },
  { key: "videoViews", label: "Video views", component: "Video reach", weight: 10, from: "YouTube + LinkedIn video views" },
  { key: "brandedSearches", label: "Branded searches", component: "Branded searches", weight: 10, from: "Search Console → queries containing “Sieger”" },
  { key: "prMentions", label: "PR / media mentions", component: "PR / media visibility", weight: 10, from: "Articles, features and press mentions in the month" },
  { key: "enquiries", label: "Marketing enquiries", component: "Enquiries generated", weight: 10, auto: "Salesforce: leads from marketing sources, all divisions" },
  { key: "organicTraffic", label: "Organic traffic", from: "Google Analytics → Organic search sessions" },
  { key: "opportunities", label: "Qualified opportunities influenced", auto: "Salesforce: opportunities from marketing sources" },
  { key: "linkedinFollowers", label: "LinkedIn followers", auto: "LinkedIn sync: total across the pages on the LinkedIn slide" },
  { key: "searchClicks", label: "Google search clicks", from: "Google Search Console → Performance → Total clicks" },
  { key: "linkedinEngagements", label: "LinkedIn engagements", from: "LinkedIn page analytics → reactions + comments + reposts + clicks" },
  // Rates: worked out from two figures, scored against a benchmark rate as full marks. Weight 0 until set.
  { key: "searchCtr", label: "Google search CTR (%)", component: "Search click-through", weight: 0, derived: "clicks ÷ impressions × 100", ratio: ["searchClicks", "searchImpressions"] },
  { key: "organicShare", label: "Organic share of visits (%)", component: "Organic share", weight: 0, derived: "organic traffic ÷ website visitors × 100", ratio: ["organicTraffic", "websiteVisitors"] },
  { key: "linkedinEngagementRate", label: "LinkedIn engagement rate (%)", component: "LinkedIn engagement", weight: 0, derived: "engagements ÷ LinkedIn impressions × 100", ratio: ["linkedinEngagements", "linkedinImpressions"] },
];
// Rows of the by-division grid: everything typed by hand, plus enquiries,
// which the portal fills per division from Salesforce but which needs a
// full-marks level per division before it counts in the division's index.
// Followers are one LinkedIn sync for the company; opportunities are shown,
// not scored.
const DIVISION_METRICS = BRAND_METRICS.filter((m) => !m.auto || m.component);

const prevMonthOf = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  const t = y * 12 + (m - 1) - 1;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};
const monthLabel = (ym) => new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const toNum = (s) => (s === "" ? null : Number(s));
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const obj = (v) => (isObj(v) ? v : {});

export function BrandEditor({ value, onChange, month, settings }) {
  const v = value || {};
  const months = obj(v.months);
  const targets = obj(v.targets);
  const weights = obj(v.weights);
  const byDiv = obj(v.divisions);
  const divTargets = obj(v.divisionTargets);
  const prev = prevMonthOf(month);
  const divisions = (Array.isArray(settings?.divisions) ? settings.divisions : []).filter((d) => d && d.key).map((d) => ({ key: String(d.key), label: d.label || String(d.key) }));

  const hasDivisionFigures = [month, prev].some((ym) => divisions.some((d) => DIVISION_METRICS.some((m) => obj(obj(byDiv[ym])[d.key])[m.key] != null)));
  // Open by itself when the month already has division figures (the stored
  // value arrives after the first render, so this is derived, not initial state).
  const [showPref, setShowPref] = useState(null);
  const showDivisions = showPref ?? hasDivisionFigures;
  const setShowDivisions = setShowPref;

  const setMonth = (ym, key, x) => onChange({ ...v, months: { ...months, [ym]: { ...obj(months[ym]), [key]: x } } });
  const setTarget = (key, x) => onChange({ ...v, targets: { ...targets, [key]: x } });
  const setWeight = (key, x) => onChange({ ...v, weights: { ...weights, [key]: x } });
  const setDivision = (ym, dk, key, x) => onChange({ ...v, divisions: { ...byDiv, [ym]: { ...obj(byDiv[ym]), [dk]: { ...obj(obj(byDiv[ym])[dk]), [key]: x } } } });
  const setDivisionTarget = (dk, key, x) => onChange({ ...v, divisionTargets: { ...divTargets, [dk]: { ...obj(divTargets[dk]), [key]: x } } });

  const weightOf = (m) => (weights[m.key] ?? m.weight);
  const weightTotal = BRAND_METRICS.filter((m) => m.component).reduce((s, m) => s + (Number(weightOf(m)) || 0), 0);

  // The sum of the division figures entered for a metric in a month, shown in
  // the company box when nothing is typed there (that is what the index uses).
  const divisionSum = (ym, key) => {
    const parts = divisions.map((d) => obj(obj(byDiv[ym])[d.key])[key]).filter((x) => x != null && x !== "");
    return parts.length ? parts.reduce((s, x) => s + Number(x), 0) : null;
  };

  // The company figure the index uses: typed, else the sum of the division figures.
  const effective = (ym, key) => {
    const typed = months[ym]?.[key];
    if (typed != null && typed !== "") return Number(typed);
    return divisionSum(ym, key);
  };
  const fmt = (v) => Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  const cell = (ym, m) => {
    if (m.derived) {
      const a = effective(ym, m.ratio[0]), b = effective(ym, m.ratio[1]);
      const rate = a != null && b ? (a / b) * 100 : null;
      return (
        <div className="text-right px-2 py-1" title={`Worked out: ${m.derived}`}>
          <div className={rate == null ? "text-gray-300" : "font-semibold text-gray-800"}>{rate == null ? "—" : `${fmt(rate)}%`}</div>
          <div className="text-[10px] text-gray-400">{rate == null ? "needs both figures" : "worked out"}</div>
        </div>
      );
    }
    const typed = months[ym]?.[m.key];
    const sum = m.auto ? null : divisionSum(ym, m.key);
    // Division figures entered and no company figure typed: show the sum as the figure in use.
    if (sum != null && (typed == null || typed === "")) {
      return (
        <div className="text-right">
          <div className="px-2 py-1 font-semibold text-gray-800">{fmt(sum)}</div>
          <div className="text-[10px] text-gray-400 px-2">sum of sites</div>
          <input
            type="number" step="any" min="0" value="" placeholder="override"
            title="Type a company figure only to use something other than the sum of the sites."
            onChange={(e) => setMonth(ym, m.key, toNum(e.target.value))}
            className={`${field} text-right mt-1 text-xs`}
          />
        </div>
      );
    }
    return (
      <input
        type="number" step="any" min="0" value={typed ?? ""}
        placeholder={m.auto ? "auto" : ""}
        onChange={(e) => setMonth(ym, m.key, toNum(e.target.value))}
        className={`${field} text-right`}
      />
    );
  };
  const divCell = (ym, d, m) =>
    m.derived ? (
      <input type="text" value="" placeholder="worked out" disabled title={`Worked out: ${m.derived}`} className={`${field} text-right bg-gray-50 text-gray-400`} />
    ) : m.auto ? (
      <input type="text" value="" placeholder="auto" disabled title={`${m.label} come from Salesforce for ${d.label}; set the full-marks level on the right.`} className={`${field} text-right bg-gray-50 text-gray-400`} />
    ) : (
      <input
        type="number" step="any" min="0" value={obj(obj(byDiv[ym])[d.key])[m.key] ?? ""}
        onChange={(e) => setDivision(ym, d.key, m.key, toNum(e.target.value))}
        className={`${field} text-right`}
      />
    );

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Enter {monthLabel(month)}’s figures. Each of the seven index components is scored as its figure against the level that counts as full marks
        (capped at 100), then weighted. A component with no figure or no full-marks level is left out of the index for that month, and the slide says so.
        The “up from last month” trend appears only when last month was scored on the same components, so fill in last month’s column too the first time.
        A blank weight uses the default shown in grey.
        Rows marked <em>auto</em> are filled by the portal; type a figure only to override it.
      </p>
      <div className="overflow-x-auto border border-gray-100 rounded-xl">
        <table className="min-w-full">
          <thead>
            <tr>
              <th className={th}>Figure</th>
              <th className={`${th} text-right`}>{monthLabel(month)}</th>
              <th className={`${th} text-right`}>{monthLabel(prev)}</th>
              <th className={`${th} text-right`}>Full marks at</th>
              <th className={`${th} text-right`}>Weight %</th>
              <th className={th}>Index component · where the figure comes from</th>
            </tr>
          </thead>
          <tbody>
            {BRAND_METRICS.map((m) => (
              <tr key={m.key} className={`border-t border-gray-100 align-top ${m.component ? "" : "bg-gray-50/60"}`}>
                <td className="px-2 py-2 text-sm font-medium text-gray-800 whitespace-nowrap">{m.label}</td>
                <td className="px-1.5 py-1.5 w-36">{cell(month, m)}</td>
                <td className="px-1.5 py-1.5 w-36">{cell(prev, m)}</td>
                <td className="px-1.5 py-1.5 w-36">
                  {m.component ? (
                    <input type="number" step="any" min="0" value={targets[m.key] ?? ""} onChange={(e) => setTarget(m.key, toNum(e.target.value))} className={`${field} text-right`} />
                  ) : <span className="block text-center text-gray-300">—</span>}
                </td>
                <td className="px-1.5 py-1.5 w-24">
                  {m.component ? (
                    // Bound to the stored value, with the default as a placeholder: binding to
                    // "stored or default" refilled the box the moment it was emptied, so a
                    // retyped weight was appended to the default (25 → 2530).
                    <input type="number" step="any" min="0" max="100" value={weights[m.key] ?? ""} placeholder={String(m.weight)} onChange={(e) => setWeight(m.key, toNum(e.target.value))} className={`${field} text-right`} />
                  ) : <span className="block text-center text-gray-300">—</span>}
                </td>
                <td className="px-2 py-2 text-xs text-gray-500">
                  {m.component ? <span className="font-semibold text-gray-700">{m.component}. </span> : <span className="text-gray-400">Shown on the slide, not in the index. </span>}
                  {m.derived ? <span><em>Worked out</em> — {m.derived}; full marks = the benchmark rate.</span> : m.auto ? <span><em>Auto</em> — {m.auto}.</span> : m.from}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={`text-xs ${weightTotal === 100 ? "text-gray-500" : "text-amber-700 font-semibold"}`}>
        Weights add up to {weightTotal}%.{weightTotal === 100 ? "" : " They are used in proportion, so the index still works, but 100% keeps the slide readable."}
      </p>

      {divisions.length ? (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
            <input type="checkbox" checked={showDivisions} onChange={(e) => setShowDivisions(e.target.checked)} />
            Enter the figures by division ({divisions.map((d) => d.label).join(", ")})
          </label>
          {showDivisions ? (
            <>
              <p className="text-xs text-gray-500">
                Each division has its own website, Search Console property and video channel, so the same figures can be entered per division.
                The slide then shows an index per division for every division with a figure in the month, scored against the full-marks levels below where set, else the company ones above.
                When a company box above is left blank, the company figure is the sum of the division figures entered here; a month summed over different divisions than the one before is not compared with it.
                Enquiries come from Salesforce per division and count in a division’s index only once its own full-marks level is set here (the company level is for all divisions together). Followers and opportunities are not entered per division.
              </p>
              <div className="overflow-x-auto border border-gray-100 rounded-xl">
                <table className="min-w-full">
                  <thead>
                    <tr>
                      <th className={th} rowSpan={2}>Figure</th>
                      <th className={`${th} text-center border-l border-gray-100`} colSpan={divisions.length}>{monthLabel(month)}</th>
                      <th className={`${th} text-center border-l border-gray-100`} colSpan={divisions.length}>{monthLabel(prev)}</th>
                      <th className={`${th} text-center border-l border-gray-100`} colSpan={divisions.length}>Full marks at (optional)</th>
                    </tr>
                    <tr>
                      {[month, prev, "targets"].flatMap((ym) => divisions.map((d, i) => (
                        <th key={`${ym}-${d.key}`} className={`${th} text-right ${i === 0 ? "border-l border-gray-100" : ""}`}>{d.label}</th>
                      )))}
                    </tr>
                  </thead>
                  <tbody>
                    {DIVISION_METRICS.map((m) => (
                      <tr key={m.key} className={`border-t border-gray-100 align-top ${m.component ? "" : "bg-gray-50/60"}`}>
                        <td className="px-2 py-2 text-sm font-medium text-gray-800 whitespace-nowrap">{m.label}</td>
                        {divisions.map((d, i) => <td key={`m-${d.key}`} className={`px-1.5 py-1.5 w-28 ${i === 0 ? "border-l border-gray-100" : ""}`}>{divCell(month, d, m)}</td>)}
                        {divisions.map((d, i) => <td key={`p-${d.key}`} className={`px-1.5 py-1.5 w-28 ${i === 0 ? "border-l border-gray-100" : ""}`}>{divCell(prev, d, m)}</td>)}
                        {divisions.map((d, i) => (
                          <td key={`t-${d.key}`} className={`px-1.5 py-1.5 w-28 ${i === 0 ? "border-l border-gray-100" : ""}`}>
                            {m.component ? (
                              <input type="number" step="any" min="0" value={obj(divTargets[d.key])[m.key] ?? ""} placeholder={targets[m.key] != null ? String(targets[m.key]) : ""} onChange={(e) => setDivisionTarget(d.key, m.key, toNum(e.target.value))} className={`${field} text-right`} />
                            ) : <span className="block text-center text-gray-300">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-500">Other months’ division figures are kept as they are; switch the review month at the top of the page to enter them.</p>
            </>
          ) : null}
        </div>
      ) : null}

      <div>
        <span className={label}>How the index is worked out</span>
        <p className="text-xs text-gray-500">
          Score = figure ÷ full-marks level × 100, capped at 100. Index = the weighted average of the scores. Example: 48,000 Google impressions against a
          full-marks level of 60,000 scores 80; at 25% weight that adds 20 points.
        </p>
      </div>
    </div>
  );
}
