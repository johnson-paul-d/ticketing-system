import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import api from "../../services/api";
import { RowsEditor, field, label, th, MONTHS, fyMonths } from "./InputEditors";

// =====================================================
// MRM inputs: spend, ABM accounts, SEO keywords
// =====================================================
// The typed parts of the pipeline, ABM and brand-visibility sections. Same
// contract as the other editors: value in, whole replacement value out.

const DIVISIONS_FALLBACK = [{ key: "CPS", label: "Sieger Parking (CPS)" }, { key: "ASTOR", label: "ASTOR" }, { key: "TMD", label: "Textile Machinery (TMD)" }];
const SOURCES_FALLBACK = [
  { key: "website", label: "Website" }, { key: "ads", label: "Ads" }, { key: "database", label: "Database / AI / Campaigns" },
  { key: "scouter", label: "Scouter" }, { key: "expo", label: "Expo" },
];

const divisionsOf = (settings) => (Array.isArray(settings?.divisions) && settings.divisions.length ? settings.divisions : DIVISIONS_FALLBACK);
const sourcesOf = (settings) => (Array.isArray(settings?.sources) && settings.sources.length ? settings.sources : SOURCES_FALLBACK);

// ---------------------------------------------------------------
// Spend: ₹ lakh per division, per source, per month
// ---------------------------------------------------------------
// Value: { [divisionKey]: { [sourceKey]: { 'YYYY-MM': lakh } } }.
export function SpendEditor({ value, onChange, fyYear, settings }) {
  const v = value || {};
  const divisions = divisionsOf(settings);
  const sources = sourcesOf(settings);
  const months = fyMonths(fyYear);
  const set = (d, s, m, x) => onChange({ ...v, [d]: { ...(v[d] || {}), [s]: { ...(v[d]?.[s] || {}), [m]: x } } });
  const adsAccountOf = (d) => divisions.find((x) => x.key === d)?.adsAccount;

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-600">
        Marketing spend in ₹ lakh, per division and source, for FY{fyYear}-{String(Number(fyYear) + 1).slice(2)}. Leave a cell blank when there was no spend.
        <strong> Ads</strong> is read from Google Ads for divisions that have an account; a typed figure overrides it for that month.
      </p>
      {divisions.map((d) => (
        <div key={d.key}>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">{d.label}</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className={th}>Source</th>
                  {months.map((m, i) => <th key={m} className={`${th} text-right`}>{MONTHS[i]}</th>)}
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.key} className="border-t border-gray-100">
                    <td className="px-2 py-1 text-sm text-gray-800 whitespace-nowrap">
                      {s.label}
                      {s.key === "ads" && adsAccountOf(d.key) ? <span className="block text-[10px] text-gray-400">blank = Google Ads “{adsAccountOf(d.key)}”</span> : null}
                    </td>
                    {months.map((m) => (
                      <td key={m} className="px-1 py-1">
                        <input
                          type="number" step="any" value={v[d.key]?.[s.key]?.[m] ?? ""}
                          onChange={(e) => set(d.key, s.key, m, e.target.value === "" ? null : Number(e.target.value))}
                          className={`${field} text-right w-20`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------
// ABM: tick the accounts from the ABM module that go on the slide
// ---------------------------------------------------------------
// Value: { picked: { [accountId]: { include, action, quotationLakh } }, accounts: [typed rows] }.
const ABM_STATUS = ["Identified", "Contacted", "Meeting done", "Site visit", "Quotation", "Negotiation", "Won", "Lost", "On hold"];

export function AbmEditor({ value, onChange, settings }) {
  const v = value || { picked: {}, accounts: [] };
  const picked = v.picked || {};
  const divisions = divisionsOf(settings);
  const [candidates, setCandidates] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    api.get("/reports/mrm/abm-accounts").then((r) => setCandidates(r.data)).catch(() => setError("Could not load the ABM accounts"));
  }, []);

  const setAccount = (id, patch) => onChange({ ...v, picked: { ...picked, [id]: { ...(picked[id] || {}), ...patch } } });
  const included = (a) => picked[a.id]?.include === true;
  const shown = (candidates || []).filter((a) => !filter || `${a.name} ${a.division} ${a.owner} ${a.status}`.toLowerCase().includes(filter.toLowerCase()));
  const tickedCount = (candidates || []).filter(included).length;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-gray-800">1. Accounts from the ABM module</h3>
        <p className="text-xs text-gray-500 mb-2">
          Tick the accounts to show. Status, owner, opportunities and last activity come from the ABM module; the quotation from its opportunities, else from
          open quotes in Salesforce. Type an action or quotation only to override what the module says.
        </p>
        <div className="flex items-center gap-3 mb-2">
          <input type="text" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by name, division, owner, status" className={`${field} max-w-xs`} />
          <span className="text-xs text-gray-500">{candidates ? `${tickedCount} ticked of ${candidates.length}` : ""}</span>
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {!candidates && !error ? <p className="text-sm text-gray-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading the ABM accounts…</p> : null}
        {candidates ? (
          <div className="overflow-x-auto border border-gray-100 rounded-xl">
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className={th}>Show</th><th className={th}>Account</th><th className={th}>Division</th><th className={th}>Tier</th><th className={th}>Status</th>
                  <th className={th}>Owner</th><th className={th}>Opps</th><th className={th}>Last activity</th><th className={th}>Action required (blank = module)</th><th className={th}>Quotation (₹ L, blank = auto)</th>
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 ? <tr><td colSpan={10} className="px-3 py-4 text-sm text-gray-400 text-center">No accounts in the ABM module yet.</td></tr> : null}
                {shown.map((a) => {
                  const p = picked[a.id] || {};
                  const on = included(a);
                  return (
                    <tr key={a.id} className={`border-t border-gray-100 align-top ${on ? "bg-[#9b2423]/[0.03]" : ""}`}>
                      <td className="px-2 py-2"><input type="checkbox" checked={on} onChange={(e) => setAccount(a.id, { include: e.target.checked })} className="accent-[#9b2423] w-4 h-4" /></td>
                      <td className="px-2 py-2 text-sm font-medium text-gray-800 whitespace-nowrap">{a.name}<span className="block text-[11px] text-gray-400 font-normal">{a.country || ""}</span></td>
                      <td className="px-2 py-2 text-xs text-gray-600 whitespace-nowrap">{a.division || "—"}</td>
                      <td className="px-2 py-2 text-xs text-gray-600 whitespace-nowrap">{a.tier || "—"}</td>
                      <td className="px-2 py-2 text-xs text-gray-600 whitespace-nowrap">{a.status || "—"}</td>
                      <td className="px-2 py-2 text-xs text-gray-600 whitespace-nowrap">{a.owner || "—"}</td>
                      <td className="px-2 py-2 text-xs text-gray-600 whitespace-nowrap">{a.oppCount ? `${a.oppCount} · ${a.oppStages}${a.oppValueLakh ? ` · ${a.oppValueLakh} L` : ""}` : "—"}</td>
                      <td className="px-2 py-2 text-xs text-gray-600 whitespace-nowrap">{a.lastActivity ? `${a.lastActivity.type || a.lastActivity.channel} – ${String(a.lastActivity.date).slice(0, 10)}` : "—"}</td>
                      <td className="px-1.5 py-1.5 w-64"><input type="text" disabled={!on} value={p.action ?? ""} placeholder={a.nextAction || ""} onChange={(e) => setAccount(a.id, { action: e.target.value })} className={field} /></td>
                      <td className="px-1.5 py-1.5 w-28"><input type="number" step="any" disabled={!on} value={p.quotationLakh ?? ""} placeholder={a.oppValueLakh ?? ""} onChange={(e) => setAccount(a.id, { quotationLakh: e.target.value === "" ? null : Number(e.target.value) })} className={`${field} text-right`} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-800">2. Accounts not in the ABM module</h3>
        <p className="text-xs text-gray-500 mb-2">For a one-off mention. Anything the team is actually working should be added to the ABM module instead.</p>
        <RowsEditor
          rows={v.accounts} onChange={(accounts) => onChange({ ...v, accounts })} addLabel="Add account"
          columns={[
            { key: "account", label: "Account (as in Salesforce)", width: 200 },
            { key: "division", label: "Division", type: "select", options: ["", ...divisions.map((d) => d.key)], width: 100 },
            { key: "country", label: "Country", width: 110 },
            { key: "owner", label: "Owner", width: 130 },
            { key: "status", label: "Status", type: "select", options: ABM_STATUS, width: 130 },
            { key: "quotationLakh", label: "Quotation (₹ L, blank = Salesforce)", type: "number", width: 120 },
            { key: "action", label: "Action required", type: "textarea", width: 240 },
          ]}
          blank={() => ({ account: "", division: "", country: "", owner: "", status: "Identified", quotationLakh: null, action: "" })}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// SEO: targeted keywords and their rank, month by month
// ---------------------------------------------------------------
// Value: { keywords: [{ keyword, division, ranks: { 'YYYY-MM': n } }], notes }.
const prevMonthOf = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  const t = y * 12 + (m - 1) - 1;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};
const monthLabel = (ym) => new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-US", { month: "short", year: "2-digit" });

export function SeoEditor({ value, onChange, month, settings }) {
  const v = value || { keywords: [], notes: "" };
  const kws = Array.isArray(v.keywords) ? v.keywords : [];
  const prev = prevMonthOf(month);
  const divisions = divisionsOf(settings);
  const setRow = (i, patch) => onChange({ ...v, keywords: kws.map((k, j) => (j === i ? { ...k, ...patch } : k)) });
  const setRank = (i, ym, x) => setRow(i, { ranks: { ...(kws[i].ranks || {}), [ym]: x } });
  const remove = (i) => onChange({ ...v, keywords: kws.filter((_, j) => j !== i) });
  const add = () => onChange({ ...v, keywords: [...kws, { keyword: "", division: "", ranks: {} }] });

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        The keywords being targeted and where the site ranks on Google for each. Enter the rank for the review month; last month’s rank is shown beside it so the
        change can be read off. Ranks for other months are kept and can be seen by changing the review month above.
      </p>
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr>
              <th className={th}>Keyword</th>
              <th className={th}>Division</th>
              <th className={`${th} text-right`}>Rank – {monthLabel(month)}</th>
              <th className={`${th} text-right`}>Rank – {monthLabel(prev)}</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {kws.length === 0 ? <tr><td colSpan={5} className="px-3 py-4 text-sm text-gray-400 text-center">No keywords yet.</td></tr> : null}
            {kws.map((k, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="px-1.5 py-1.5 w-72"><input type="text" value={k.keyword ?? ""} onChange={(e) => setRow(i, { keyword: e.target.value })} className={field} /></td>
                <td className="px-1.5 py-1.5 w-32">
                  <select value={k.division ?? ""} onChange={(e) => setRow(i, { division: e.target.value })} className={field}>
                    <option value="">—</option>
                    {divisions.map((d) => <option key={d.key} value={d.key}>{d.key}</option>)}
                  </select>
                </td>
                <td className="px-1.5 py-1.5 w-32"><input type="number" min="1" value={k.ranks?.[month] ?? ""} onChange={(e) => setRank(i, month, e.target.value === "" ? null : Number(e.target.value))} className={`${field} text-right`} /></td>
                <td className="px-1.5 py-1.5 w-32"><input type="number" min="1" value={k.ranks?.[prev] ?? ""} onChange={(e) => setRank(i, prev, e.target.value === "" ? null : Number(e.target.value))} className={`${field} text-right`} /></td>
                <td className="px-1.5 py-1.5"><button type="button" onClick={() => remove(i)} className="text-xs text-gray-400 hover:text-red-600">Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={add} className="text-sm font-medium text-[#9b2423] hover:underline">+ Add keyword</button>
      <div>
        <label className={label}>Note on the slide (optional)</label>
        <input type="text" value={v.notes ?? ""} onChange={(e) => onChange({ ...v, notes: e.target.value })} className={field} placeholder="e.g. Ranks checked on 5 Sep from Chennai, incognito" />
      </div>
    </div>
  );
}
