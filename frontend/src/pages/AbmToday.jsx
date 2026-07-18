import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarCheck, Loader2, AlertTriangle, X, Zap, Star, RefreshCw,
} from "lucide-react";
import MainLayout from "../layouts/MainLayout";
import api from "../services/api";
import { ACTIVITY_TYPES, ACTIVITY_RESULTS } from "../constants/abm";

// Queue action → activity type to log when it's done
const ACTION_TO_ACTIVITY = {
  "Send Email 1": "Cold Email 1",
  "Send Email 2": "Cold Email 2",
  "LinkedIn Connect": "LinkedIn Connect",
  "Send LinkedIn Message": "LinkedIn Message",
  "Send WhatsApp": "WhatsApp",
  Call: "Direct Call",
  "Follow-up": "Follow-up",
  "Follow up on Proposal": "Follow-up",
  "Schedule Meeting": "Meeting",
  "Hold Meeting & Log Outcome": "Meeting",
  "Send Proposal": "Proposal Sent",
};

const input =
  "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 outline-none focus:ring-2 focus:ring-[#9b2423]/40";

export default function AbmToday() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [logTargets, setLogTargets] = useState(null); // array of queue items being logged
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [logForm, setLogForm] = useState({
    activity_type: "Cold Email 1", result: "Sent",
    activity_date: new Date().toISOString().split("T")[0], notes: "",
  });

  const flash = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/abm/queue", { params: { limit: 200 } });
      setItems(res.data.items);
      setTotal(res.data.total);
      setSetupNeeded(false);
      setSelected(new Set());
    } catch (err) {
      if (err.response?.data?.code === "ABM_MIGRATION_REQUIRED") setSetupNeeded(true);
      else console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  const groups = useMemo(() => {
    const g = {};
    items.forEach((it) => {
      (g[it.action] = g[it.action] || []).push(it);
    });
    return Object.entries(g).sort((a, b) => b[1].length - a[1].length);
  }, [items]);

  const toggle = (cid) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(cid) ? next.delete(cid) : next.add(cid);
      return next;
    });

  const openLog = (targets) => {
    const action = targets[0]?.action;
    const sameAction = targets.every((t) => t.action === action);
    setLogForm((f) => ({
      ...f,
      activity_type: (sameAction && ACTION_TO_ACTIVITY[action]) || "Follow-up",
      result: action === "Schedule Meeting" ? "Meeting Fixed" : "Sent",
      notes: "",
    }));
    setError("");
    setLogTargets(targets);
  };

  const submitLog = async () => {
    setSaving(true);
    setError("");
    try {
      await api.post("/abm/activities", {
        ...logForm,
        contact_ids: logTargets.map((t) => t.contact_id),
      });
      flash(`Logged "${logForm.activity_type}" for ${logTargets.length} contact${logTargets.length > 1 ? "s" : ""}`);
      setLogTargets(null);
      fetchQueue();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to log activity");
    } finally {
      setSaving(false);
    }
  };

  const selectedItems = items.filter((it) => selected.has(it.contact_id));

  return (
    <MainLayout>
      {toast && (
        <div className="fixed top-5 right-5 z-[99] bg-emerald-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-3">
            <CalendarCheck className="text-[#9b2423]" size={28} /> Today's Queue
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {total} follow-ups due{total > items.length ? ` · showing top ${items.length} by priority` : ""} — log each touch as you complete it
          </p>
        </div>
        <button
          onClick={fetchQueue}
          className="inline-flex items-center gap-2 border border-gray-200 hover:border-[#9b2423]/40 bg-white text-gray-700 font-semibold text-sm px-4 py-2.5 rounded-xl transition"
        >
          <RefreshCw size={14} /> Refresh
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

      {selected.size > 0 && (
        <div className="sticky top-2 z-30 bg-gray-900 text-white rounded-2xl px-4 py-3 mb-4 flex items-center gap-3 shadow-lg">
          <span className="text-sm font-semibold">{selected.size} selected</span>
          <button
            onClick={() => openLog(selectedItems)}
            className="inline-flex items-center gap-1.5 bg-[#9b2423] hover:bg-[#b52d2c] text-white text-sm font-semibold px-3.5 py-1.5 rounded-lg transition"
          >
            <Zap size={14} /> Log for all
          </button>
          <button onClick={() => setSelected(new Set())} className="text-sm text-gray-300 hover:text-white ml-auto">
            Clear
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24 text-gray-400 gap-2">
          <Loader2 size={20} className="animate-spin" /> Building your queue…
        </div>
      ) : !setupNeeded && items.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
          <CalendarCheck size={40} className="mx-auto text-emerald-400 mb-3" />
          <p className="text-gray-600 font-semibold">All caught up 🎉</p>
          <p className="text-sm text-gray-400 mt-1">
            Nothing is due today. Add contacts or check back tomorrow.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(([action, group]) => (
            <div key={action} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b bg-gray-50/60">
                <h2 className="font-bold text-sm">
                  {action} <span className="text-gray-400 font-medium">({group.length})</span>
                </h2>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        const all = group.every((g) => next.has(g.contact_id));
                        group.forEach((g) => (all ? next.delete(g.contact_id) : next.add(g.contact_id)));
                        return next;
                      })
                    }
                    className="text-xs font-semibold text-gray-500 hover:text-[#9b2423]"
                  >
                    Select all
                  </button>
                  <button
                    onClick={() => openLog(group)}
                    className="text-xs font-semibold text-[#9b2423] hover:underline"
                  >
                    Log all {group.length} done
                  </button>
                </div>
              </div>
              <div>
                {group.map((it) => (
                  <div
                    key={it.contact_id}
                    className={`flex items-center gap-3 px-5 py-2.5 border-b last:border-0 hover:bg-gray-50 transition ${
                      selected.has(it.contact_id) ? "bg-red-50/40" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(it.contact_id)}
                      onChange={() => toggle(it.contact_id)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
                        {it.decision_maker && <Star size={12} className="text-amber-500 fill-amber-400 flex-shrink-0" />}
                        <span className="truncate">{it.contact_name}</span>
                        <span className="text-gray-400 font-normal truncate">· {it.designation || "—"}</span>
                      </div>
                      <div className="text-xs text-gray-400">
                        <Link to={`/abm/accounts/${it.account_id}`} className="text-gray-500 hover:text-[#9b2423] font-medium">
                          {it.account_name}
                        </Link>
                        {it.country ? ` · ${it.country}` : ""}{it.tier ? ` · ${it.tier}` : ""}
                        {" · "}{it.contact_status}
                      </div>
                    </div>
                    {it.overdue_days > 0 && (
                      <span className="text-[11px] font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full flex-shrink-0">
                        {it.overdue_days}d overdue
                      </span>
                    )}
                    {it.manual && (
                      <span className="text-[11px] font-semibold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full flex-shrink-0">
                        manual
                      </span>
                    )}
                    <button
                      onClick={() => openLog([it])}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-[#9b2423] hover:bg-[#7d1d1c] px-3 py-1.5 rounded-lg transition flex-shrink-0"
                    >
                      <Zap size={12} /> Done
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Log modal */}
      {logTargets && (
        <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-6">
          <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b z-10">
              <h2 className="text-lg font-bold">
                Log — {logTargets.length} contact{logTargets.length > 1 ? "s" : ""}
              </h2>
              <button onClick={() => setLogTargets(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              {error && (
                <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl border border-red-200 mb-4">
                  {error}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Activity</label>
                  <select value={logForm.activity_type} onChange={(e) => setLogForm({ ...logForm, activity_type: e.target.value })} className={input}>
                    {ACTIVITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Result</label>
                  <select value={logForm.result} onChange={(e) => setLogForm({ ...logForm, result: e.target.value })} className={input}>
                    {ACTIVITY_RESULTS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Date</label>
                  <input type="date" value={logForm.activity_date} onChange={(e) => setLogForm({ ...logForm, activity_date: e.target.value })} className={input} />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Notes</label>
                  <textarea rows={2} value={logForm.notes} onChange={(e) => setLogForm({ ...logForm, notes: e.target.value })} className={input} placeholder="Optional" />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={submitLog}
                  disabled={saving}
                  className="flex-1 inline-flex items-center justify-center gap-2 bg-[#9b2423] hover:bg-[#7d1d1c] disabled:opacity-60 text-white font-semibold text-sm px-4 py-3 rounded-xl transition"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                  Log Activity
                </button>
                <button onClick={() => setLogTargets(null)} className="px-5 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
}
