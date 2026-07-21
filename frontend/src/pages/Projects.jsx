import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  FolderKanban,
  Plus,
  CalendarDays,
  Loader2,
  X,
  AlertTriangle,
  CheckCircle2,
  Users,
} from "lucide-react";
import MainLayout from "../layouts/MainLayout";
import api from "../services/api";
import socket from "../services/socket";
import useAuthStore from "../store/authStore";
import { TICKET_DIVISIONS } from "../constants/divisions";

// Deterministic pastel per name for member avatars
export const avatarColor = (name = "") => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360}, 55%, 45%)`;
};

export const daysLeft = (dateStr) => {
  if (!dateStr) return null;
  const diff = Math.ceil(
    (new Date(dateStr).setHours(23, 59, 59) - Date.now()) / 86400000
  );
  return diff;
};

export function TargetChip({ date }) {
  const d = daysLeft(date);
  if (d === null)
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
        <CalendarDays size={12} /> No target
      </span>
    );
  const cls =
    d < 0
      ? "bg-red-100 text-red-700"
      : d <= 7
      ? "bg-amber-100 text-amber-700"
      : "bg-emerald-100 text-emerald-700";
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${cls}`}>
      <CalendarDays size={12} />
      {d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? "Due today" : `${d}d left`} · {date}
    </span>
  );
}

export function ProgressBar({ value, small }) {
  return (
    <div className={`w-full bg-gray-100 rounded-full overflow-hidden ${small ? "h-1.5" : "h-2"}`}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{
          width: `${value}%`,
          background: value >= 100 ? "#059669" : "#9b2423",
        }}
      />
    </div>
  );
}

