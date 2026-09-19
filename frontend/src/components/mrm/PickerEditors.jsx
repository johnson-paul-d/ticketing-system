import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import api from "../../services/api";
import { RowsEditor, Cell, STATUS_OPTIONS, field, label, th, MONTHS, fyMonths } from "./InputEditors";

// =====================================================
// MRM inputs: editors that pick from portal data
// =====================================================
// Exhibitions are chosen from projects, collaterals from tickets, and the
// LinkedIn figures are kept per company page. Same contract as
// InputEditors.jsx: value in, whole replacement value out via onChange.

// ---------------------------------------------------------------
// Exhibitions: tick the projects that are exhibitions
// ---------------------------------------------------------------
// Value: { projects: [{ projectId, name?, from?, to?, budgetLakh, spendLakh,
//          claimMatch, remarks, countLeads, statusOverride }], manual: [...] }.
// Older values may carry projectMatch instead of projectId; the server still
// resolves those, and this editor fills in the id on the first change.
const projectRowCols = [
  { key: "from", label: "From", type: "date", width: 125 },
  { key: "to", label: "To", type: "date", width: 125 },
  { key: "statusOverride", label: "Status (blank = from tasks)", width: 130, placeholder: "auto" },
  { key: "budgetLakh", label: "Budget (L)", type: "number", width: 85 },
  { key: "spendLakh", label: "Spend (L)", type: "number", width: 85 },
  { key: "claimMatch", label: "Claim match", type: "list", placeholder: "words in claim titles", width: 170 },
  { key: "countLeads", label: "Count leads", type: "checkbox", default: true, width: 60 },
  { key: "remarks", label: "Remarks", type: "textarea", width: 220 },
];

