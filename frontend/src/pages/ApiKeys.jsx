import { useEffect, useMemo, useState } from "react";
import MainLayout from "../layouts/MainLayout";
import api from "../services/api";
import { KeyRound, Loader2, Plus, Copy, Check, Ban, ShieldAlert } from "lucide-react";
import useAuthStore from "../store/authStore";
import { isSuperAdmin, getTeam } from "../constants/roles";

const inputCls =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 outline-none focus:ring-2 focus:ring-[#9b2423]/40";

const STATUS_CLS = {
  Active: "bg-emerald-50 text-emerald-700",
  Revoked: "bg-gray-100 text-gray-500",
  Expired: "bg-amber-50 text-amber-700",
};

const fmt = (value) =>
  value ? new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";

export default function ApiKeys() {
  const me = useAuthStore((s) => s.user);

  const [keys, setKeys] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notEnabled, setNotEnabled] = useState(false);

  const [name, setName] = useState("");
  const [userId, setUserId] = useState("");
  const [readOnly, setReadOnly] = useState(true);
  const [expiresInDays, setExpiresInDays] = useState("");
  const [creating, setCreating] = useState(false);

  // Held in state rather than shown in the list, because this is the only
  // moment the secret exists anywhere the user can read it.
  const [minted, setMinted] = useState(null);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState(null);

  const load = async () => {
    setError("");
    try {
      const [keyRes, userRes] = await Promise.all([api.get("/api-keys"), api.get("/users")]);
      setKeys(keyRes.data || []);
      // The same rule the server enforces. /users deliberately includes Super
      // Admins so they stay visible in the admin panel, but offering one here
      // would be offering a choice that is always refused.
      setUsers(
        (userRes.data || []).filter(
          (u) => u.active && (isSuperAdmin(me) || getTeam(u) === getTeam(me))
        )
      );
      setNotEnabled(false);
    } catch (err) {
      if (err.response?.status === 501) setNotEnabled(true);
      else setError(err.response?.data?.message || "Failed to load API keys");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const createKey = async () => {
    if (!name.trim()) return setError("Give the key a name");
    if (!userId) return setError("Choose which user the key acts as");
    setCreating(true);
    setError("");
    try {
      const res = await api.post("/api-keys", {
        name: name.trim(),
        user_id: userId,
        read_only: readOnly,
        expires_in_days: expiresInDays === "" ? null : Number(expiresInDays),
      });
      setMinted(res.data);
      setCopied(false);
      setName("");
      setExpiresInDays("");
      load();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to create API key");
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (key) => {
    // Irreversible, and it stops whatever is using the key mid-flight.
    if (!window.confirm(`Revoke "${key.name}"? Anything using it stops working within 30 seconds.`)) return;
    setRevokingId(key.id);
    setError("");
    try {
      await api.delete(`/api-keys/${key.id}`);
      load();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to revoke key");
    } finally {
      setRevokingId(null);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(minted.key);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const activeCount = useMemo(() => keys.filter((k) => k.status === "Active").length, [keys]);

  return (
    <MainLayout>
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-3">
          <KeyRound className="text-[#9b2423]" size={28} /> API Keys
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Long-lived credentials for scripts and agents · {keys.length} total, {activeCount} active
        </p>
      </div>

      {notEnabled ? (
        <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
          <ShieldAlert size={30} className="mx-auto mb-3 text-amber-500" />
          <p className="font-semibold">API keys are not enabled yet</p>
          <p className="text-sm text-gray-500 mt-2">
            Run <code className="bg-gray-100 px-1.5 py-0.5 rounded">database/api-keys-migration.sql</code> in
            Supabase, then restart the backend.
          </p>
        </div>
      ) : (
        <>
          {error && (
            <div className="mb-4 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl border border-red-200 flex items-start justify-between gap-3">
              <span>{error}</span>
              <button onClick={() => setError("")} className="text-red-400 hover:text-red-600 font-bold flex-shrink-0">✕</button>
            </div>
          )}

          {/* THE SECRET — shown once, never again */}
          {minted && (
            <div className="mb-6 bg-white rounded-2xl shadow-sm border-2 border-[#9b2423]/30 p-5">
              <p className="font-semibold text-sm text-[#9b2423] mb-1">{minted.warning}</p>
              <p className="text-xs text-gray-500 mb-3">
                Only its hash is stored. If you lose this, revoke the key and mint a new one.
              </p>
              <div className="flex items-stretch gap-2">
                <code className="flex-1 bg-gray-900 text-emerald-300 text-xs sm:text-sm px-4 py-3 rounded-xl break-all font-mono">
                  {minted.key}
                </code>
                <button
                  onClick={copy}
                  className="px-4 rounded-xl bg-[#9b2423] hover:bg-[#7d1d1c] text-white text-sm font-semibold flex items-center gap-2 flex-shrink-0"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <button
                onClick={() => setMinted(null)}
                className="mt-3 text-xs font-semibold text-gray-500 hover:text-gray-700"
              >
                I've saved it — hide this
              </button>
            </div>
          )}

          {/* CREATE */}
          <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm mb-6">
            <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
              <Plus size={18} className="text-[#9b2423]" /> New API Key
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Name</label>
                <input
                  placeholder="e.g. Reporting agent"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Acts as</label>
                <select value={userId} onChange={(e) => setUserId(e.target.value)} className={inputCls}>
                  <option value="">Choose a user…</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} — {u.role}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-400 mt-1.5">
                  This user's role is the key's permission boundary. Pick the least privileged one that works.
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                  Expires in <span className="font-normal text-gray-400">· optional</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="3650"
                  placeholder="days — blank means never"
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div className="flex items-center">
                <label className="flex items-start gap-3 cursor-pointer mt-5">
                  <input
                    type="checkbox"
                    checked={readOnly}
                    onChange={(e) => setReadOnly(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-[#9b2423]"
                  />
                  <span>
                    <span className="text-sm font-semibold">Read-only</span>
                    <span className="block text-[11px] text-gray-400">
                      Blocks anything that isn't a GET. Leave this on unless the agent must write.
                    </span>
                  </span>
                </label>
              </div>
            </div>

            <button
              onClick={createKey}
              disabled={creating}
              className="inline-flex items-center justify-center gap-2 bg-[#9b2423] hover:bg-[#7d1d1c] disabled:opacity-60 text-white font-semibold text-sm px-6 py-3 rounded-xl mt-5 w-full sm:w-auto"
            >
              {creating ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
              Create Key
            </button>
          </div>

          {/* LIST */}
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
              <Loader2 size={18} className="animate-spin" /> Loading keys…
            </div>
          ) : keys.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm p-10 text-center text-gray-400">
              <KeyRound size={28} className="mx-auto mb-2 text-gray-300" />
              No API keys yet
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm overflow-x-auto">
              <table className="w-full text-sm min-w-[860px]">
                <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-400">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Name</th>
                    <th className="px-4 py-3 font-semibold">Key</th>
                    <th className="px-4 py-3 font-semibold">Acts as</th>
                    <th className="px-4 py-3 font-semibold">Scope</th>
                    <th className="px-4 py-3 font-semibold">Last used</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => (
                    <tr key={k.id} className="border-t border-gray-50 hover:bg-gray-50/60">
                      <td className="px-5 py-3">
                        <span className="font-medium">{k.name}</span>
                        <span className="block text-[11px] text-gray-400">
                          by {k.created_by_name || "unknown"} · {fmt(k.created_at)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <code className="text-xs text-gray-500 font-mono">{k.key_prefix}…</code>
                      </td>
                      <td className="px-4 py-3">
                        {k.acts_as ? (
                          <>
                            <span className="text-gray-700">{k.acts_as.name}</span>
                            <span className="block text-[11px] text-gray-400">{k.acts_as.role}</span>
                          </>
                        ) : (
                          <span className="text-gray-400">deleted user</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                            k.read_only ? "bg-blue-50 text-blue-700" : "bg-orange-50 text-orange-700"
                          }`}
                        >
                          {k.read_only ? "Read-only" : "Read & write"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{fmt(k.last_used_at)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                            STATUS_CLS[k.status] || "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {k.status}
                        </span>
                        {k.expires_at && k.status === "Active" && (
                          <span className="block text-[11px] text-gray-400 mt-0.5">
                            until {fmt(k.expires_at)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {k.status === "Revoked" ? (
                          <span className="text-xs text-gray-400">Revoked {fmt(k.revoked_at)}</span>
                        ) : (
                          <button
                            onClick={() => revoke(k)}
                            disabled={revokingId === k.id}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-white border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                          >
                            <Ban size={13} />
                            {revokingId === k.id ? "…" : "Revoke"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-gray-400 mt-4">
            Send a key as <code className="bg-gray-100 px-1.5 py-0.5 rounded">Authorization: Bearer &lt;key&gt;</code>.
            Keys work on the REST API only, not the realtime socket. Signed in as {me?.name}.
          </p>
        </>
      )}
    </MainLayout>
  );
}