export function MemberAvatars({ members, max = 4 }) {
  const shown = (members || []).slice(0, max);
  const extra = (members || []).length - shown.length;
  return (
    <div className="flex -space-x-2">
      {shown.map((m) => (
        <div
          key={m.id}
          title={m.name}
          className="w-7 h-7 rounded-full border-2 border-white text-white text-[10px] font-bold flex items-center justify-center"
          style={{ background: avatarColor(m.name) }}
        >
          {m.name?.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
        </div>
      ))}
      {extra > 0 && (
        <div className="w-7 h-7 rounded-full border-2 border-white bg-gray-200 text-gray-600 text-[10px] font-bold flex items-center justify-center">
          +{extra}
        </div>
      )}
    </div>
  );
}

const statusChip = {
  Active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  "On Hold": "bg-amber-50 text-amber-700 border-amber-200",
  Completed: "bg-blue-50 text-blue-700 border-blue-200",
  Archived: "bg-gray-100 text-gray-500 border-gray-200",
};

export default function Projects() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [projects, setProjects] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Create form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [division, setDivision] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [memberIds, setMemberIds] = useState([]);

  const canCreate = user?.role !== "Team Member";

  const fetchProjects = async () => {
    try {
      const res = await api.get("/projects");
      setProjects(res.data || []);
      setSetupNeeded(false);
    } catch (err) {
      if (err.response?.data?.code === "PROJECTS_MIGRATION_REQUIRED") {
        setSetupNeeded(true);
      } else {
        console.error(err);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
    api.get("/projects/meta/members").then((r) => setAllUsers(r.data || [])).catch(() => {});
    const refresh = () => fetchProjects();
    socket.on("projectCreated", refresh);
    socket.on("projectUpdated", refresh);
    socket.on("projectDeleted", refresh);
    socket.on("ticketUpdated", refresh);
    socket.on("ticketCreated", refresh);
    return () => {
      socket.off("projectCreated", refresh);
      socket.off("projectUpdated", refresh);
      socket.off("projectDeleted", refresh);
      socket.off("ticketUpdated", refresh);
      socket.off("ticketCreated", refresh);
    };
  }, []);

  const membersById = useMemo(() => {
    const map = {};
    allUsers.forEach((u) => (map[u.id] = u));
    return map;
  }, [allUsers]);

  const toggleMember = (id) =>
    setMemberIds((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );

  const createProject = async () => {
    if (!name.trim()) {
      setError("Project name is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await api.post("/projects", {
        name,
        description,
        target_date: targetDate || null,
        division: division || null,
        owner: ownerId || null,
        members: memberIds,
      });
      setShowCreate(false);
      setName("");
      setDescription("");
      setTargetDate("");
      setDivision("");
      setOwnerId("");
      setMemberIds([]);
      navigate(`/projects/${res.data.id}`);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to create project");
    } finally {
      setSaving(false);
    }
  };

  return (
    <MainLayout>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-8 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-3">
            <FolderKanban className="text-[#9b2423]" size={28} /> Projects
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Group related tasks under one goal with a shared timeline
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 bg-[#9b2423] hover:bg-[#7d1d1c] text-white font-semibold text-sm px-4 py-2.5 rounded-xl shadow-sm transition"
          >
            <Plus size={16} /> New Project
          </button>
        )}
      </div>

      {setupNeeded && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex items-start gap-3 text-amber-800">
          <AlertTriangle size={20} className="mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold">Projects are not set up in the database yet</p>
            <p className="text-sm mt-1">
              Run <code className="bg-amber-100 px-1.5 py-0.5 rounded">backend/database/projects-migration.sql</code>{" "}
              in the Supabase SQL Editor, then reload this page.
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24 text-gray-400 gap-2">
          <Loader2 size={20} className="animate-spin" /> Loading projects…
        </div>
      ) : !setupNeeded && projects.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
          <FolderKanban size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">No projects yet</p>
          {canCreate && (
            <p className="text-sm text-gray-400 mt-1">
              Create your first project to group related tasks under one goal
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
          {projects.map((p) => (
            <Link
              key={p.id}
              to={`/projects/${p.id}`}
              className="bg-white rounded-2xl shadow-sm hover:shadow-md border border-transparent hover:border-[#9b2423]/20 transition p-5 flex flex-col gap-3 group"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-bold text-base group-hover:text-[#9b2423] transition line-clamp-1">
                  {p.name}
                </h2>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {p.division && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {p.division}
                    </span>
                  )}
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                      statusChip[p.status] || statusChip.Active
                    }`}
                  >
                    {p.status}
                  </span>
                </div>
              </div>

              {p.description && (
                <p className="text-sm text-gray-500 line-clamp-2">{p.description}</p>
              )}

              <div className="flex items-center justify-between gap-2 mt-auto">
                <TargetChip date={p.target_date} />
                {p.stats?.overdue > 0 && (
                  <span className="text-[11px] font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                    {p.stats.overdue} overdue
                  </span>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 size={12} className="text-emerald-600" />
                    {p.stats?.done}/{p.stats?.total} tasks
                  </span>
                  <span className="font-semibold">{p.stats?.progress}%</span>
                </div>
                <ProgressBar value={p.stats?.progress || 0} />
              </div>

              <div className="flex items-center justify-between pt-1">
                <MemberAvatars
                  members={(p.members || []).map((id) => membersById[id]).filter(Boolean)}
                />
                <span className="text-[11px] text-gray-400">by {p.created_by_name}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-6">
          <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-bold">New Project</h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {error && (
                <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl border border-red-200">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Project name <span className="text-red-500">*</span>
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Cold Email Campaign — July"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 outline-none focus:ring-2 focus:ring-[#9b2423]/40"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Description</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What is the final goal of this project?"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 outline-none focus:ring-2 focus:ring-[#9b2423]/40 resize-vertical"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Target date</label>
                  <input
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 outline-none focus:ring-2 focus:ring-[#9b2423]/40"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Division</label>
                  <select
                    value={division}
                    onChange={(e) => setDivision(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 outline-none"
                  >
                    <option value="">— None —</option>
                    {TICKET_DIVISIONS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-xs text-gray-400 -mt-2">
                Task due dates cannot exceed the target date (approved extensions adjust it automatically).
                The division is applied to every task in the project.
              </p>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Project owner
                </label>
                <select
                  value={ownerId}
                  onChange={(e) => setOwnerId(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 outline-none"
                >
                  <option value="">— None —</option>
                  {allUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1.5">
                  The owner sees every task in the project and can manage it, like the creator
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  <span className="inline-flex items-center gap-1.5">
                    <Users size={14} /> Team members
                  </span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {allUsers.map((u) => {
                    const active = memberIds.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => toggleMember(u.id)}
                        className={`text-xs font-medium px-3 py-1.5 rounded-full border transition ${
                          active
                            ? "bg-[#9b2423] text-white border-[#9b2423]"
                            : "bg-white text-gray-600 border-gray-200 hover:border-[#9b2423]/40"
                        }`}
                      >
                        {u.name}
                      </button>
                    );
                  })}
                  {allUsers.length === 0 && (
                    <p className="text-xs text-gray-400">No users available</p>
                  )}
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex gap-3">
              <button
                onClick={createProject}
                disabled={saving}
                className="flex-1 inline-flex items-center justify-center gap-2 bg-[#9b2423] hover:bg-[#7d1d1c] disabled:opacity-60 text-white font-semibold text-sm px-4 py-3 rounded-xl transition"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                Create Project
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
