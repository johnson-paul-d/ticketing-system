import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";

// =====================================================
// MRM inputs: form editors
// =====================================================
// One editor per input key. Each takes the current value and calls onChange
// with a complete replacement value; the page owns saving. Nobody should
// have to read or write JSON to keep the deck current.

const field =
  "w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white outline-none focus:ring-2 focus:ring-[#9b2423]/30 disabled:bg-gray-50";
const label = "block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1";
const th = "px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 bg-gray-50 whitespace-nowrap";
const smallBtn =
  "inline-flex items-center justify-center w-7 h-7 rounded-md border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-800 disabled:opacity-30";

const MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
const fyMonths = (fyYear) => MONTHS.map((_, i) => {
  const m = ((3 + i) % 12) + 1;
  const y = m >= 4 ? Number(fyYear) : Number(fyYear) + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
});

// ---------------------------------------------------------------
// Generic table editor
// ---------------------------------------------------------------
function Cell({ col, value, onChange }) {
  if (col.type === "checkbox") {
    return (
      // An unset checkbox shows the column's default (e.g. "count leads" is on
      // unless switched off), so the box matches what the deck will do.
      <input type="checkbox" checked={value == null ? Boolean(col.default) : Boolean(value)} onChange={(e) => onChange(e.target.checked)} className="accent-[#9b2423] w-4 h-4 mt-1" />
    );
  }
  if (col.type === "select") {
    return (
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={field}>
        {col.options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (col.type === "textarea") {
    return <textarea value={value ?? ""} rows={2} onChange={(e) => onChange(e.target.value)} className={`${field} resize-y`} />;
  }
  if (col.type === "number") {
    return (
      <input
        type="number" step={col.step || "any"} value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className={`${field} text-right`}
      />
    );
  }
  if (col.type === "list") {
    // Comma-separated in the box, an array in the data.
    return (
      <input
        type="text" value={Array.isArray(value) ? value.join(", ") : value ?? ""}
        onChange={(e) => onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
        placeholder={col.placeholder} className={field}
      />
    );
  }
  return (
    <input type={col.type === "date" ? "date" : "text"} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={col.placeholder} className={field} />
  );
}

export function RowsEditor({ rows, columns, onChange, addLabel = "Add row", blank }) {
  const list = Array.isArray(rows) ? rows : [];
  const set = (i, key, v) => onChange(list.map((r, j) => (j === i ? { ...r, [key]: v } : r)));
  const remove = (i) => onChange(list.filter((_, j) => j !== i));
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const next = list.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr>
              {columns.map((c) => <th key={c.key} className={th} style={c.width ? { width: c.width } : undefined}>{c.label}</th>)}
              <th className={`${th} w-24`} />
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={columns.length + 1} className="px-3 py-4 text-sm text-gray-400 text-center">Nothing yet. Add a row below.</td></tr>
            ) : null}
            {list.map((row, i) => (
              <tr key={i} className="border-t border-gray-100 align-top">
                {columns.map((c) => (
                  <td key={c.key} className="px-1.5 py-1.5">
                    <Cell col={c} value={row[c.key]} onChange={(v) => set(i, c.key, v)} />
                  </td>
                ))}
                <td className="px-1.5 py-1.5">
                  <div className="flex gap-1">
                    <button type="button" title="Move up" className={smallBtn} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={13} /></button>
                    <button type="button" title="Move down" className={smallBtn} disabled={i === list.length - 1} onClick={() => move(i, 1)}><ArrowDown size={13} /></button>
                    <button type="button" title="Remove" className={`${smallBtn} hover:text-red-600`} onClick={() => remove(i)}><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={() => onChange([...list, blank ? blank() : Object.fromEntries(columns.map((c) => [c.key, c.type === "checkbox" ? false : c.type === "list" ? [] : ""]))])}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
      >
        <Plus size={14} /> {addLabel}
      </button>
    </div>
  );
}

function LinesEditor({ title, hint, value, onChange }) {
  return (
    <div>
      <label className={label}>{title}</label>
      {hint ? <p className="text-xs text-gray-500 mb-1">{hint}</p> : null}
      <textarea
        rows={6} value={(value || []).join("\n")}
        onChange={(e) => onChange(e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))}
        className={`${field} resize-y`} placeholder="One point per line"
      />
    </div>
  );
}

// ---------------------------------------------------------------
// The editors, by input key
// ---------------------------------------------------------------
const STATUS_OPTIONS = ["Done", "5%", "10%", "20%", "30%", "40%", "50%", "60%", "70%", "80%", "90%", "Planned", "Cancelled"];

export function ExhibitionsEditor({ value, onChange }) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-600">
        One row per event for the fiscal year. Leads are counted from Salesforce (source Trade Show) between the dates, plus a few days for late entry.
        Spend: leave blank to use approved expense claims whose title contains any of the words in “Claim match”; type a figure to override.
      </p>
      <RowsEditor
        rows={value} onChange={onChange} addLabel="Add exhibition"
        columns={[
          { key: "name", label: "Exhibition", width: 220 },
          { key: "from", label: "From", type: "date", width: 130 },
          { key: "to", label: "To", type: "date", width: 130 },
          { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS, width: 100 },
          { key: "budgetLakh", label: "Budget (L)", type: "number", width: 90 },
          { key: "spendLakh", label: "Spend (L)", type: "number", width: 90 },
          { key: "claimMatch", label: "Claim match", type: "list", placeholder: "Medicall Chennai, Medicall", width: 200 },
          { key: "countLeads", label: "Count leads", type: "checkbox", default: true, width: 60 },
          { key: "remarks", label: "Remarks", type: "textarea", width: 240 },
        ]}
        blank={() => ({ name: "", from: "", to: "", status: "Planned", budgetLakh: null, spendLakh: null, claimMatch: [], countLeads: true, remarks: "" })}
      />
    </div>
  );
}

export function InaugurationsEditor({ value, onChange }) {
  const v = value || { target: 0, items: [] };
  return (
    <div className="space-y-4">
      <div className="max-w-xs">
        <label className={label}>Target for the year</label>
        <input type="number" value={v.target ?? ""} onChange={(e) => onChange({ ...v, target: Number(e.target.value) || 0 })} className={field} />
      </div>
      <RowsEditor
        rows={v.items} onChange={(items) => onChange({ ...v, items })} addLabel="Add inauguration"
        columns={[
          { key: "event", label: "Event", width: 260 },
          { key: "status", label: "Status", width: 110, placeholder: "Done / 60%" },
          { key: "progress", label: "Progress %", type: "number", width: 100 },
          { key: "nextAction", label: "Next action", type: "textarea" },
        ]}
        blank={() => ({ event: "", status: "", progress: 0, nextAction: "" })}
      />
      <p className="text-xs text-gray-500">“Completed” on the slide counts rows at 100%.</p>
    </div>
  );
}

const collateralCols = [
  { key: "project", label: "Project", width: 220 },
  { key: "location", label: "Location", width: 150 },
  { key: "month", label: "Month", width: 90, placeholder: "Sep" },
  { key: "type", label: "Type", type: "select", options: ["Video", "Video + Testimonial", "Testimonial", "Photos", "Drone video", "Animation"], width: 170 },
  { key: "status", label: "Status", type: "select", options: ["Completed", "In progress", "Awaiting approval", "Planned"], width: 160 },
];
const blankCollateral = () => ({ project: "", location: "", month: "", type: "Video", status: "Planned" });

export function CollateralsEditor({ value, onChange }) {
  const v = value || { completed: [], planned: [] };
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-gray-800 mb-2">Completed this month (left table on the slide)</h3>
        <RowsEditor rows={v.completed} onChange={(completed) => onChange({ ...v, completed })} columns={collateralCols} blank={blankCollateral} addLabel="Add completed item" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-gray-800 mb-2">Planned / in progress (right table)</h3>
        <RowsEditor rows={v.planned} onChange={(planned) => onChange({ ...v, planned })} columns={collateralCols} blank={blankCollateral} addLabel="Add planned item" />
      </div>
    </div>
  );
}

