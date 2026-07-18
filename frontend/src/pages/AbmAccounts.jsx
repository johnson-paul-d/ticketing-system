import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Building2, Plus, Loader2, X, AlertTriangle, Search, Users,
} from "lucide-react";
import MainLayout from "../layouts/MainLayout";
import api from "../services/api";
import {
  ACCOUNT_STATUSES, TIERS, PRIORITIES, accountStatusChip,
} from "../constants/abm";

const emptyForm = {
  name: "", country: "", industry: "", website: "",
  employees: "", revenue: "", priority: "Medium", tier: "Tier 2", status: "Research",
};

export default function AbmAccounts() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm);

  // Filters
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("");
  const [status, setStatus] = useState("");
  const [tier, setTier] = useState("");

  const fetchAccounts = async () => {
    try {
      const res = await api.get("/abm/accounts");
      setAccounts(res.data || []);
      setSetupNeeded(false);
    } catch (err) {
      if (err.response?.data?.code === "ABM_MIGRATION_REQUIRED") setSetupNeeded(true);
      else console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const countries = useMemo(
    () => [...new Set(accounts.map((a) => a.country).filter(Boolean))].sort(),
    [accounts]
  );

  const visible = useMemo(
    () =>
      accounts.filter(
        (a) =>
          (!search || a.name.toLowerCase().includes(search.toLowerCase())) &&
          (!country || a.country === country) &&
          (!status || a.status === status) &&
          (!tier || a.tier === tier)
      ),
    [accounts, search, country, status, tier]
  );

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const createAccount = async () => {
    if (!form.name.trim()) {
      setError("Company name is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await api.post("/abm/accounts", form);
      setShowCreate(false);
      setForm(emptyForm);
      navigate(`/abm/accounts/${res.data.id}`);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to create account");
    } finally {
      setSaving(false);
    }
  };

  const input =
    "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 outline-none focus:ring-2 focus:ring-[#9b2423]/40";

  return (
    <MainLayout>
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-3">
            <Building2 className="text-[#9b2423]" size={28} /> ABM Accounts
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {accounts.length} target companies · {visible.length} shown
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 bg-[#9b2423] hover:bg-[#7d1d1c] text-white font-semibold text-sm px-4 py-2.5 rounded-xl shadow-sm transition"
        >
          <Plus size={16} /> New Account
        </button>
      </div>

      {setupNeeded && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex items-start gap-3 text-amber-800">
          <AlertTriangle size={20} className="mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold">ABM CRM is not set up in the database yet</p>
            <p className="text-sm mt-1">
              Run <code className="bg-amber-100 px-1.5 py-0.5 rounded">backend/database/abm-migration.sql</code>{" "}
              in the Supabase SQL Editor, then reload this page.
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      {!setupNeeded && (
        <div className="flex flex-wrap gap-2 mb-5">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search companies…"
              className="border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-[#9b2423]/30 w-56"
            />
          </div>
          <select value={country} onChange={(e) => setCountry(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white outline-none">
            <option value="">All countries</option>
            {countries.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white outline-none">
            <option value="">All statuses</option>
            {ACCOUNT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={tier} onChange={(e) => setTier(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white outline-none">
            <option value="">All tiers</option>
            {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24 text-gray-400 gap-2">
          <Loader2 size={20} className="animate-spin" /> Loading accounts…
        </div>
      ) : !setupNeeded && visible.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
          <Building2 size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">
            {accounts.length ? "No accounts match the filters" : "No accounts yet"}
          </p>
          {!accounts.length && (
            <p className="text-sm text-gray-400 mt-1">Add your first target company to start tracking</p>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b">
                <th className="px-5 py-3 font-medium">Company</th>
                <th className="px-3 py-3 font-medium">Country</th>
                <th className="px-3 py-3 font-medium">Tier</th>
                <th className="px-3 py-3 font-medium">Priority</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium text-right">Contacts</th>
                <th className="px-3 py-3 font-medium text-right">In Sequence</th>
                <th className="px-3 py-3 font-medium text-right">Warm</th>
                <th className="px-5 py-3 font-medium">Last Touch</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => navigate(`/abm/accounts/${a.id}`)}
                  className="border-b last:border-0 hover:bg-gray-50 cursor-pointer transition"
                >
                  <td className="px-5 py-3">
                    <div className="font-semibold text-gray-800">{a.name}</div>
                    {a.industry && <div className="text-[11px] text-gray-400">{a.industry}</div>}
                  </td>
                  <td className="px-3 py-3 text-gray-600">{a.country || "—"}</td>
                  <td className="px-3 py-3 text-gray-600">{a.tier}</td>
                  <td className="px-3 py-3">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      a.priority === "High" ? "bg-red-50 text-red-600"
                        : a.priority === "Medium" ? "bg-amber-50 text-amber-600"
                        : "bg-gray-100 text-gray-500"
                    }`}>{a.priority}</span>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                      accountStatusChip[a.status] || accountStatusChip.Research
                    }`}>{a.status}</span>
                  </td>
                  <td className="px-3 py-3 text-right font-semibold">
                    <span className="inline-flex items-center gap-1">
                      <Users size={12} className="text-gray-400" />{a.stats.contacts}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right text-blue-600">{a.stats.in_sequence}</td>
                  <td className="px-3 py-3 text-right text-emerald-600 font-semibold">{a.stats.responded}</td>
                  <td className="px-5 py-3 text-gray-400 text-xs">
                    {a.stats.last_activity_at ? a.stats.last_activity_at.split("T")[0] : "never"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-6">
          <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-bold">New Account</h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {error && (
                <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl border border-red-200">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Company name <span className="text-red-500">*</span>
                </label>
                <input value={form.name} onChange={set("name")} placeholder="e.g., Toyota" className={input} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Country</label>
                  <input value={form.country} onChange={set("country")} placeholder="Japan" className={input} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Industry</label>
                  <input value={form.industry} onChange={set("industry")} placeholder="Automotive" className={input} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Website</label>
                  <input value={form.website} onChange={set("website")} placeholder="toyota.com" className={input} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Employees</label>
                  <input value={form.employees} onChange={set("employees")} placeholder="370000" className={input} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Revenue</label>
                  <input value={form.revenue} onChange={set("revenue")} placeholder="Enterprise" className={input} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Priority</label>
                  <select value={form.priority} onChange={set("priority")} className={input}>
                    {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Tier</label>
                  <select value={form.tier} onChange={set("tier")} className={input}>
                    {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Status</label>
                  <select value={form.status} onChange={set("status")} className={input}>
                    {ACCOUNT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex gap-3">
              <button
                onClick={createAccount}
                disabled={saving}
                className="flex-1 inline-flex items-center justify-center gap-2 bg-[#9b2423] hover:bg-[#7d1d1c] disabled:opacity-60 text-white font-semibold text-sm px-4 py-3 rounded-xl transition"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                Create Account
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-5 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
}
