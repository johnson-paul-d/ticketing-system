import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Building2, Loader2, X, Plus, Search, ChevronLeft, ChevronRight,
  Upload, Zap, Clock, ArrowLeft, Trash2, Star,
} from "lucide-react";
import MainLayout from "../layouts/MainLayout";
import api from "../services/api";
import {
  ACCOUNT_STATUSES, CONTACT_STATUSES, ACTIVITY_TYPES, ACTIVITY_RESULTS,
  ROLE_LEVELS, OPPORTUNITY_STAGES, accountStatusChip, contactStatusColor,
} from "../constants/abm";

const PAGE_SIZE = 50;

const input =
  "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 outline-none focus:ring-2 focus:ring-[#9b2423]/40";

// Minimal CSV parser (handles quoted fields with commas)
const parseCSV = (text) => {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (field || row.length) { row.push(field); rows.push(row); row = []; field = ""; }
      if (ch === "\r" && text[i + 1] === "\n") i++;
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
};

const emptyContact = {
  name: "", designation: "", role_level: "", email: "", phone: "",
  linkedin: "", whatsapp: "", decision_maker: false, notes: "",
};

export default function AbmAccountDetails() {
  const { id } = useParams();
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("contacts");
  const [toast, setToast] = useState("");

  // Contacts
  const [contacts, setContacts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dmOnly, setDmOnly] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [selected, setSelected] = useState(new Set());

  // Timeline
  const [activities, setActivities] = useState([]);
  const [actTotal, setActTotal] = useState(0);
  const [actPage, setActPage] = useState(1);
  const [resultFilter, setResultFilter] = useState("");

  // Modals
  const [showLog, setShowLog] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showOpp, setShowOpp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [logForm, setLogForm] = useState({
    activity_type: "Cold Email 1", result: "Sent",
    activity_date: new Date().toISOString().split("T")[0], notes: "",
  });
  const [contactForm, setContactForm] = useState(emptyContact);
  const [csvText, setCsvText] = useState("");
  const [oppForm, setOppForm] = useState({
    name: "", potential: "", probability: "", expected_value: "", stage: "Qualification",
  });

  const flash = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const fetchAccount = useCallback(async () => {
    try {
      const res = await api.get(`/abm/accounts/${id}`);
      setAccount(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchContacts = useCallback(async () => {
    setContactsLoading(true);
    try {
      const res = await api.get("/abm/contacts", {
        params: {
          account_id: id, page, limit: PAGE_SIZE,
          search: search || undefined,
          status: statusFilter || undefined,
          decision_maker: dmOnly ? "true" : undefined,
        },
      });
      setContacts(res.data.rows);
      setTotal(res.data.total);
    } catch (err) {
      console.error(err);
    } finally {
      setContactsLoading(false);
    }
  }, [id, page, search, statusFilter, dmOnly]);

  const fetchActivities = useCallback(async () => {
    try {
      const res = await api.get("/abm/activities", {
        params: {
          account_id: id, page: actPage, limit: 50,
          result: resultFilter || undefined,
        },
      });
      setActivities(res.data.rows);
      setActTotal(res.data.total);
    } catch (err) {
      console.error(err);
    }
  }, [id, actPage, resultFilter]);

  useEffect(() => { fetchAccount(); }, [fetchAccount]);
  useEffect(() => { fetchContacts(); }, [fetchContacts]);
  useEffect(() => { if (tab === "timeline") fetchActivities(); }, [tab, fetchActivities]);

  const pages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  const toggleSelect = (cid) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(cid) ? next.delete(cid) : next.add(cid);
      return next;
    });

  const togglePage = () => {
    const pageIds = contacts.map((c) => c.id);
    const allSelected = pageIds.every((cid) => selected.has(cid));
    setSelected((prev) => {
      const next = new Set(prev);
      pageIds.forEach((cid) => (allSelected ? next.delete(cid) : next.add(cid)));
      return next;
    });
  };

  // ---- Actions ----
  const logActivity = async (contactIds) => {
    setSaving(true);
    setError("");
    try {
      await api.post("/abm/activities", { ...logForm, contact_ids: contactIds });
      setShowLog(false);
      setSelected(new Set());
      flash(`Logged "${logForm.activity_type}" for ${contactIds.length} contact${contactIds.length > 1 ? "s" : ""}`);
      fetchContacts();
      fetchAccount();
      if (tab === "timeline") fetchActivities();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to log activity");
    } finally {
      setSaving(false);
    }
  };

  const bulkSetStatus = async (status) => {
    if (!status || !selected.size) return;
    try {
      await api.put("/abm/contacts/bulk-status", {
        contact_ids: [...selected], status,
      });
      setSelected(new Set());
      flash(`Status set to "${status}"`);
      fetchContacts();
      fetchAccount();
    } catch (err) {
      console.error(err);
    }
  };

  const addContact = async () => {
    if (!contactForm.name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    setError("");
    try {
      await api.post("/abm/contacts", { ...contactForm, account_id: id });
      setShowAdd(false);
      setContactForm(emptyContact);
      flash("Contact added");
      fetchContacts();
      fetchAccount();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to add contact");
    } finally {
      setSaving(false);
    }
  };

  const importCSV = async () => {
    const rows = parseCSV(csvText.trim());
    if (rows.length < 2) { setError("Paste CSV with a header row and at least one contact"); return; }
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const col = (names) => header.findIndex((h) => names.includes(h));
    const iName = col(["person", "name", "full name", "contact"]);
    if (iName === -1) { setError('No "Person" or "Name" column found in the header'); return; }
    const iDesig = col(["designation", "title", "job title", "role"]);
    const iEmail = col(["email", "email address"]);
    const iPhone = col(["phone", "phone number", "mobile"]);
    const iLi = col(["linkedin", "linkedin url", "profile url"]);
    const iWa = col(["whatsapp"]);
    const iDm = col(["decision maker", "decision_maker", "dm"]);

    const parsed = rows.slice(1)
      .filter((r) => r[iName]?.trim())
      .map((r) => ({
        name: r[iName],
        designation: iDesig >= 0 ? r[iDesig] : null,
        email: iEmail >= 0 ? r[iEmail] : null,
        phone: iPhone >= 0 ? r[iPhone] : null,
        linkedin: iLi >= 0 ? r[iLi] : null,
        whatsapp: iWa >= 0 ? r[iWa] : null,
        decision_maker: iDm >= 0 ? ["yes", "true", "y", "✔"].includes((r[iDm] || "").trim().toLowerCase()) : false,
      }));
    if (!parsed.length) { setError("No valid rows found"); return; }

    setSaving(true);
    setError("");
    try {
      const res = await api.post("/abm/contacts/bulk", { account_id: id, contacts: parsed });
      setShowImport(false);
      setCsvText("");
      flash(`Imported ${res.data.inserted} contacts`);
      fetchContacts();
      fetchAccount();
    } catch (err) {
      setError(err.response?.data?.message || "Import failed");
    } finally {
      setSaving(false);
    }
  };

  const addOpportunity = async () => {
    setSaving(true);
    setError("");
    try {
      await api.post("/abm/opportunities", {
        ...oppForm,
        account_id: id,
        probability: oppForm.probability === "" ? null : Number(oppForm.probability),
        expected_value: oppForm.expected_value === "" ? null : Number(oppForm.expected_value),
      });
      setShowOpp(false);
      setOppForm({ name: "", potential: "", probability: "", expected_value: "", stage: "Qualification" });
      flash("Opportunity added");
      fetchAccount();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to add opportunity");
    } finally {
      setSaving(false);
    }
  };

  const updateAccountStatus = async (status) => {
    try {
      await api.put(`/abm/accounts/${id}`, { status });
      fetchAccount();
    } catch (err) {
      console.error(err);
    }
  };

  const deleteContact = async (cid) => {
    if (!window.confirm("Delete this contact and all their activities?")) return;
    await api.delete(`/abm/contacts/${cid}`);
    fetchContacts();
    fetchAccount();
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-24 text-gray-400 gap-2">
          <Loader2 size={20} className="animate-spin" /> Loading account…
        </div>
      </MainLayout>
    );
  }
  if (!account) {
    return (
      <MainLayout>
        <p className="text-gray-500">Account not found.</p>
      </MainLayout>
    );
  }

  const sc = account.status_counts || {};

  return (
    <MainLayout>
      {toast && (
        <div className="fixed top-5 right-5 z-[99] bg-emerald-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      <Link to="/abm/accounts" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#9b2423] mb-4">
        <ArrowLeft size={15} /> All accounts
      </Link>

      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm p-5 mb-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2.5">
              <Building2 className="text-[#9b2423]" size={24} /> {account.name}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {[account.country, account.industry, account.website].filter(Boolean).join(" · ") || "—"}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-semibold px-2 py-1 rounded-full bg-gray-100 text-gray-600">{account.tier}</span>
            <span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${
              account.priority === "High" ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-500"
            }`}>{account.priority} priority</span>
            <select
              value={account.status}
              onChange={(e) => updateAccountStatus(e.target.value)}
              className={`text-[12px] font-semibold px-2 py-1 rounded-full border cursor-pointer outline-none ${
                accountStatusChip[account.status] || accountStatusChip.Research
              }`}
            >
              {ACCOUNT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* Pipeline rollup */}
        <div className="flex flex-wrap gap-1.5 mt-4">
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-gray-800 text-white">
            {account.contact_total} contacts · {account.decision_makers} DMs
          </span>
          {Object.entries(sc)
            .sort((a, b) => b[1] - a[1])
            .map(([s, n]) => (
              <button
                key={s}
                onClick={() => { setStatusFilter(statusFilter === s ? "" : s); setPage(1); setTab("contacts"); }}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-full transition ${contactStatusColor(s)} ${
                  statusFilter === s ? "ring-2 ring-[#9b2423]/50" : ""
                }`}
              >
                {s}: {n}
              </button>
            ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-white rounded-xl p-1 shadow-sm w-fit">
        {["contacts", "timeline", "opportunities"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-semibold rounded-lg capitalize transition ${
              tab === t ? "bg-[#9b2423] text-white" : "text-gray-500 hover:bg-gray-50"
            }`}
          >
            {t}
            {t === "opportunities" && account.opportunities.length > 0 && ` (${account.opportunities.length})`}
          </button>
        ))}
      </div>

      {/* ============ CONTACTS TAB ============ */}
      {tab === "contacts" && (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search name, title, email…"
                className="border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-[#9b2423]/30 w-60"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white outline-none"
            >
              <option value="">All statuses</option>
              {CONTACT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <label className="inline-flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer bg-white border border-gray-200 rounded-xl px-3 py-2">
              <input type="checkbox" checked={dmOnly} onChange={(e) => { setDmOnly(e.target.checked); setPage(1); }} />
              Decision makers
            </label>
            <div className="flex-1" />
            <button
              onClick={() => setShowImport(true)}
              className="inline-flex items-center gap-1.5 border border-gray-200 hover:border-[#9b2423]/40 bg-white text-gray-700 text-sm font-semibold px-3.5 py-2 rounded-xl transition"
            >
              <Upload size={14} /> Import CSV
            </button>
            <button
              onClick={() => { setError(""); setShowAdd(true); }}
              className="inline-flex items-center gap-1.5 bg-[#9b2423] hover:bg-[#7d1d1c] text-white text-sm font-semibold px-3.5 py-2 rounded-xl transition"
            >
              <Plus size={14} /> Add Contact
            </button>
          </div>

          {/* Bulk action bar */}
          {selected.size > 0 && (
            <div className="sticky top-2 z-30 bg-gray-900 text-white rounded-2xl px-4 py-3 mb-3 flex flex-wrap items-center gap-3 shadow-lg">
              <span className="text-sm font-semibold">{selected.size} selected</span>
              <button
                onClick={() => { setError(""); setShowLog(true); }}
                className="inline-flex items-center gap-1.5 bg-[#9b2423] hover:bg-[#b52d2c] text-white text-sm font-semibold px-3.5 py-1.5 rounded-lg transition"
              >
                <Zap size={14} /> Log Activity
              </button>
              <select
                onChange={(e) => { bulkSetStatus(e.target.value); e.target.value = ""; }}
                defaultValue=""
                className="bg-gray-800 border border-gray-700 text-sm rounded-lg px-2.5 py-1.5 outline-none"
              >
                <option value="" disabled>Set status…</option>
                {CONTACT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <button onClick={() => setSelected(new Set())} className="text-sm text-gray-300 hover:text-white ml-auto">
                Clear
              </button>
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm overflow-x-auto">
            {contactsLoading ? (
              <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
                <Loader2 size={18} className="animate-spin" /> Loading…
              </div>
            ) : contacts.length === 0 ? (
              <div className="p-12 text-center text-gray-400 text-sm">
                {total === 0 && !search && !statusFilter
                  ? "No contacts yet — add one or import a CSV / Sales Navigator export"
                  : "No contacts match the filters"}
              </div>
            ) : (
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b">
                    <th className="pl-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={contacts.length > 0 && contacts.every((c) => selected.has(c.id))}
                        onChange={togglePage}
                      />
                    </th>
                    <th className="px-2 py-3 font-medium">Person</th>
                    <th className="px-2 py-3 font-medium">Designation</th>
                    <th className="px-2 py-3 font-medium">Email / Phone</th>
                    <th className="px-2 py-3 font-medium">Status</th>
                    <th className="px-2 py-3 font-medium">Last Touch</th>
                    <th className="px-2 py-3 font-medium">Next Action</th>
                    <th className="px-2 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c) => (
                    <tr key={c.id} className={`border-b last:border-0 hover:bg-gray-50 transition ${selected.has(c.id) ? "bg-red-50/40" : ""}`}>
                      <td className="pl-4 py-2.5">
                        <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} />
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="font-semibold text-gray-800 flex items-center gap-1.5">
                          {c.decision_maker && <Star size={12} className="text-amber-500 fill-amber-400 flex-shrink-0" />}
                          {c.name}
                        </div>
                        {c.linkedin && (
                          <a href={c.linkedin.startsWith("http") ? c.linkedin : `https://${c.linkedin}`} target="_blank" rel="noreferrer" className="text-[11px] text-blue-600 hover:underline">
                            LinkedIn
                          </a>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-gray-600">{c.designation || "—"}</td>
                      <td className="px-2 py-2.5 text-gray-500 text-xs">
                        {c.email && <div>{c.email}</div>}
                        {c.phone && <div>{c.phone}</div>}
                        {!c.email && !c.phone && "—"}
                      </td>
                      <td className="px-2 py-2.5">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${contactStatusColor(c.status)}`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-xs text-gray-400 whitespace-nowrap">
                        {c.last_activity_type
                          ? <>
                              <div className="text-gray-600">{c.last_activity_type}</div>
                              {c.last_activity_at?.split("T")[0]}
                            </>
                          : "never"}
                      </td>
                      <td className="px-2 py-2.5 text-xs">
                        {c.next_action
                          ? <span className="inline-flex items-center gap-1 text-[#9b2423] font-semibold">
                              <Clock size={11} /> {c.next_action}{c.next_action_due ? ` · ${c.next_action_due}` : ""}
                            </span>
                          : <span className="text-gray-300">auto</span>}
                      </td>
                      <td className="px-2 py-2.5">
                        <button onClick={() => deleteContact(c.id)} className="text-gray-300 hover:text-red-500 transition">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Pagination */}
            {total > PAGE_SIZE && (
              <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-gray-500">
                <span>{total} contacts · page {page} of {pages}</span>
                <div className="flex gap-1">
                  <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-30 hover:bg-gray-50">
                    <ChevronLeft size={15} />
                  </button>
                  <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-30 hover:bg-gray-50">
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ============ TIMELINE TAB ============ */}
      {tab === "timeline" && (
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
            <h2 className="font-bold">Activity Timeline ({actTotal})</h2>
            <select
              value={resultFilter}
              onChange={(e) => { setResultFilter(e.target.value); setActPage(1); }}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white outline-none"
            >
              <option value="">All results</option>
              {ACTIVITY_RESULTS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {activities.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">No activities logged yet</p>
          ) : (
            <div className="relative pl-6">
              <div className="absolute left-[9px] top-2 bottom-2 w-px bg-gray-200" />
              {activities.map((a) => (
                <div key={a.id} className="relative pb-5 last:pb-0">
                  <div className={`absolute -left-6 top-1 w-[18px] h-[18px] rounded-full border-2 border-white shadow ${
                    ["Responded", "Interested", "Meeting Fixed", "Connected"].includes(a.result)
                      ? "bg-emerald-500"
                      : a.result === "No Response" || a.result === "Not Interested"
                      ? "bg-gray-300"
                      : "bg-[#9b2423]"
                  }`} />
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-xs text-gray-400 font-medium w-20 flex-shrink-0">{a.activity_date}</span>
                    <span className="font-semibold text-sm">{a.activity_type}</span>
                    {a.result && (
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        ["Responded", "Interested", "Meeting Fixed", "Connected"].includes(a.result)
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-gray-100 text-gray-500"
                      }`}>{a.result}</span>
                    )}
                    <span className="text-xs text-gray-400">{a.channel}</span>
                  </div>
                  {a.notes && <p className="text-xs text-gray-500 mt-1 ml-[88px]">{a.notes}</p>}
                </div>
              ))}
            </div>
          )}
          {actTotal > 50 && (
            <div className="flex items-center justify-end gap-1 mt-4 text-sm text-gray-500">
              page {actPage} of {Math.ceil(actTotal / 50)}
              <button disabled={actPage <= 1} onClick={() => setActPage(actPage - 1)} className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-30 hover:bg-gray-50 ml-2">
                <ChevronLeft size={15} />
              </button>
              <button disabled={actPage >= Math.ceil(actTotal / 50)} onClick={() => setActPage(actPage + 1)} className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-30 hover:bg-gray-50">
                <ChevronRight size={15} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ============ OPPORTUNITIES TAB ============ */}
      {tab === "opportunities" && (
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold">Opportunities</h2>
            <button
              onClick={() => { setError(""); setShowOpp(true); }}
              className="inline-flex items-center gap-1.5 bg-[#9b2423] hover:bg-[#7d1d1c] text-white text-sm font-semibold px-3.5 py-2 rounded-xl transition"
            >
              <Plus size={14} /> Add
            </button>
          </div>
          {account.opportunities.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">No opportunities yet</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b">
                  <th className="pb-2 font-medium">Name</th>
                  <th className="pb-2 font-medium">Potential</th>
                  <th className="pb-2 font-medium text-right">Probability</th>
                  <th className="pb-2 font-medium text-right">Expected Value</th>
                  <th className="pb-2 font-medium">Stage</th>
                </tr>
              </thead>
              <tbody>
                {account.opportunities.map((o) => (
                  <tr key={o.id} className="border-b last:border-0">
                    <td className="py-2.5 font-medium">{o.name || "—"}</td>
                    <td className="py-2.5 text-gray-600">{o.potential || "—"}</td>
                    <td className="py-2.5 text-right">{o.probability != null ? `${o.probability}%` : "—"}</td>
                    <td className="py-2.5 text-right">{o.expected_value != null ? Number(o.expected_value).toLocaleString() : "—"}</td>
                    <td className="py-2.5">
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">{o.stage}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ============ LOG ACTIVITY MODAL (bulk) ============ */}
      {showLog && (
        <Modal title={`Log activity — ${selected.size} contact${selected.size > 1 ? "s" : ""}`} onClose={() => setShowLog(false)}>
          {error && <ErrorBox msg={error} />}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <Label>Activity</Label>
              <select value={logForm.activity_type} onChange={(e) => setLogForm({ ...logForm, activity_type: e.target.value })} className={input}>
                {ACTIVITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <Label>Result</Label>
              <select value={logForm.result} onChange={(e) => setLogForm({ ...logForm, result: e.target.value })} className={input}>
                {ACTIVITY_RESULTS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <Label>Date</Label>
              <input type="date" value={logForm.activity_date} onChange={(e) => setLogForm({ ...logForm, activity_date: e.target.value })} className={input} />
            </div>
            <div className="col-span-2">
              <Label>Notes</Label>
              <textarea rows={2} value={logForm.notes} onChange={(e) => setLogForm({ ...logForm, notes: e.target.value })} className={input} placeholder="Optional" />
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Contact statuses update automatically, and the next follow-up is scheduled by the sequence rules.
          </p>
          <ModalActions
            saving={saving}
            onSave={() => logActivity([...selected])}
            onCancel={() => setShowLog(false)}
            saveLabel="Log Activity"
          />
        </Modal>
      )}

      {/* ============ ADD CONTACT MODAL ============ */}
      {showAdd && (
        <Modal title="Add Contact" onClose={() => setShowAdd(false)}>
          {error && <ErrorBox msg={error} />}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Name *</Label>
              <input value={contactForm.name} onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })} className={input} placeholder="John Smith" />
            </div>
            <div>
              <Label>Designation</Label>
              <input value={contactForm.designation} onChange={(e) => setContactForm({ ...contactForm, designation: e.target.value })} className={input} placeholder="Engineering Director" />
            </div>
            <div>
              <Label>Role level</Label>
              <select value={contactForm.role_level} onChange={(e) => setContactForm({ ...contactForm, role_level: e.target.value })} className={input}>
                <option value="">—</option>
                {ROLE_LEVELS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <Label>Email</Label>
              <input value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} className={input} />
            </div>
            <div>
              <Label>Phone</Label>
              <input value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} className={input} />
            </div>
            <div>
              <Label>LinkedIn</Label>
              <input value={contactForm.linkedin} onChange={(e) => setContactForm({ ...contactForm, linkedin: e.target.value })} className={input} />
            </div>
            <div>
              <Label>WhatsApp</Label>
              <input value={contactForm.whatsapp} onChange={(e) => setContactForm({ ...contactForm, whatsapp: e.target.value })} className={input} />
            </div>
            <label className="col-span-2 inline-flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
              <input type="checkbox" checked={contactForm.decision_maker} onChange={(e) => setContactForm({ ...contactForm, decision_maker: e.target.checked })} />
              Decision maker
            </label>
          </div>
          <ModalActions saving={saving} onSave={addContact} onCancel={() => setShowAdd(false)} saveLabel="Add Contact" />
        </Modal>
      )}

      {/* ============ IMPORT CSV MODAL ============ */}
      {showImport && (
        <Modal title="Import Contacts (CSV)" onClose={() => setShowImport(false)}>
          {error && <ErrorBox msg={error} />}
          <p className="text-xs text-gray-500 mb-3">
            Paste CSV with a header row. Recognised columns: <b>Person/Name</b>, Designation/Title,
            Email, Phone, LinkedIn, WhatsApp, Decision Maker. Works with Sales Navigator exports.
          </p>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) f.text().then(setCsvText);
            }}
            className="text-sm mb-3"
          />
          <textarea
            rows={8}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder={"Person,Designation,Email\nJohn Smith,Engineering Director,john@abc.com"}
            className={`${input} font-mono text-xs`}
          />
          <ModalActions saving={saving} onSave={importCSV} onCancel={() => setShowImport(false)} saveLabel="Import" />
        </Modal>
      )}

      {/* ============ ADD OPPORTUNITY MODAL ============ */}
      {showOpp && (
        <Modal title="Add Opportunity" onClose={() => setShowOpp(false)}>
          {error && <ErrorBox msg={error} />}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Name</Label>
              <input value={oppForm.name} onChange={(e) => setOppForm({ ...oppForm, name: e.target.value })} className={input} placeholder="Parking system — Plant 2" />
            </div>
            <div>
              <Label>Potential</Label>
              <input value={oppForm.potential} onChange={(e) => setOppForm({ ...oppForm, potential: e.target.value })} className={input} />
            </div>
            <div>
              <Label>Probability %</Label>
              <input type="number" min="0" max="100" value={oppForm.probability} onChange={(e) => setOppForm({ ...oppForm, probability: e.target.value })} className={input} />
            </div>
            <div>
              <Label>Expected value</Label>
              <input type="number" value={oppForm.expected_value} onChange={(e) => setOppForm({ ...oppForm, expected_value: e.target.value })} className={input} />
            </div>
            <div>
              <Label>Stage</Label>
              <select value={oppForm.stage} onChange={(e) => setOppForm({ ...oppForm, stage: e.target.value })} className={input}>
                {OPPORTUNITY_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <ModalActions saving={saving} onSave={addOpportunity} onCancel={() => setShowOpp(false)} saveLabel="Add Opportunity" />
        </Modal>
      )}
    </MainLayout>
  );
}

// ---- Small shared pieces ----
function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-6">
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b z-10">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function ModalActions({ saving, onSave, onCancel, saveLabel }) {
  return (
    <div className="flex gap-3 mt-6">
      <button
        onClick={onSave}
        disabled={saving}
        className="flex-1 inline-flex items-center justify-center gap-2 bg-[#9b2423] hover:bg-[#7d1d1c] disabled:opacity-60 text-white font-semibold text-sm px-4 py-3 rounded-xl transition"
      >
        {saving && <Loader2 size={16} className="animate-spin" />}
        {saveLabel}
      </button>
      <button onClick={onCancel} className="px-5 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">
        Cancel
      </button>
    </div>
  );
}

function Label({ children }) {
  return <label className="block text-sm font-semibold text-gray-700 mb-1.5">{children}</label>;
}

function ErrorBox({ msg }) {
  return (
    <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl border border-red-200 mb-4">
      {msg}
    </div>
  );
}