export function AgentsEditor({ value, onChange }) {
  const v = value || { title: "Agents", items: [] };
  return (
    <div className="space-y-4">
      <div className="max-w-sm">
        <label className={label}>Slide title</label>
        <input type="text" value={v.title ?? ""} onChange={(e) => onChange({ ...v, title: e.target.value })} className={field} />
      </div>
      <RowsEditor
        rows={v.items} onChange={(items) => onChange({ ...v, items })} addLabel="Add agent"
        columns={[
          { key: "month", label: "Month", width: 90 },
          { key: "name", label: "Agent name", width: 200 },
          { key: "location", label: "Location", width: 140 },
          { key: "potential", label: "Potential", width: 160 },
          { key: "status", label: "Status", type: "textarea" },
          { key: "nextAction", label: "Next action", width: 160 },
        ]}
        blank={() => ({ month: "", name: "", location: "", potential: "", status: "", nextAction: "" })}
      />
    </div>
  );
}

export function ExportEditor({ value, onChange }) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-600">
        The slide lists open Sieger Parking opportunities in a foreign currency from Salesforce. Salesforce rarely holds the country, product or car
        spaces, so fill them here. “Match” is the start of the opportunity name in Salesforce. “Add” shows a row that Salesforce does not have; “Hide” drops one it does.
      </p>
      <RowsEditor
        rows={value} onChange={onChange} addLabel="Add fill-in"
        columns={[
          { key: "match", label: "Match (name starts with)", width: 200 },
          { key: "displayName", label: "Show as", width: 200 },
          { key: "country", label: "Country", width: 120 },
          { key: "product", label: "Product", width: 110 },
          { key: "carSpaces", label: "Car spaces", type: "number", width: 90 },
          { key: "amountUsdMn", label: "USD Mn (if blank in SF)", type: "number", width: 110 },
          { key: "stage", label: "Stage (added rows)", width: 110 },
          { key: "closeDate", label: "Close (added rows)", type: "date", width: 130 },
          { key: "add", label: "Add", type: "checkbox", width: 50 },
          { key: "hide", label: "Hide", type: "checkbox", width: 50 },
        ]}
        blank={() => ({ match: "", displayName: "", country: "", product: "", carSpaces: null, amountUsdMn: null, stage: "", closeDate: "", add: false, hide: false })}
      />
    </div>
  );
}

