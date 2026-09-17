import { useCallback, useEffect, useMemo, useState } from "react";
import MainLayout from "../layouts/MainLayout";
import api from "../services/api";
import { FileDown, Loader2, AlertCircle, RefreshCw, Save, RotateCcw, Presentation, Database } from "lucide-react";

// =====================================================
// MRM REPORT
// =====================================================
// The monthly Management Review Meeting deck, built by the server from
// Salesforce, Google Ads, LinkedIn and the portal's own projects and expenses.
// This page shows the figures behind each slide so they can be checked before
// the deck is downloaded, and edits the inputs the server cannot compute:
// targets, wording, the hand-kept trackers, and figures already presented.

const pad = (n) => String(n).padStart(2, "0");
const lastMonth = () => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

const INPUT_LABELS = {
  settings: "Definitions (division, lead sources, accounts)",
  targets: "Monthly targets per fiscal year",
  history: "Figures already presented (locked months)",
  abp: "ABP targets slide wording",
  exhibitions: "Exhibitions (dates, status, spend, remarks)",
  linkedin: "LinkedIn slide wording",
  inaugurations: "Project inauguration plan",
  collaterals: "Collaterals and videos",
  agents: "Agents",
  exportOpportunities: "Export opportunities (fill-ins)",
};

const card = "bg-white rounded-2xl border border-gray-200 shadow-sm";
const th = "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 bg-gray-50";
const td = "px-3 py-2 text-sm text-gray-800 border-t border-gray-100";
const num = `${td} text-right tabular-nums`;

