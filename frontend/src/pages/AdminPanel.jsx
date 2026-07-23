import { useEffect, useMemo, useState } from "react";
import { UserPlus, Users, Search, Loader2, ShieldCheck } from "lucide-react";
import MainLayout from "../layouts/MainLayout";
import api from "../services/api";

const roleChip = {
  Admin: "bg-[#9b2423]/10 text-[#9b2423]",
  "Team Member": "bg-blue-50 text-blue-700",
  User: "bg-gray-100 text-gray-600",
};

const avatarColor = (name = "") => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return `hsl(${Math.abs(h) % 360}, 45%, 45%)`;
};

const initials = (name = "") =>
  name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

export default function AdminPanel() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("User");
  const [division, setDivision] = useState("CPS");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState(null);

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
      await api.post("/users", { name, email, password, role, division });
      setName("");
      setEmail("");
      setPassword("");
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to create user");
    } finally {
      setSaving(false);
    }
  };

  const toggleUser = async (user) => {
    setBusyId(user.id);
    try {
      await api.put(`/users/${user.id}`, { active: !user.active });
      fetchUsers();
    } catch (err) {
      console.error(err);
    } finally {
      setBusyId(null);
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
              <option>Admin</option>
              <option>Team Member</option>
              <option>User</option>
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
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${roleChip[user.role] || roleChip.User}`}>{user.role}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{user.division}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${user.active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                        {user.active ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
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
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${roleChip[user.role] || roleChip.User}`}>{user.role}</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{user.division}</span>
                  </div>
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
                </div>
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