export function LinkedinEditor({ value, onChange }) {
  const v = value || { doneThisMonth: [], nextMonthPlan: [] };
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <LinesEditor title="Done this month" hint="The grey box on the LinkedIn slide." value={v.doneThisMonth} onChange={(doneThisMonth) => onChange({ ...v, doneThisMonth })} />
      <LinesEditor title="Next month plan" hint="The green box." value={v.nextMonthPlan} onChange={(nextMonthPlan) => onChange({ ...v, nextMonthPlan })} />
    </div>
  );
}

const ABP_COLS = [
  ["fyTarget", "FY target"],
  ["ytdTarget", "YTD target"],
  ["ytdAchieved", "YTD achieved"],
  ["monthTarget", "Month target"],
  ["monthAchieved", "Month achieved"],
];
const TOKENS = ["sqlMonth", "sqlYtd", "sqlTargetMonth", "sqlTargetYtd", "pipelineCrYtd", "wonCrYtd", "followersMonth", "followersYtd", "monthName", "fyMonths"];

export function AbpEditor({ value, onChange }) {
  const rows = value?.rows || [];
  const set = (i, key, v) => onChange({ ...value, rows: rows.map((r, j) => (j === i ? { ...r, [key]: v } : r)) });
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        The wording of the ABP slide, one row per area. Figures the portal computes can be dropped in with a tag, which is replaced when the deck is built:
        {" "}{TOKENS.map((t) => <code key={t} className="text-[11px] bg-gray-100 rounded px-1 mr-1">{`{{${t}}}`}</code>)}
      </p>
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full min-w-[900px]">
          <thead><tr><th className={th}>Area</th>{ABP_COLS.map(([k, l]) => <th key={k} className={th}>{l}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-gray-100 align-top">
                <td className="px-1.5 py-1.5 w-40"><textarea rows={3} value={r.area ?? ""} onChange={(e) => set(i, "area", e.target.value)} className={`${field} font-semibold`} /></td>
                {ABP_COLS.map(([k]) => (
                  <td key={k} className="px-1.5 py-1.5"><textarea rows={3} value={r[k] ?? ""} onChange={(e) => set(i, k, e.target.value)} className={field} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={() => onChange({ ...value, rows: [...rows, { area: "", fyTarget: "", ytdTarget: "", ytdAchieved: "", monthTarget: "", monthAchieved: "" }] })} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-sm text-gray-600 hover:bg-gray-50"><Plus size={14} /> Add area</button>
      {rows.length ? <button type="button" onClick={() => onChange({ ...value, rows: rows.slice(0, -1) })} className="ml-2 text-sm text-gray-500 hover:text-red-600">Remove last area</button> : null}
    </div>
  );
}

const METRICS = [
  ["leads", "Leads"],
  ["convertedLeads", "Converted"],
  ["pipelineMn", "Pipeline (Mn)"],
  ["adSpendLakh", "Ad spend (L)"],
  ["linkedinFollowersGained", "Followers gained"],
];

export function HistoryEditor({ value, onChange, fyYear }) {
  const v = value || {};
  const set = (metric, ym, raw) => {
    const next = { ...v, [metric]: { ...(v[metric] || {}) } };
    if (raw === "" || raw === null) delete next[metric][ym];
    else next[metric][ym] = Number(raw);
    onChange(next);
  };
  const years = [Number(fyYear) - 1, Number(fyYear)];
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        Figures already presented to management. A filled cell is shown exactly as it is here; an empty cell is read live. The “Lock month” button at the top fills the review month’s cells for you, so this grid rarely needs typing.
      </p>
      {years.map((y) => (
        <div key={y} className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full min-w-[820px]">
            <thead>
              <tr><th className={th}>FY{String(y).slice(2)}-{String(y + 1).slice(2)}</th>{fyMonths(y).map((ym, i) => <th key={ym} className={`${th} text-right`}>{MONTHS[i]}</th>)}</tr>
            </thead>
            <tbody>
              {METRICS.map(([metric, name]) => (
                <tr key={metric} className="border-t border-gray-100">
                  <td className="px-2 py-1 text-sm text-gray-700 whitespace-nowrap">{name}</td>
                  {fyMonths(y).map((ym) => (
                    <td key={ym} className="px-1 py-1">
                      <input type="number" step="any" value={v[metric]?.[ym] ?? ""} onChange={(e) => set(metric, ym, e.target.value)} className={`${field} text-right px-1.5 py-1 text-xs`} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

export function TargetsEditor({ value, onChange, fyYear }) {
  const v = value || {};
  const y = String(fyYear);
  const t = v[y] || {};
  const setDefault = (metric, raw) => onChange({ ...v, [y]: { ...t, [metric]: { ...(t[metric] || {}), default: raw === "" ? null : Number(raw) } } });
  const setMonth = (ym, raw) => {
    const m = { ...(t.convertedLeads || {}) };
    if (raw === "") delete m[ym]; else m[ym] = Number(raw);
    onChange({ ...v, [y]: { ...t, convertedLeads: m } });
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">Targets for FY{y.slice(2)}-{String(Number(y) + 1).slice(2)}. A monthly target uses the “every month” figure unless a specific month is filled in.</p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 max-w-3xl">
        {[["convertedLeads", "Converted leads (SQLs) / month"], ["pipelineMn", "Pipeline (₹ Mn) / month"], ["adSpendLakh", "Ad spend (₹ lakh) / month"], ["linkedinFollowers", "LinkedIn followers gained / month"]].map(([k, l]) => (
          <div key={k}>
            <label className={label}>{l}</label>
            <input type="number" step="any" value={t[k]?.default ?? ""} onChange={(e) => setDefault(k, e.target.value)} className={field} />
          </div>
        ))}
      </div>
      <div>
        <label className={label}>Converted leads target by month (optional overrides)</label>
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full min-w-[820px]">
            <thead><tr>{fyMonths(y).map((ym, i) => <th key={ym} className={`${th} text-right`}>{MONTHS[i]}</th>)}</tr></thead>
            <tbody><tr>{fyMonths(y).map((ym) => (
              <td key={ym} className="px-1 py-1"><input type="number" value={t.convertedLeads?.[ym] ?? ""} onChange={(e) => setMonth(ym, e.target.value)} className={`${field} text-right px-1.5 py-1 text-xs`} /></td>
            ))}</tr></tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function SettingsEditor({ value, onChange }) {
  const v = value || {};
  const set = (k, x) => onChange({ ...v, [k]: x });
  const text = (k, l, hint) => (
    <div key={k}>
      <label className={label}>{l}</label>
      <input type="text" value={v[k] ?? ""} onChange={(e) => set(k, e.target.value)} className={field} />
      {hint ? <p className="text-xs text-gray-500 mt-1">{hint}</p> : null}
    </div>
  );
  const list = (k, l, hint) => (
    <div key={k}>
      <label className={label}>{l}</label>
      <input type="text" value={(v[k] || []).join(", ")} onChange={(e) => set(k, e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} className={field} />
      {hint ? <p className="text-xs text-gray-500 mt-1">{hint}</p> : null}
    </div>
  );
  return (
    <div className="space-y-4 max-w-3xl">
      <p className="text-sm text-gray-600">How the computed figures are defined. Change these only if the business definition changes.</p>
      <div className="grid md:grid-cols-2 gap-4">
        {text("division", "Salesforce division", "Leads, opportunities and exhibition leads are filtered to this division.")}
        {list("leadSources", "Lead sources counted as inbound", "Exactly as spelled in Salesforce, comma separated.")}
        {list("tradeshowSources", "Lead sources counted as exhibition leads")}
        <div>
          <label className={label}>Days after an event to still count leads</label>
          <input type="number" value={v.exhibitionLeadWindowDays ?? ""} onChange={(e) => set("exhibitionLeadWindowDays", Number(e.target.value) || 0)} className={field} />
        </div>
        {text("googleAdsAccount", "Google Ads account for the ad-spend chart")}
        {text("linkedinOrg", "LinkedIn page for the followers slide")}
        {text("siteBrandingProjectMatch", "Site branding: project name contains")}
        {list("exportStages", "Export slide: opportunity stages shown")}
      </div>
    </div>
  );
}