function Tile({ label, value, note }) {
  return (
    <div className={`${card} px-4 py-3`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-gray-900 tabular-nums">{value ?? "—"}</div>
      {note ? <div className="text-xs text-gray-500 mt-0.5">{note}</div> : null}
    </div>
  );
}

function Section({ title, hint, children }) {
  return (
    <section className={`${card} overflow-hidden`}>
      <header className="px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-bold text-gray-900">{title}</h2>
        {hint ? <p className="text-xs text-gray-500 mt-0.5">{hint}</p> : null}
      </header>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

export default function MrmReport() {
  const [month, setMonth] = useState(lastMonth());
  const [model, setModel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);

  const [inputs, setInputs] = useState(null);
  const [inputsMeta, setInputsMeta] = useState(null);
  const [activeKey, setActiveKey] = useState("exhibitions");
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/reports/mrm/data", { params: { month } });
      setModel(res.data);
    } catch (err) {
      setModel(null);
      setError(err.response?.data?.message || "Could not build the MRM figures");
    } finally {
      setLoading(false);
    }
  }, [month]);

  const loadInputs = useCallback(async () => {
    try {
      const res = await api.get("/reports/mrm/inputs");
      setInputs(res.data.inputs);
      setInputsMeta(res.data.meta);
    } catch {
      // The figures above already report what is wrong; the editor just stays empty.
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadInputs(); }, [loadInputs]);
  useEffect(() => {
    if (inputs && activeKey in inputs) {
      setDraft(JSON.stringify(inputs[activeKey], null, 2));
      setDraftError("");
    }
  }, [inputs, activeKey]);

  const download = async () => {
    setDownloading(true);
    setError("");
    try {
      const res = await api.get("/reports/mrm/deck.pptx", { params: { month }, responseType: "blob" });
      const cd = res.headers["content-disposition"] || "";
      const name = (cd.match(/filename="([^"]+)"/) || [])[1] || `MKT MRM ${month}.pptx`;
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      let message = "Could not build the deck";
      try { message = JSON.parse(await err.response.data.text()).message || message; } catch { /* not JSON */ }
      setError(message);
    } finally {
      setDownloading(false);
    }
  };

  const saveDraft = async () => {
    let value;
    try {
      value = JSON.parse(draft);
    } catch (e) {
      setDraftError(`Not valid JSON: ${e.message}`);
      return;
    }
    setSaving(true);
    setDraftError("");
    setNotice("");
    try {
      await api.put(`/reports/mrm/inputs/${activeKey}`, { value });
      setNotice(`Saved "${INPUT_LABELS[activeKey] || activeKey}"`);
      await Promise.all([loadInputs(), load()]);
    } catch (err) {
      setDraftError(err.response?.data?.message || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const resetKey = async () => {
    if (!window.confirm(`Reset "${INPUT_LABELS[activeKey] || activeKey}" to the built-in default? Your saved version is discarded.`)) return;
    setSaving(true);
    setDraftError("");
    setNotice("");
    try {
      await api.delete(`/reports/mrm/inputs/${activeKey}`);
      setNotice("Reset to the built-in default");
      await Promise.all([loadInputs(), load()]);
    } catch (err) {
      setDraftError(err.response?.data?.message || "Could not reset");
    } finally {
      setSaving(false);
    }
  };

  const storedKeys = useMemo(() => new Set((inputsMeta?.stored || []).map((s) => s.key)), [inputsMeta]);

  // The elapsed fiscal months, for the MQL table.
  const mqlRows = useMemo(() => {
    if (!model) return [];
    const cats = model.mql.leads.categories;
    return cats
      .map((label, i) => ({
        label,
        leads: model.mql.leads.current.values[i],
        converted: model.mql.convertedLeads.current.values[i],
        convertedTarget: model.mql.convertedLeads.target?.values[i],
        pipeline: model.mql.pipelineMn.current.values[i],
        adSpend: model.mql.adSpendLakh.current.values[i],
        followers: model.linkedin.series.current.values[i],
        ym: Object.keys(model.mql.leads.sources)[i],
      }))
      .filter((r) => r.ym);
  }, [model]);

  const srcBadge = (metric, ym) => {
    const src = model?.[metric === "linkedinFollowersGained" ? "linkedin" : "mql"];
    const s = metric === "linkedinFollowersGained" ? src?.series?.sources?.[ym] : src?.[metric]?.sources?.[ym];
    if (s === "presented") return <span title="Shown as presented to management" className="ml-1 text-[10px] text-gray-400">●</span>;
    if (s === "live") return <span title="Read live" className="ml-1 text-[10px] text-emerald-500">●</span>;
    return null;
  };

  return (
    <MainLayout>
      <div className="p-4 lg:p-6 space-y-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="mr-auto">
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              <Presentation size={26} className="text-[#9b2423]" /> MRM Report
            </h1>
            <p className="text-gray-500 mt-1 text-sm">
              The monthly management review deck, built from Salesforce, Google Ads, LinkedIn and the portal.
            </p>
          </div>
          <label className="text-xs font-semibold text-gray-500">
            Review month
            <input
              type="month"
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
              className="block mt-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-[#9b2423]/40"
            />
          </label>
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <button
            onClick={download}
            disabled={downloading || loading || !model}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#9b2423] hover:bg-[#7f1d1c] text-white text-sm font-semibold disabled:opacity-60"
          >
            {downloading ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
            Download deck (.pptx)
          </button>
        </div>

        {error ? (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" /> {error}
          </div>
        ) : null}

        {model?.warnings?.length ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 space-y-1">
            {model.warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2"><AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> {w}</div>
            ))}
          </div>
        ) : null}

        {loading && !model ? (
          <div className="py-16 flex items-center justify-center gap-2 text-gray-400"><Loader2 size={18} className="animate-spin" /> Reading Salesforce and the portal…</div>
        ) : null}

        {model ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              <Tile label={`Leads – ${model.meta.monthName}`} value={model.mql.leads.current.values[mqlRows.length - 1]} note="Google AdWords + Website" />
              <Tile label="Converted (SQLs)" value={model.tokens.sqlMonth} note={`Target ${model.tokens.sqlTargetMonth} · YTD ${model.tokens.sqlYtd}`} />
              <Tile label="Pipeline YTD" value={`₹${model.tokens.pipelineCrYtd} Cr`} note={`Closed won ${model.tokens.wonCrYtd} Cr`} />
              <Tile label="Ad spend" value={model.mql.adSpendLakh.current.values[mqlRows.length - 1] != null ? `₹${model.mql.adSpendLakh.current.values[mqlRows.length - 1]} L` : "—"} note="Sieger Parking account" />
              <Tile label="LinkedIn followers gained" value={model.linkedin.month.achieved} note={model.linkedin.month.target ? `Target ${model.linkedin.month.target}` : null} />
              <Tile label="Exhibition leads FY" value={model.exhibitions.totals.leads} note={`${model.exhibitions.totals.converted} converted`} />
            </div>

            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Database size={13} />
              {model.meta.salesforce.configured
                ? <>Salesforce mirror synced {model.meta.salesforce.syncedAt ? new Date(model.meta.salesforce.syncedAt).toLocaleString("en-IN") : "—"}.</>
                : <>Salesforce mirror not connected.</>}
              <span className="text-gray-400">●</span> presented to management
              <span className="text-emerald-500">●</span> read live
            </div>

            <Section title={`MQL comparison – ${model.meta.fiscalYear}`} hint="Slide 3. Past months keep the figures already presented; the live recount is shown alongside so drift is visible.">
              <table className="w-full">
                <thead><tr>
                  <th className={th}>Month</th><th className={`${th} text-right`}>Leads</th><th className={`${th} text-right`}>Live recount</th>
                  <th className={`${th} text-right`}>Converted</th><th className={`${th} text-right`}>Target</th>
                  <th className={`${th} text-right`}>Pipeline (Mn)</th><th className={`${th} text-right`}>Ad spend (L)</th><th className={`${th} text-right`}>Followers</th>
                </tr></thead>
                <tbody>
                  {mqlRows.map((r) => (
                    <tr key={r.ym}>
                      <td className={td}>{r.label}</td>
                      <td className={num}>{r.leads ?? "—"}{srcBadge("leads", r.ym)}</td>
                      <td className={`${num} text-gray-400`}>{model.mql.leads.liveRecount[r.ym] ?? "—"}</td>
                      <td className={num}>{r.converted ?? "—"}{srcBadge("convertedLeads", r.ym)}</td>
                      <td className={`${num} text-gray-400`}>{r.convertedTarget ?? "—"}</td>
                      <td className={num}>{r.pipeline ?? "—"}{srcBadge("pipelineMn", r.ym)}</td>
                      <td className={num}>{r.adSpend ?? "—"}{srcBadge("adSpendLakh", r.ym)}</td>
                      <td className={num}>{r.followers ?? "—"}{srcBadge("linkedinFollowersGained", r.ym)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>

            <div className="grid xl:grid-cols-2 gap-5">
              <Section title="Exhibition tracker" hint="Slide 5. Leads: Salesforce source Trade Show, created in the event window.">
                <table className="w-full">
                  <thead><tr><th className={th}>Exhibition</th><th className={th}>Status</th><th className={`${th} text-right`}>Spend (L)</th><th className={`${th} text-right`}>Claimed (L)</th><th className={`${th} text-right`}>Leads</th><th className={`${th} text-right`}>Conv.</th></tr></thead>
                  <tbody>
                    {model.exhibitions.rows.map((r) => (
                      <tr key={r.name}><td className={td}>{r.name}</td><td className={td}>{r.status}</td><td className={num}>{r.spendLakh ?? "—"}</td><td className={`${num} text-gray-400`}>{r.claimedLakh ?? "—"}</td><td className={num}>{r.leads ?? "—"}</td><td className={num}>{r.converted ?? "—"}</td></tr>
                    ))}
                    <tr className="font-semibold bg-gray-50"><td className={td}>Total</td><td className={td} /><td className={num}>{model.exhibitions.totals.spendLakh}</td><td className={num} /><td className={num}>{model.exhibitions.totals.leads}</td><td className={num}>{model.exhibitions.totals.converted}</td></tr>
                  </tbody>
                </table>
              </Section>

              <Section title="Exhibition leads by salesperson" hint="Slide 6. Visits: visit plans with a check-in against the lead.">
                <table className="w-full">
                  <thead><tr><th className={th}>User</th><th className={`${th} text-right`}>Assigned</th><th className={`${th} text-right`}>Converted</th><th className={`${th} text-right`}>Open</th><th className={`${th} text-right`}>Dropped</th><th className={`${th} text-right`}>Visits</th></tr></thead>
                  <tbody>
                    {model.exhibitions.byOwner.map((o) => (
                      <tr key={o.user}><td className={td}>{o.user}</td><td className={num}>{o.assigned}</td><td className={num}>{o.converted || ""}</td><td className={num}>{o.open || ""}</td><td className={num}>{o.dropped || ""}</td><td className={num}>{o.visits || ""}</td></tr>
                    ))}
                    {model.exhibitions.byOwnerTotal ? (
                      <tr className="font-semibold bg-gray-50"><td className={td}>Total</td><td className={num}>{model.exhibitions.byOwnerTotal.assigned}</td><td className={num}>{model.exhibitions.byOwnerTotal.converted}</td><td className={num}>{model.exhibitions.byOwnerTotal.open}</td><td className={num}>{model.exhibitions.byOwnerTotal.dropped}</td><td className={num}>{model.exhibitions.byOwnerTotal.visits}</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </Section>

              <Section title="Open export opportunities" hint={`Slide 10. Total ${model.exportOpps.totalUsdMn} Mn USD. From Salesforce; blanks filled from the inputs.`}>
                <table className="w-full">
                  <thead><tr><th className={th}>Opportunity</th><th className={th}>Stage</th><th className={th}>Country</th><th className={`${th} text-right`}>Cars</th><th className={`${th} text-right`}>USD Mn</th><th className={th}>Close</th></tr></thead>
                  <tbody>
                    {model.exportOpps.rows.map((r) => (
                      <tr key={r.name}><td className={td}>{r.name}</td><td className={td}>{r.stage}</td><td className={td}>{r.country || "—"}</td><td className={num}>{r.carSpaces ?? "—"}</td><td className={num}>{r.amountUsdMn ?? "—"}</td><td className={td}>{r.closeDate || "—"}</td></tr>
                    ))}
                  </tbody>
                </table>
              </Section>

              <Section title="Site branding" hint={`Slide 4. ${model.siteBranding.completed} of ${model.siteBranding.total} complete, from the portal project "${model.siteBranding.project || "—"}", in due-date order.`}>
                <table className="w-full">
                  <thead><tr><th className={th}>Customer</th><th className={th}>System</th><th className={th}>Progress</th></tr></thead>
                  <tbody>
                    {model.siteBranding.rows.slice(0, 14).map((r, i) => (
                      <tr key={i}><td className={td}>{r.customer}</td><td className={td}>{r.system || "—"}</td><td className={`${td} ${r.done ? "text-emerald-700 font-semibold" : r.overdue ? "text-red-600 font-semibold" : "text-amber-700"}`}>{r.progress}</td></tr>
                    ))}
                  </tbody>
                </table>
                {model.siteBranding.rows.length > 14 ? <div className="px-4 py-2 text-xs text-gray-500 border-t border-gray-100">…and {model.siteBranding.rows.length - 14} more. The deck shows the first 36.</div> : null}
              </Section>
            </div>
          </>
        ) : null}

        <section className={`${card} overflow-hidden`}>
          <header className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900">Inputs</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              What the deck cannot compute: targets, wording, the hand-kept trackers, and figures already presented. Edit, save, and the figures above refresh.
            </p>
          </header>
          <div className="grid md:grid-cols-[260px_1fr]">
            <nav className="border-b md:border-b-0 md:border-r border-gray-100 p-2 space-y-0.5">
              {Object.keys(INPUT_LABELS).map((k) => (
                <button
                  key={k}
                  onClick={() => { setActiveKey(k); setNotice(""); }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm ${activeKey === k ? "bg-[#9b2423]/10 text-[#9b2423] font-semibold" : "text-gray-700 hover:bg-gray-50"}`}
                >
                  {INPUT_LABELS[k]}
                  {storedKeys.has(k) ? <span className="ml-1.5 text-[10px] text-emerald-600 font-semibold">edited</span> : null}
                </button>
              ))}
            </nav>
            <div className="p-4 space-y-3">
              {inputsMeta?.migrationNeeded ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Saving is not available yet: run <code>backend/database/mrm-migration.sql</code> on the server. Until then the built-in defaults are used.
                </div>
              ) : null}
              <textarea
                value={draft}
                onChange={(e) => { setDraft(e.target.value); setDraftError(""); }}
                spellCheck={false}
                className="w-full h-[420px] font-mono text-xs leading-5 border border-gray-200 rounded-xl p-3 bg-gray-50 outline-none focus:ring-2 focus:ring-[#9b2423]/40"
              />
              {draftError ? <div className="text-sm text-red-600">{draftError}</div> : null}
              {notice ? <div className="text-sm text-emerald-700">{notice}</div> : null}
              <div className="flex flex-wrap gap-2">
                <button onClick={saveDraft} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#9b2423] hover:bg-[#7f1d1c] text-white text-sm font-semibold disabled:opacity-60">
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save
                </button>
                <button onClick={resetKey} disabled={saving || !storedKeys.has(activeKey)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                  <RotateCcw size={15} /> Reset to default
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </MainLayout>
  );
}
