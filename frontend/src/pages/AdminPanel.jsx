import { useEffect, useMemo, useState } from "react";
import { UserPlus, Users, Search, Loader2, ShieldCheck } from "lucide-react";
import MainLayout from "../layouts/MainLayout";
import api from "../services/api";
import useAuthStore from "../store/authStore";
import { ROLE_OPTIONS, ALL_ROLES, isSuperAdmin, getTeam } from "../constants/roles";

const roleChipClass = (role = "") => {
  if (role === "Super Admin") return "bg-purple-100 text-purple-700";
  if (role.startsWith("Admin")) return "bg-[#9b2423]/10 text-[#9b2423]";
  if (role.startsWith("Team Member")) return "bg-blue-50 text-blue-700";
  return "bg-gray-100 text-gray-600";
};

const avatarColor = (name = "") => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return `hsl(${Math.abs(h) % 360}, 45%, 45%)`;
};

const initials = (name = "") =>
  name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

export default function AdminPanel() {
  const me = useAuthStore((state) => state.user);

  // Role changes are Super-Admin-only on the server; team admins get a
  // read-only chip rather than a control that would always be rejected.
  const canChangeRole = isSuperAdmin(me);

  // Mirrors canManage on the server. Team admins can now *see* Super Admins
  // (they need to be assignable), but every write against them is rejected —
  // so the row's actions are hidden rather than offered and then refused.
  const canManageUser = (u) =>
    isSuperAdmin(me) || getTeam({ role: u?.role }) === getTeam(me);

  // The create form must only offer roles the server will accept.
  const creatableRoleGroups = isSuperAdmin(me)
    ? ROLE_OPTIONS
    : ROLE_OPTIONS.map((g) => ({
        ...g,
        roles: g.roles.filter((r) => getTeam({ role: r }) === getTeam(me)),
      })).filter((g) => g.roles.length);

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Keep the historical default where it is still creatable; a Service admin
  // would otherwise have their very first create rejected by the server.
  const [role, setRole] = useState(() => {
    const creatable = creatableRoleGroups.flatMap((g) => g.roles);
    return creatable.includes("User - MKTG") ? "User - MKTG" : creatable[0] || "User - MKTG";
  });
  const [division, setDivision] = useState("CPS");
  // Job title, not a permissions label. It is what prints under the signature
  // on an approved expense document, so an admin sets it, not the person.
  const [designation, setDesignation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [resettingId, setResettingId] = useState(null);
  const [notice, setNotice] = useState("");
  // Separate from `error`, which renders inside the Create User card at the top
  // of the page — a row action's failure shown there reads as a create failure
  // and is usually scrolled off screen.
  const [rowError, setRowError] = useState("");
  // Bumped when a designation fails to save. Without it the box keeps the
  // rejected text — the stored value did not change, so the remount key below
  // would not change either, and a title nobody saved would sit there looking
  // saved.
  const [designationTick, setDesignationTick] = useState(0);

  const fetchUsers = async () => {
    try {
      const res = await api.get("/users");
      setUsers(res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const createUser = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError("Name, email and password are required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.post("/users", { name, email, password, role, division, designation: designation.trim() });
      setName("");
      setEmail("");
      setPassword("");
      setDesignation("");
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to create user");
    } finally {
      setSaving(false);
    }
  };

  const toggleUser = async (user) => {
    setBusyId(user.id);
    setRowError("");
    try {
      await api.put(`/users/${user.id}`, { active: !user.active });
      fetchUsers();
    } catch (err) {
      setRowError(err.response?.data?.message || "Failed to update user");
    } finally {
      setBusyId(null);
    }
  };

  // Reassign a user's role/team (also how legacy roles get normalised).
  // Only a Super Admin may do this, so a rejection here has to be shown —
  // the select is controlled, and a silent failure just snaps it back to the
  // old value with no explanation.
  const changeRole = async (user, newRole) => {
    if (!newRole || newRole === user.role) return;
    setBusyId(user.id);
    setRowError("");
    try {
      await api.put(`/users/${user.id}`, { role: newRole });
      fetchUsers();
    } catch (err) {
      setRowError(err.response?.data?.message || "Failed to change role");
      // Re-sync from the server so the dropdown reflects what is actually stored.
      fetchUsers();
    } finally {
      setBusyId(null);
    }
  };

  // Saved on blur rather than per keystroke — this is a free-text field edited
  // in place in a table row, and a request per character would be absurd.
  const saveDesignation = async (user, value) => {
    const next = value.trim();
    if (next === (user.designation || "")) return;
    setBusyId(user.id);
    setRowError("");
    try {
      await api.put(`/users/${user.id}`, { designation: next });
      fetchUsers();
    } catch (err) {
      setRowError(err.response?.data?.message || "Failed to save designation");
      setDesignationTick((n) => n + 1);
      fetchUsers();
    } finally {
      setBusyId(null);
    }
  };

  // Email the user a password reset code (they complete it on the login page)
  const sendReset = async (user) => {
    setResettingId(user.id);
    setNotice("");
    try {
      const res = await api.post("/auth/admin-send-reset", { email: user.email });
      setNotice(res.data?.message || `Reset code sent to ${user.email}`);
    } catch (err) {
      setNotice(err?.response?.data?.message || "Failed to send reset code");
    } finally {
      setResettingId(null);
    }
  };

  const filtered = useMemo(
    () =>
      users.filter(
        (u) =>
          !search ||
          u.name?.toLowerCase().includes(search.toLowerCase()) ||
          u.email?.toLowerCase().includes(search.toLowerCase())
      ),
    [users, search]
  );

  const activeCount = users.filter((u) => u.active).length;
  const inputCls =
    "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 outline-none focus:ring-2 focus:ring-[#9b2423]/40";

  return (
    <MainLayout>
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-3">
          <ShieldCheck className="text-[#9b2423]" size={28} /> Admin Panel
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {users.length} users · {activeCount} active
        </p>
      </div>

      {/* CREATE USER */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm mb-6">
        <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
          <UserPlus size={18} className="text-[#9b2423]" /> Create User
        </h2>

        {error && (
          <div className="mb-4 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl border border-red-200">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Name</label>
            <input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Email</label>
            <input type="email" placeholder="you@siegerglobal.net" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Password</label>
            <input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
              {creatableRoleGroups.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.roles.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Division</label>
            <select value={division} onChange={(e) => setDivision(e.target.value)} className={inputCls}>
              <option>CPS</option>
              <option>TMD</option>
              <option>ASTOR</option>
              <option>All User</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
              Designation <span className="font-normal text-gray-400">· optional</span>
            </label>
            <input
              placeholder="e.g. General Manager - Marketing"
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              className={inputCls}
            />
            <p className="text-[11px] text-gray-400 mt-1.5">
              The job title printed under this person's signature on approved expense documents.
            </p>
          </div>
        </div>

        <button
          onClick={createUser}
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 bg-[#9b2423] hover:bg-[#7d1d1c] disabled:opacity-60 text-white font-semibold text-sm px-6 py-3 rounded-xl mt-5 w-full sm:w-auto"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
          Create User
        </button>
      </div>

      {notice && (
        <div className="mb-4 bg-blue-50 text-blue-700 text-sm px-4 py-3 rounded-xl border border-blue-200 flex items-center justify-between gap-3">
          <span>{notice}</span>
          <button onClick={() => setNotice("")} className="text-blue-400 hover:text-blue-600 font-bold flex-shrink-0">✕</button>
        </div>
      )}

      {/* SEARCH */}
      <div className="relative mb-4 max-w-sm">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search users…"
          className="w-full border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-[#9b2423]/40"
        />
      </div>

      {/* A row action's failure, shown next to the rows rather than in the
          Create User card at the top — which is usually scrolled off screen
          and reads as a create failure. */}
      {rowError && (
        <div className="mb-4 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl border border-red-200 flex items-start justify-between gap-3">
          <span>{rowError}</span>
          <button onClick={() => setRowError("")} className="text-red-400 hover:text-red-600 font-bold flex-shrink-0">✕</button>
        </div>
      )}

      {/* USERS */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
          <Loader2 size={18} className="animate-spin" /> Loading users…
        </div>
      ) : (
        <>
          {/* Desktop / tablet: scrollable table */}
          <div className="hidden sm:block bg-white rounded-2xl shadow-sm overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="px-5 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Designation</th>
                  <th className="px-4 py-3 font-semibold">Division</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user) => (
                  <tr key={user.id} className="border-t border-gray-50 hover:bg-gray-50/60">
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-2.5">
                        <span className="w-8 h-8 rounded-full text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0" style={{ background: avatarColor(user.name) }}>
                          {initials(user.name)}
                        </span>
                        <span className="font-medium">{user.name}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{user.email}</td>
                    <td className="px-4 py-3">
                      {canChangeRole ? (
                        <select
                          value={ALL_ROLES.includes(user.role) ? user.role : ""}
                          onChange={(e) => changeRole(user, e.target.value)}
                          disabled={busyId === user.id}
                          className={`text-[11px] font-semibold px-2 py-1 rounded-lg border border-gray-200 outline-none focus:ring-2 focus:ring-[#9b2423]/40 disabled:opacity-50 ${roleChipClass(user.role)}`}
                        >
                          {!ALL_ROLES.includes(user.role) && (
                            <option value="" disabled>{user.role || "—"}</option>
                          )}
                          {ROLE_OPTIONS.map((g) => (
                            <optgroup key={g.group} label={g.group}>
                              {g.roles.map((r) => (
                                <option key={r} value={r}>{r}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      ) : (
                        <span
                          title="Only a Super Admin can change roles"
                          className={`inline-block text-[11px] font-semibold px-2 py-1 rounded-lg ${roleChipClass(user.role)}`}
                        >
                          {user.role || "—"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {canManageUser(user) ? (
                        <input
                          // Re-keyed on the stored value so a refetch (or a
                          // rejected save) resets the box to what is actually saved.
                          key={`${user.id}:${user.designation || ""}:${designationTick}`}
                          defaultValue={user.designation || ""}
                          placeholder="Add title…"
                          disabled={busyId === user.id}
                          onBlur={(e) => saveDesignation(user, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.target.blur();
                            if (e.key === "Escape") {
                              e.target.value = user.designation || "";
                              e.target.blur();
                            }
                          }}
                          className="w-40 text-xs px-2 py-1 rounded-lg border border-transparent hover:border-gray-200 focus:border-gray-200 bg-transparent outline-none focus:ring-2 focus:ring-[#9b2423]/40 disabled:opacity-50 placeholder:text-gray-300"
                        />
                      ) : (
                        <span className="text-xs text-gray-600">{user.designation || "—"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{user.division}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${user.active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                        {user.active ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center justify-end gap-2">
                        {canManageUser(user) ? (
                          <>
                            <button
                              onClick={() => sendReset(user)}
                              disabled={resettingId === user.id || !user.active}
                              title="Email this user a password reset code"
                              className="text-xs font-semibold px-3 py-2 rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                              {resettingId === user.id ? "Sending…" : "Reset PW"}
                            </button>
                            <button
                              onClick={() => toggleUser(user)}
                              disabled={busyId === user.id}
                              className={`text-xs font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50 ${
                                user.active
                                  ? "bg-white border border-red-200 text-red-600 hover:bg-red-50"
                                  : "bg-[#9b2423] hover:bg-[#7d1d1c] text-white"
                              }`}
                            >
                              {busyId === user.id ? "…" : user.active ? "Disable" : "Enable"}
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-gray-400">Not on your team</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards */}
          <div className="sm:hidden space-y-3">
            {filtered.map((user) => (
              <div key={user.id} className="bg-white rounded-2xl shadow-sm p-4">
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-full text-white text-sm font-bold flex items-center justify-center flex-shrink-0" style={{ background: avatarColor(user.name) }}>
                    {initials(user.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate">{user.name}</p>
                    <p className="text-xs text-gray-500 truncate">{user.email}</p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${user.active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                    {user.active ? "Active" : "Disabled"}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-1.5">
                    {canChangeRole ? (
                    <select
                      value={ALL_ROLES.includes(user.role) ? user.role : ""}
                      onChange={(e) => changeRole(user, e.target.value)}
                      disabled={busyId === user.id}
                      className={`text-[10px] font-semibold px-2 py-1 rounded-lg border border-gray-200 outline-none disabled:opacity-50 ${roleChipClass(user.role)}`}
                    >
                      {!ALL_ROLES.includes(user.role) && (
                        <option value="" disabled>{user.role || "—"}</option>
                      )}
                      {ROLE_OPTIONS.map((g) => (
                        <optgroup key={g.group} label={g.group}>
                          {g.roles.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    ) : (
                      <span
                        title="Only a Super Admin can change roles"
                        className={`text-[10px] font-semibold px-2 py-1 rounded-lg ${roleChipClass(user.role)}`}
                      >
                        {user.role || "—"}
                      </span>
                    )}
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{user.division}</span>
                  </div>
                  {canManageUser(user) ? (
                    <button
                      onClick={() => toggleUser(user)}
                      disabled={busyId === user.id}
                      className={`text-xs font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50 ${
                        user.active
                          ? "bg-white border border-red-200 text-red-600"
                          : "bg-[#9b2423] text-white"
                      }`}
                    >
                      {busyId === user.id ? "…" : user.active ? "Disable" : "Enable"}
                    </button>
                  ) : (
                    <span className="text-xs text-gray-400">Not on your team</span>
                  )}
                </div>
                {canManageUser(user) ? (
                  <input
                    key={`${user.id}:${user.designation || ""}:${designationTick}`}
                    defaultValue={user.designation || ""}
                    placeholder="Designation (e.g. General Manager - Marketing)"
                    disabled={busyId === user.id}
                    onBlur={(e) => saveDesignation(user, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.target.blur();
                    }}
                    className="mt-3 w-full text-xs px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 outline-none focus:ring-2 focus:ring-[#9b2423]/40 disabled:opacity-50"
                  />
                ) : (
                  user.designation && (
                    <p className="mt-3 text-xs text-gray-500">{user.designation}</p>
                  )
                )}
                {canManageUser(user) && (
                  <button
                    onClick={() => sendReset(user)}
                    disabled={resettingId === user.id || !user.active}
                    className="mt-2 w-full text-xs font-semibold px-3 py-2 rounded-lg bg-white border border-gray-200 text-gray-700 disabled:opacity-50"
                  >
                    {resettingId === user.id ? "Sending reset code…" : "Reset Password"}
                  </button>
                )}
              </div>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="bg-white rounded-2xl shadow-sm p-10 text-center text-gray-400">
              <Users size={28} className="mx-auto mb-2 text-gray-300" />
              No users match your search
            </div>
          )}
        </>
      )}
    </MainLayout>
  );
}
