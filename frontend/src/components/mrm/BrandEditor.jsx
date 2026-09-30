import { field, label, th } from "./InputEditors";

// =====================================================
// MRM inputs: Sieger Brand Visibility Index
// =====================================================
// The month's visibility figures, the level of each that counts as full marks,
// and the weights. Same contract as the other editors: value in, whole
// replacement value out.
//   value = { weights: { [key]: percent }, targets: { [key]: n }, months: { 'YYYY-MM': { [key]: n } } }

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
];

const prevMonthOf = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  const t = y * 12 + (m - 1) - 1;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};
const monthLabel = (ym) => new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const toNum = (s) => (s === "" ? null : Number(s));

export function BrandEditor({ value, onChange, month }) {
  const v = value || {};
  const months = v.months || {};
  const targets = v.targets || {};
  const weights = v.weights || {};
  const prev = prevMonthOf(month);

  const setMonth = (ym, key, x) => onChange({ ...v, months: { ...months, [ym]: { ...(months[ym] || {}), [key]: x } } });
  const setTarget = (key, x) => onChange({ ...v, targets: { ...targets, [key]: x } });
  const setWeight = (key, x) => onChange({ ...v, weights: { ...weights, [key]: x } });

  const weightOf = (m) => (weights[m.key] ?? m.weight);
  const weightTotal = BRAND_METRICS.filter((m) => m.component).reduce((s, m) => s + (Number(weightOf(m)) || 0), 0);

  const cell = (ym, m) => (
    <input
      type="number" step="any" min="0" value={months[ym]?.[m.key] ?? ""}
      placeholder={m.auto ? "auto" : ""}
      onChange={(e) => setMonth(ym, m.key, toNum(e.target.value))}
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
                  {m.auto ? <span><em>Auto</em> — {m.auto}.</span> : m.from}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={`text-xs ${weightTotal === 100 ? "text-gray-500" : "text-amber-700 font-semibold"}`}>
        Weights add up to {weightTotal}%.{weightTotal === 100 ? "" : " They are used in proportion, so the index still works, but 100% keeps the slide readable."}
      </p>
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
