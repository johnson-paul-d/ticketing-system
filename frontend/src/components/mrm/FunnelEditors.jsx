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
// ABM: the targeted accounts
// ---------------------------------------------------------------
// Value: { accounts: [{ account, division, owner, status, quotationLakh, action }] }.
const ABM_STATUS = ["Identified", "Contacted", "Meeting done", "Site visit", "Quotation", "Negotiation", "Won", "Lost", "On hold"];

export function AbmEditor({ value, onChange, settings }) {
  const v = value || { accounts: [] };
  const divisions = divisionsOf(settings);
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        The accounts marketing is working on. Open opportunities, stage and the quotation value are read from Salesforce by account name (the name only has to be
        contained in the Salesforce account name); a typed quotation wins over the Salesforce figure.
      </p>
      <RowsEditor
        rows={v.accounts} onChange={(accounts) => onChange({ ...v, accounts })} addLabel="Add account"
        columns={[
          { key: "account", label: "Account (as in Salesforce)", width: 220 },
          { key: "division", label: "Division", type: "select", options: ["", ...divisions.map((d) => d.key)], width: 100 },
          { key: "owner", label: "Owner", width: 140 },
          { key: "status", label: "Status", type: "select", options: ABM_STATUS, width: 130 },
          { key: "quotationLakh", label: "Quotation (₹ L, blank = Salesforce)", type: "number", width: 120 },
          { key: "action", label: "Action required", type: "textarea", width: 260 },
        ]}
        blank={() => ({ account: "", division: "", owner: "", status: "Identified", quotationLakh: null, action: "" })}
      />
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