export function ExhibitionsEditor({ value, onChange }) {
  const v = Array.isArray(value) ? { projects: [], manual: value } : value || { projects: [], manual: [] };
  const [projects, setProjects] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    api.get("/reports/mrm/projects").then((r) => setProjects(r.data)).catch(() => setError("Could not load the project list"));
  }, []);

  const rows = v.projects || [];
  const rowFor = (p) => rows.find((r) => r.projectId === p.id || (r.projectMatch && p.name.toLowerCase().includes(String(r.projectMatch).toLowerCase())));
  const projectFor = (r) => (projects || []).find((p) => rowFor(p) === r);
  const toggle = (p) => {
    const existing = rowFor(p);
    if (existing) onChange({ ...v, projects: rows.filter((r) => r !== existing) });
    else onChange({ ...v, projects: [...rows, { projectId: p.id, from: p.target_date || "", to: p.target_date || "", claimMatch: [], countLeads: true, remarks: "" }] });
  };
  const setRow = (row, key, val) =>
    onChange({ ...v, projects: rows.map((r) => (r === row ? { ...r, [key]: val, projectId: r.projectId || projectFor(r)?.id } : r)) });

  const shown = (projects || []).filter((p) => !filter || p.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-gray-800">1. Which projects are exhibitions?</h3>
        <p className="text-xs text-gray-500 mb-2">Tick a project and it becomes a row on the exhibition tracker. Its status comes from the project&apos;s tasks, and turns to Done once the event date has passed.</p>
        <input type="text" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter projects…" className={`${field} max-w-sm mb-2`} />
        {error ? <div className="text-sm text-red-600">{error}</div> : null}
        {!projects && !error ? <div className="text-sm text-gray-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading projects…</div> : null}
        <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
          {shown.map((p) => (
            <label key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" checked={Boolean(rowFor(p))} onChange={() => toggle(p)} className="accent-[#9b2423] w-4 h-4" />
              <span className="flex-1 min-w-0 truncate">{p.name}</span>
              <span className="text-xs text-gray-500 whitespace-nowrap">{p.target_date || "no date"} · {p.done}/{p.total} tasks</span>
            </label>
          ))}
          {projects && !shown.length ? <div className="px-3 py-3 text-sm text-gray-400">No projects match.</div> : null}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-800">2. Details for the ticked projects</h3>
        <p className="text-xs text-gray-500 mb-2">Event dates decide which Salesforce leads count (source Trade Show, created between the dates plus a few days). Spend: blank uses approved expense claims whose title contains a “claim match” word; a figure overrides.</p>
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full min-w-[1000px]">
            <thead><tr><th className={th}>Project</th>{projectRowCols.map((c) => <th key={c.key} className={th} style={{ width: c.width }}>{c.label}</th>)}</tr></thead>
            <tbody>
              {rows.length === 0 ? <tr><td colSpan={projectRowCols.length + 1} className="px-3 py-4 text-sm text-gray-400 text-center">No projects ticked yet.</td></tr> : null}
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-gray-100 align-top">
                  <td className="px-2 py-2 text-sm font-medium text-gray-800 w-56">{projectFor(r)?.name || r.name || r.projectMatch || "(project not found)"}</td>
                  {projectRowCols.map((c) => <td key={c.key} className="px-1.5 py-1.5"><Cell col={c} value={r[c.key]} onChange={(val) => setRow(r, c.key, val)} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-800">3. Events without a project</h3>
        <p className="text-xs text-gray-500 mb-2">For events already held before they were planned as projects. New events should be projects instead.</p>
        <RowsEditor
          rows={v.manual} onChange={(manual) => onChange({ ...v, manual })} addLabel="Add an event without a project"
          columns={[
            { key: "name", label: "Exhibition", width: 200 },
            { key: "from", label: "From", type: "date", width: 125 },
            { key: "to", label: "To", type: "date", width: 125 },
            { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS, width: 100 },
            { key: "budgetLakh", label: "Budget (L)", type: "number", width: 85 },
            { key: "spendLakh", label: "Spend (L)", type: "number", width: 85 },
            { key: "claimMatch", label: "Claim match", type: "list", width: 170 },
            { key: "countLeads", label: "Count leads", type: "checkbox", default: true, width: 60 },
            { key: "remarks", label: "Remarks", type: "textarea", width: 200 },
          ]}
          blank={() => ({ name: "", from: "", to: "", status: "Planned", budgetLakh: null, spendLakh: null, claimMatch: [], countLeads: true, remarks: "" })}
        />
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-800">4. Strategic new exhibitions identified</h3>
        <p className="text-xs text-gray-500 mb-2">Shows on the Expo slide as the shortlist for next year. Once one is approved, plan it as a project and tick it above.</p>
        <RowsEditor
          rows={v.newExpos} onChange={(newExpos) => onChange({ ...v, newExpos })} addLabel="Add exhibition"
          columns={[
            { key: "name", label: "Exhibition", width: 200 },
            { key: "city", label: "City", width: 120 },
            { key: "month", label: "When", width: 110, placeholder: "e.g. Feb 2027" },
            { key: "rationale", label: "Why it matters", type: "textarea", width: 260 },
            { key: "status", label: "Status", type: "select", options: ["Identified", "Evaluating", "Approved", "Dropped"], width: 110 },
          ]}
          blank={() => ({ name: "", city: "", month: "", rationale: "", status: "Identified" })}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Collaterals: tick the tickets that belong on the slide
// ---------------------------------------------------------------
// Value: { tickets: { [ticketId]: { include, location, type, label } } }.
const COLLATERAL_TYPES = ["Video", "Video + Testimonial", "Testimonial", "Photos", "Drone video", "Animation", "Collateral"];

export function CollateralsEditor({ value, onChange, month }) {
  const v = value || { tickets: {} };
  const picked = v.tickets || {};
  const [candidates, setCandidates] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    setCandidates(null);
    api.get("/reports/mrm/collateral-candidates", { params: { month } }).then((r) => setCandidates(r.data)).catch(() => setError("Could not load the ticket list"));
  }, [month]);

  const setTicket = (id, patch) => onChange({ ...v, tickets: { ...picked, [id]: { ...(picked[id] || {}), ...patch } } });
  const shown = (candidates || []).filter((t) => !filter || t.title.toLowerCase().includes(filter.toLowerCase()));
  const included = (t) => picked[t.id]?.include === true;

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        Tickets in the collateral categories (Video, Animation, Collateral), completed this fiscal year or still open. Tick the ones to show. Completed in the review month go to the left table on the slide; open ones to the right, with the ticket&apos;s status.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <input type="text" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter tickets…" className={`${field} max-w-sm`} />
        <span className="text-xs text-gray-500">{Object.values(picked).filter((x) => x.include).length} ticked</span>
      </div>
      {error ? <div className="text-sm text-red-600">{error}</div> : null}
      {!candidates && !error ? <div className="text-sm text-gray-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading tickets…</div> : null}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full min-w-[900px]">
          <thead><tr><th className={`${th} w-10`}>Show</th><th className={th}>Ticket</th><th className={th}>Status</th><th className={th}>Date</th><th className={th} style={{ width: 160 }}>Location</th><th className={th} style={{ width: 170 }}>Type</th><th className={th} style={{ width: 200 }}>Name on slide</th></tr></thead>
          <tbody>
            {candidates && !shown.length ? <tr><td colSpan={7} className="px-3 py-4 text-sm text-gray-400 text-center">No tickets found in the collateral categories.</td></tr> : null}
            {shown.map((t) => (
              <tr key={t.id} className={`border-t border-gray-100 align-top ${included(t) ? "bg-[#9b2423]/5" : ""}`}>
                <td className="px-2 py-2"><input type="checkbox" checked={included(t)} onChange={(e) => setTicket(t.id, { include: e.target.checked })} className="accent-[#9b2423] w-4 h-4 mt-1" /></td>
                <td className="px-2 py-2 text-sm text-gray-800">{t.title}<div className="text-xs text-gray-400">{t.category}{t.assignee ? ` · ${t.assignee}` : ""}</div></td>
                <td className={`px-2 py-2 text-sm ${t.done ? "text-emerald-700" : "text-amber-700"}`}>{t.status}</td>
                <td className="px-2 py-2 text-sm text-gray-500 whitespace-nowrap">{t.done ? t.completed_date : t.due_date ? `due ${t.due_date}` : "—"}</td>
                <td className="px-1.5 py-1.5"><input type="text" disabled={!included(t)} value={picked[t.id]?.location ?? ""} onChange={(e) => setTicket(t.id, { location: e.target.value })} className={field} /></td>
                <td className="px-1.5 py-1.5">
                  <select disabled={!included(t)} value={picked[t.id]?.type ?? (COLLATERAL_TYPES.includes(t.category) ? t.category : "Video")} onChange={(e) => setTicket(t.id, { type: e.target.value })} className={field}>
                    {COLLATERAL_TYPES.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </td>
                <td className="px-1.5 py-1.5"><input type="text" disabled={!included(t)} value={picked[t.id]?.label ?? ""} onChange={(e) => setTicket(t.id, { label: e.target.value })} placeholder={t.title} className={field} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Presented figures, targets, definitions
// ---------------------------------------------------------------
const METRICS = [
  ["leads", "Leads"],
  ["convertedLeads", "Converted"],
  ["pipelineMn", "Pipeline (Mn)"],
  ["adSpendLakh", "Ad spend (L)"],
];

const orgsOf = (settings) => (settings?.linkedinOrgs || []).map((o) => (typeof o === "string" ? { org: o, label: o } : o));
const isFlat = (o) => Boolean(o) && Object.keys(o).some((k) => /^\d{4}-\d{2}$/.test(k) || k === "default");

export function HistoryEditor({ value, onChange, fyYear, settings }) {
  const v = value || {};
  const orgs = orgsOf(settings);
  const liFor = (org) => {
    const h = v.linkedinFollowersGained || {};
    if (isFlat(h)) return org === orgs[0]?.org ? h : {};
    return h[org] || {};
  };
  const set = (metric, ym, raw, org) => {
    const next = JSON.parse(JSON.stringify(v));
    let target;
    if (metric === "linkedinFollowersGained") {
      let h = next.linkedinFollowersGained || {};
      if (isFlat(h)) h = { [orgs[0]?.org]: h };
      h[org] = h[org] || {};
      next.linkedinFollowersGained = h;
      target = h[org];
    } else {
      next[metric] = next[metric] || {};
      target = next[metric];
    }
    if (raw === "" || raw === null) delete target[ym]; else target[ym] = Number(raw);
    onChange(next);
  };
  const years = [Number(fyYear) - 1, Number(fyYear)];
  const rowsFor = () => [
    ...METRICS.map(([metric, name]) => ({ metric, name, get: (ym) => v[metric]?.[ym], org: null })),
    ...orgs.map((o) => ({ metric: "linkedinFollowersGained", name: `Followers – ${o.label}`, get: (ym) => liFor(o.org)[ym], org: o.org })),
  ];
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        Figures already presented to management. A filled cell is shown exactly as it is here; an empty cell is read live. The “Lock month” button at the top fills the review month for you, so this grid rarely needs typing.
      </p>
      {years.map((y) => (
        <div key={y} className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full min-w-[820px]">
            <thead><tr><th className={th}>FY{String(y).slice(2)}-{String(y + 1).slice(2)}</th>{fyMonths(y).map((ym, i) => <th key={ym} className={`${th} text-right`}>{MONTHS[i]}</th>)}</tr></thead>
            <tbody>
              {rowsFor().map((r) => (
                <tr key={r.name} className="border-t border-gray-100">
                  <td className="px-2 py-1 text-sm text-gray-700 whitespace-nowrap">{r.name}</td>
                  {fyMonths(y).map((ym) => (
                    <td key={ym} className="px-1 py-1">
                      <input type="number" step="any" value={r.get(ym) ?? ""} onChange={(e) => set(r.metric, ym, e.target.value, r.org)} className={`${field} text-right px-1.5 py-1 text-xs`} />
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

export function TargetsEditor({ value, onChange, fyYear, settings }) {
  const v = value || {};
  const y = String(fyYear);
  const t = v[y] || {};
  const orgs = orgsOf(settings);
  const setDefault = (metric, raw) => onChange({ ...v, [y]: { ...t, [metric]: { ...(t[metric] || {}), default: raw === "" ? null : Number(raw) } } });
  const liSpec = (org) => {
    const s = t.linkedinFollowers || {};
    if (isFlat(s)) return org === orgs[0]?.org ? s : {};
    return s[org] || {};
  };
  const setLi = (org, raw) => {
    let s = t.linkedinFollowers || {};
    if (isFlat(s)) s = { [orgs[0]?.org]: s };
    onChange({ ...v, [y]: { ...t, linkedinFollowers: { ...s, [org]: { ...(s[org] || {}), default: raw === "" ? null : Number(raw) } } } });
  };
  const setMonth = (ym, raw) => {
    const m = { ...(t.convertedLeads || {}) };
    if (raw === "") delete m[ym]; else m[ym] = Number(raw);
    onChange({ ...v, [y]: { ...t, convertedLeads: m } });
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">Targets for FY{y.slice(2)}-{String(Number(y) + 1).slice(2)}. A monthly target uses the “every month” figure unless a specific month is filled in.</p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-3xl">
        {[["convertedLeads", "Converted leads (SQLs) / month"], ["pipelineMn", "Pipeline (₹ Mn) / month"], ["adSpendLakh", "Ad spend (₹ lakh) / month"]].map(([k, l]) => (
          <div key={k}>
            <label className={label}>{l}</label>
            <input type="number" step="any" value={t[k]?.default ?? ""} onChange={(e) => setDefault(k, e.target.value)} className={field} />
          </div>
        ))}
        {orgs.map((o) => (
          <div key={o.org}>
            <label className={label}>LinkedIn followers gained / month – {o.label}</label>
            <input type="number" value={liSpec(o.org).default ?? ""} onChange={(e) => setLi(o.org, e.target.value)} className={field} />
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
    <div className="space-y-5 max-w-4xl">
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
        {text("siteBrandingProjectMatch", "Site branding: project name contains")}
        {list("collateralCategories", "Ticket categories counted as collaterals")}
        {list("engagementCategories", "Engagement activities: ticket categories that always count")}
        {list("engagementKeywords", "Engagement activities: words in a ticket title that count", "Whole words, any case: association names, AGM, seminar, partner.")}
        {list("engagementExcludeCategories", "Engagement activities: categories never counted", "Exhibition and collateral work is reported on its own slides. Tickets inside an exhibition project are never counted either.")}
        {list("engagementExcludeKeywords", "Engagement activities: words in a title that rule a ticket out", "Production and admin tasks: payment, invoice, brochure, banner…")}
        {list("openQuoteStatuses", "Quote statuses that count as pipeline", "As spelled in Salesforce.")}
        {list("abmExcludeStatuses", "ABM accounts in these statuses are left off the list", "As spelled in the ABM module, e.g. Lost.")}
        {list("exportStages", "Export slide: opportunity stages shown")}
      </div>
      <p className="text-xs text-gray-500">
        The divisions (Salesforce names, ticket division, Google Ads account) and the marketing sources (which Salesforce lead sources fall in each) are lists of
        records; edit them under Advanced if a source is renamed in Salesforce.
      </p>
      <div>
        <label className={label}>LinkedIn pages on the slide</label>
        <p className="text-xs text-gray-500 mb-2">“Page in sync” must match the organisation name recorded by the LinkedIn sync; “Label” is what the slide shows.</p>
        <RowsEditor
          rows={orgsOf(v)} onChange={(linkedinOrgs) => set("linkedinOrgs", linkedinOrgs)} addLabel="Add page"
          columns={[{ key: "org", label: "Page in sync", width: 240 }, { key: "label", label: "Label on slide", width: 240 }]}
          blank={() => ({ org: "", label: "" })}
        />
      </div>
    </div>
  );
}
