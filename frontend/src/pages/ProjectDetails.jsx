import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Plus,
  X,
  Loader2,
  CalendarDays,
  Pencil,
  Trash2,
  LayoutGrid,
  GanttChartSquare,
  MoreVertical,
  ExternalLink,
  Users,
  Link2,
  Search,
} from "lucide-react";
import { Gantt, ViewMode } from "gantt-task-react";
import "gantt-task-react/dist/index.css";
import MainLayout from "../layouts/MainLayout";
import api from "../services/api";
import socket from "../services/socket";
import useAuthStore from "../store/authStore";
import { avatarColor, daysLeft, TargetChip, ProgressBar, MemberAvatars } from "./Projects";

const COLUMNS = [
  { key: "todo", label: "To Do", statuses: ["Open"], target: "Open", dot: "#94a3b8" },
  { key: "progress", label: "In Progress", statuses: ["In Progress"], target: "In Progress", dot: "#3b82f6" },
  {
    key: "review",
    label: "Review",
    statuses: ["Waiting For Approval", "Waiting For Sources", "Waiting For Resources"],
    target: "Waiting For Sources",
    dot: "#a855f7",
  },
  { key: "done", label: "Done", statuses: ["Completed", "Closed"], target: "Completed", dot: "#10b981" },
];

const priorityPill = {
  Critical: "bg-red-600 text-white",
  High: "bg-red-100 text-red-700",
  Medium: "bg-amber-100 text-amber-700",
  Low: "bg-emerald-100 text-emerald-700",
};

const statusBadge = {
  "Waiting For Approval": "bg-purple-100 text-purple-700",
  "Waiting For Sources": "bg-orange-100 text-orange-700",
  "Waiting For Resources": "bg-orange-100 text-orange-700",
  Closed: "bg-gray-200 text-gray-600",
};

const dstr = (d) => (d ? String(d).split("T")[0] : null);

export default function ProjectDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "Admin" || user?.role === "Super Admin";

  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState("board");
  const [toast, setToast] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [movingId, setMovingId] = useState(null);
  const [sheetTask, setSheetTask] = useState(null);

  // Add-task modal
  const [showAdd, setShowAdd] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [tTitle, setTTitle] = useState("");
  const [tDesc, setTDesc] = useState("");
  const [tAssignee, setTAssignee] = useState("");
  const [tPriority, setTPriority] = useState("Medium");
  const [tDue, setTDue] = useState("");
  const [taskError, setTaskError] = useState("");
  const [allUsers, setAllUsers] = useState([]);

  // Link-existing-tasks modal
  const [showLink, setShowLink] = useState(false);
  const [linkCandidates, setLinkCandidates] = useState([]);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");
  const [linkSelected, setLinkSelected] = useState([]);
  const [linking, setLinking] = useState(false);

  // Gantt view
  const [ganttView, setGanttView] = useState(ViewMode.Week);

  // Edit-project modal
  const [showEdit, setShowEdit] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
  const [eName, setEName] = useState("");
  const [eDesc, setEDesc] = useState("");
  const [eStatus, setEStatus] = useState("Active");
  const [eTarget, setETarget] = useState("");
  const [eMembers, setEMembers] = useState([]);
  const [editError, setEditError] = useState("");

  const flash = (type, text) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4500);
  };

  const fetchProject = async () => {
    try {
      const res = await api.get(`/projects/${id}`);
      setProject(res.data);
      setNotFound(false);
    } catch (err) {
      if (err.response?.status === 404 || err.response?.status === 403) setNotFound(true);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProject();
    api.get("/projects/meta/members").then((r) => setAllUsers(r.data || [])).catch(() => {});
    const refresh = () => fetchProject();
    socket.on("ticketUpdated", refresh);
    socket.on("ticketCreated", refresh);
    socket.on("projectUpdated", refresh);
    return () => {
      socket.off("ticketUpdated", refresh);
      socket.off("ticketCreated", refresh);
      socket.off("projectUpdated", refresh);
    };
  }, [id]);

  const canEdit = isAdmin || project?.created_by === user?.id;
  const tasks = project?.tasks || [];

  const assigneeOptions = useMemo(() => {
    const members = project?.member_details || [];
    return members.length ? members : allUsers;
  }, [project, allUsers]);

  // ============ MOVE TASK (drag/drop or action sheet) ============
  const moveTask = async (task, targetStatus, columnLabel) => {
    if (task.status === targetStatus) return;
    setMovingId(task.id);
    setSheetTask(null);
    try {
      await api.put(`/tickets/${task.id}`, { status: targetStatus });
      if (targetStatus === "Completed" || targetStatus === "Waiting For Sources") {
        flash("success", `"${task.title}" sent for admin approval`);
      } else {
        flash("success", `"${task.title}" moved to ${columnLabel}`);
      }
      fetchProject();
    } catch (err) {
      flash("error", err.response?.data?.message || "Failed to move task");
    } finally {
      setMovingId(null);
    }
  };

  const onDrop = (e, col) => {
    e.preventDefault();
    setDragOverCol(null);
    const taskId = e.dataTransfer.getData("text/plain");
    const task = tasks.find((t) => t.id === taskId);
    if (task) moveTask(task, col.target, col.label);
  };

  // ============ ADD TASK ============
  const addTask = async () => {
    if (!tTitle.trim() || !tDesc.trim()) {
      setTaskError("Title and description are required");
      return;
    }
    if (tDue && project?.target_date && tDue > project.target_date && !isAdmin) {
      setTaskError(`Due date cannot exceed the project target date (${project.target_date})`);
      return;
    }
    setSavingTask(true);
    setTaskError("");
    try {
      await api.post("/tickets", {
        title: tTitle,
        description: tDesc,
        priority: tPriority,
        assigned_to: tAssignee || null,
        due_date: tDue || null,
        project_id: project.id,
        division: null,
        category: null,
      });
      setShowAdd(false);
      setTTitle(""); setTDesc(""); setTAssignee(""); setTPriority("Medium"); setTDue("");
      flash("success", "Task created");
      fetchProject();
    } catch (err) {
      setTaskError(err.response?.data?.message || "Failed to create task");
    } finally {
      setSavingTask(false);
    }
  };

  // ============ EDIT PROJECT ============
  const openEdit = () => {
    setEName(project.name);
    setEDesc(project.description || "");
    setEStatus(project.status || "Active");
    setETarget(dstr(project.target_date) || "");
    setEMembers(project.members || []);
    setEditError("");
    setShowEdit(true);
  };

  const saveProject = async () => {
    setSavingProject(true);
    setEditError("");
    try {
      await api.put(`/projects/${project.id}`, {
        name: eName,
        description: eDesc,
        status: eStatus,
        target_date: eTarget || null,
        members: eMembers,
      });
      setShowEdit(false);
      flash("success", "Project updated");
      fetchProject();
    } catch (err) {
      setEditError(err.response?.data?.message || "Failed to update project");
    } finally {
      setSavingProject(false);
    }
  };

  const deleteProject = async () => {
    if (!window.confirm("Delete this project? Tasks will be kept as normal tickets.")) return;
    try {
      await api.delete(`/projects/${project.id}`);
      navigate("/projects");
    } catch (err) {
      flash("error", err.response?.data?.message || "Failed to delete project");
    }
  };

  const colForStatus = (status) =>
    COLUMNS.find((c) => c.statuses.includes(status)) || COLUMNS[0];

  // ============ LINK EXISTING TASKS ============
  const openLinkModal = async () => {
    setShowLink(true);
    setLinkSelected([]);
    setLinkSearch("");
    setLinkLoading(true);
    try {
      const res = await api.get("/tickets");
      setLinkCandidates((res.data || []).filter((t) => !t.project_id));
    } catch (err) {
      flash("error", "Failed to load tickets");
    } finally {
      setLinkLoading(false);
    }
  };

  const linkTasks = async () => {
    if (!linkSelected.length) return;
    setLinking(true);
    const failed = [];
    for (const tid of linkSelected) {
      try {
        await api.put(`/tickets/${tid}`, { project_id: project.id });
      } catch (err) {
        const t = linkCandidates.find((c) => c.id === tid);
        failed.push(
          `${t?.title || tid}: ${err.response?.data?.message || "failed"}`
        );
      }
    }
    setLinking(false);
    setShowLink(false);
    if (failed.length) {
      flash("error", `Not linked — ${failed[0]}${failed.length > 1 ? ` (+${failed.length - 1} more)` : ""}`);
    } else {
      flash("success", `${linkSelected.length} task${linkSelected.length > 1 ? "s" : ""} added to the project`);
    }
    fetchProject();
  };

  // ============ GANTT DATA ============
  const ganttTasks = useMemo(() => {
    if (!project || !tasks.length) return [];
    const day = 86400000;
    const dOnly = (v) => {
      const d = new Date(dstr(v));
      d.setHours(0, 0, 0, 0);
      return d;
    };
    const starts = tasks.map((t) => dOnly(t.created_at).getTime());
    if (project.created_at) starts.push(dOnly(project.created_at).getTime());
    const minStart = new Date(Math.min(...starts));
    let maxEnd = project.target_date ? dOnly(project.target_date) : null;
    tasks.forEach((t) => {
      if (t.due_date) {
        const e = dOnly(t.due_date);
        if (!maxEnd || e > maxEnd) maxEnd = e;
      }
    });
    if (!maxEnd || maxEnd.getTime() <= minStart.getTime()) {
      maxEnd = new Date(minStart.getTime() + 7 * day);
    }

    const rows = [
      {
        id: `project-${project.id}`,
        name: project.name,
        start: minStart,
        end: maxEnd,
        type: "project",
        progress: project.stats?.progress || 0,
        isDisabled: true,
        hideChildren: false,
        styles: {
          progressColor: "#9b2423",
          progressSelectedColor: "#9b2423",
          backgroundColor: "#d9c0bf",
          backgroundSelectedColor: "#d9c0bf",
        },
      },
    ];

    tasks.forEach((t) => {
      const col = colForStatus(t.status);
      const start = dOnly(t.created_at);
      let end = t.due_date ? dOnly(t.due_date) : new Date(start.getTime() + day);
      if (end.getTime() <= start.getTime()) end = new Date(start.getTime() + day);
      const overdue = t.due_date && col.key !== "done" && daysLeft(dstr(t.due_date)) < 0;
      const color = overdue ? "#dc2626" : col.dot;
      rows.push({
        id: String(t.id),
        name: t.title,
        start,
        end,
        type: "task",
        progress: col.key === "done" ? 100 : col.key === "review" ? 75 : col.key === "progress" ? 50 : 0,
        isDisabled: true,
        project: `project-${project.id}`,
        styles: {
          progressColor: color,
          progressSelectedColor: color,
          backgroundColor: "#e5e7eb",
          backgroundSelectedColor: "#e5e7eb",
        },
      });
    });
    return rows;
  }, [project, tasks]);

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-24 text-gray-400 gap-2">
          <Loader2 size={20} className="animate-spin" /> Loading project…
        </div>
      </MainLayout>
    );
  }

  if (notFound || !project) {
    return (
      <MainLayout>
        <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
          <p className="text-gray-500 font-medium">Project not found or access denied</p>
          <Link to="/projects" className="text-[#9b2423] text-sm font-semibold mt-2 inline-block">
            ← Back to projects
          </Link>
        </div>
      </MainLayout>
    );
  }

  const d = daysLeft(project.target_date);

  return (
    <MainLayout>
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-[95] px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${
            toast.type === "success"
              ? "bg-emerald-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* ===== HEADER ===== */}
      <div className="mb-6">
        <Link to="/projects" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#9b2423] mb-3">
          <ArrowLeft size={15} /> Projects
        </Link>

        <div className="bg-white rounded-2xl shadow-sm p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold">{project.name}</h1>
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
                  {project.status}
                </span>
              </div>
              {project.description && (
                <p className="text-sm text-gray-500 mt-1.5 max-w-2xl">{project.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {canEdit && (
                <button
                  onClick={openEdit}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 border border-gray-200 hover:border-[#9b2423]/40 px-3.5 py-2 rounded-xl transition"
                >
                  <Pencil size={14} /> Edit
                </button>
              )}
              <button
                onClick={openLinkModal}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 border border-gray-200 hover:border-[#9b2423]/40 px-3.5 py-2 rounded-xl transition"
                title="Add existing tickets to this project"
              >
                <Link2 size={14} /> Add Existing
              </button>
              <button
                onClick={() => { setTaskError(""); setShowAdd(true); }}
                className="inline-flex items-center gap-1.5 bg-[#9b2423] hover:bg-[#7d1d1c] text-white text-sm font-semibold px-3.5 py-2 rounded-xl transition"
              >
                <Plus size={15} /> Add Task
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4 flex-wrap mt-5">
            <TargetChip date={dstr(project.target_date)} />
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
              <Users size={13} />
              <MemberAvatars members={project.member_details} max={6} />
            </span>
            <div className="flex items-center gap-2 flex-1 min-w-[180px]">
              <ProgressBar value={project.stats?.progress || 0} small />
              <span className="text-xs font-semibold text-gray-600 whitespace-nowrap">
                {project.stats?.done}/{project.stats?.total} done
              </span>
            </div>
          </div>

          {/* Stage summary */}
          {tasks.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap mt-4 pt-4 border-t border-gray-100">
              {(() => {
                const total = project.stats?.total || 0;
                const done = project.stats?.done || 0;
                const overdueCount = project.stats?.overdue || 0;
                const targetPassed = d !== null && d < 0;
                const health =
                  total > 0 && done === total
                    ? { label: "Complete", cls: "bg-blue-100 text-blue-700" }
                    : targetPassed
                    ? { label: "Overdue", cls: "bg-red-100 text-red-700" }
                    : overdueCount > 0
                    ? { label: "At Risk", cls: "bg-amber-100 text-amber-700" }
                    : { label: "On Track", cls: "bg-emerald-100 text-emerald-700" };
                return (
                  <span className={`text-xs font-bold px-3 py-1 rounded-full ${health.cls}`}>
                    {health.label}
                  </span>
                );
              })()}
              {COLUMNS.map((c) => {
                const n = tasks.filter((t) => c.statuses.includes(t.status)).length;
                return (
                  <span
                    key={c.key}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 bg-gray-50 px-2.5 py-1 rounded-full"
                  >
                    <span className="w-2 h-2 rounded-full" style={{ background: c.dot }} />
                    {c.label} {n}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ===== TABS ===== */}
      <div className="flex items-center gap-2 mb-4">
        {[
          { key: "board", label: "Board", icon: LayoutGrid },
          { key: "gantt", label: "Gantt", icon: GanttChartSquare },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl transition ${
                tab === t.key
                  ? "bg-[#9b2423] text-white shadow-sm"
                  : "bg-white text-gray-600 hover:text-[#9b2423]"
              }`}
            >
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* ===== BOARD ===== */}
      {tab === "board" && (
        <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-4 snap-x items-start">
          {COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => col.statuses.includes(t.status));
            return (
              <div
                key={col.key}
                onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.key); }}
                onDragLeave={() => setDragOverCol(null)}
                onDrop={(e) => onDrop(e, col)}
                className={`flex-shrink-0 w-[272px] sm:flex-1 sm:min-w-[220px] snap-start rounded-2xl p-3 transition border-2 ${
                  dragOverCol === col.key
                    ? "border-[#9b2423]/50 bg-[#9b2423]/5"
                    : "border-transparent bg-black/[0.03]"
                }`}
              >
                <div className="flex items-center justify-between px-1.5 mb-3">
                  <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-500">
                    <span className="w-2 h-2 rounded-full" style={{ background: col.dot }} />
                    {col.label}
                  </span>
                  <span className="text-xs font-semibold text-gray-400 bg-white px-2 py-0.5 rounded-full">
                    {colTasks.length}
                  </span>
                </div>

                <div className="space-y-2.5 min-h-[60px]">
                  {colTasks.map((t) => {
                    const due = dstr(t.due_date);
                    const overdue =
                      due && col.key !== "done" && daysLeft(due) < 0;
                    return (
                      <div
                        key={t.id}
                        draggable={col.key !== "done"}
                        onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}
                        className={`bg-white rounded-xl shadow-sm hover:shadow-md border border-gray-100 p-3.5 cursor-grab active:cursor-grabbing transition group ${
                          movingId === t.id ? "opacity-50" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <Link
                            to={`/tickets/${t.id}`}
                            className="text-sm font-semibold leading-snug hover:text-[#9b2423] transition line-clamp-2"
                          >
                            {t.title}
                          </Link>
                          <button
                            onClick={() => setSheetTask(t)}
                            className="text-gray-300 hover:text-gray-600 flex-shrink-0 -mr-1"
                            title="Move task"
                          >
                            <MoreVertical size={16} />
                          </button>
                        </div>

                        {statusBadge[t.status] && (
                          <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full mt-2 ${statusBadge[t.status]}`}>
                            {t.status}
                          </span>
                        )}

                        <div className="flex items-center justify-between mt-3">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${priorityPill[t.priority] || "bg-gray-100 text-gray-500"}`}>
                              {t.priority || "—"}
                            </span>
                            {due && (
                              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                                overdue ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500"
                              }`}>
                                <CalendarDays size={10} /> {due.slice(5)}
                              </span>
                            )}
                          </div>
                          {t.assigned_to_name && (
                            <div
                              title={t.assigned_to_name}
                              className="w-6 h-6 rounded-full text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0"
                              style={{ background: avatarColor(t.assigned_to_name) }}
                            >
                              {t.assigned_to_name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {colTasks.length === 0 && (
                    <p className="text-xs text-gray-300 text-center py-6">No tasks</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===== GANTT ===== */}
      {tab === "gantt" && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {ganttTasks.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">
              Add tasks to see the project Gantt chart
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 flex-wrap p-3 sm:p-4 border-b border-gray-100">
                <div className="flex items-center gap-1.5">
                  {[
                    { label: "Day", mode: ViewMode.Day },
                    { label: "Week", mode: ViewMode.Week },
                    { label: "Month", mode: ViewMode.Month },
                  ].map((v) => (
                    <button
                      key={v.label}
                      onClick={() => setGanttView(v.mode)}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition ${
                        ganttView === v.mode
                          ? "bg-[#9b2423] text-white"
                          : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  {COLUMNS.map((c) => (
                    <span key={c.key} className="inline-flex items-center gap-1.5 text-[11px] text-gray-500">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: c.dot }} /> {c.label}
                    </span>
                  ))}
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-500">
                    <span className="w-2.5 h-2.5 rounded-sm bg-red-600" /> Overdue
                  </span>
                </div>
              </div>
              <div className="overflow-x-auto project-gantt">
                <Gantt
                  tasks={ganttTasks}
                  viewMode={ganttView}
                  listCellWidth={
                    typeof window !== "undefined" && window.innerWidth < 640 ? "" : "170px"
                  }
                  columnWidth={
                    ganttView === ViewMode.Month ? 180 : ganttView === ViewMode.Week ? 110 : 52
                  }
                  rowHeight={44}
                  barCornerRadius={6}
                  fontSize="12px"
                  todayColor="rgba(59,130,246,0.10)"
                  onDoubleClick={(t) => {
                    if (!String(t.id).startsWith("project-")) navigate(`/tickets/${t.id}`);
                  }}
                />
              </div>
              <p className="text-[11px] text-gray-400 px-4 py-2 border-t border-gray-100">
                Bar fill shows task progress by stage · double-click a bar to open the ticket
              </p>
            </>
          )}
        </div>
      )}

      {/* ===== MOVE SHEET (mobile-friendly) ===== */}
      {sheetTask && (
        <div
          className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setSheetTask(null)}
        >
          <div
            className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl shadow-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <p className="font-bold text-sm line-clamp-1 pr-3">{sheetTask.title}</p>
              <button onClick={() => setSheetTask(null)} className="text-gray-400">
                <X size={18} />
              </button>
            </div>
            <Link
              to={`/tickets/${sheetTask.id}`}
              className="flex items-center gap-2 w-full text-sm font-medium text-gray-700 px-4 py-3 rounded-xl hover:bg-gray-50 border border-gray-100 mb-2"
            >
              <ExternalLink size={15} /> Open ticket
            </Link>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 px-1 mt-3 mb-1.5">
              Move to
            </p>
            <div className="space-y-1.5">
              {COLUMNS.filter((c) => !c.statuses.includes(sheetTask.status)).map((c) => (
                <button
                  key={c.key}
                  onClick={() => moveTask(sheetTask, c.target, c.label)}
                  className="flex items-center gap-2 w-full text-sm font-medium text-gray-700 px-4 py-3 rounded-xl hover:bg-gray-50 border border-gray-100"
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: c.dot }} />
                  {c.label}
                  {c.key === "done" || c.key === "review" ? (
                    <span className="text-[10px] text-gray-400 ml-auto">needs approval</span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== LINK EXISTING TASKS MODAL ===== */}
      {showLink && (
        <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-6">
          <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-bold">Add Existing Tasks</h2>
              <button onClick={() => setShowLink(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="px-6 pt-4">
              <div className="relative">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={linkSearch}
                  onChange={(e) => setLinkSearch(e.target.value)}
                  placeholder="Search tickets…"
                  className="w-full border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm bg-gray-50 outline-none focus:ring-2 focus:ring-[#9b2423]/40"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2 min-h-[120px]">
              {linkLoading ? (
                <div className="flex items-center justify-center py-10 text-gray-400 gap-2">
                  <Loader2 size={17} className="animate-spin" /> Loading tickets…
                </div>
              ) : (
                (() => {
                  const q = linkSearch.toLowerCase();
                  const filtered = linkCandidates.filter(
                    (t) =>
                      !q ||
                      t.title?.toLowerCase().includes(q) ||
                      t.assigned_to_name?.toLowerCase().includes(q)
                  );
                  if (!filtered.length)
                    return (
                      <p className="text-sm text-gray-400 text-center py-10">
                        {linkCandidates.length === 0
                          ? "No unassigned tickets available"
                          : "No tickets match your search"}
                      </p>
                    );
                  return filtered.map((t) => {
                    const checked = linkSelected.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() =>
                          setLinkSelected((prev) =>
                            prev.includes(t.id)
                              ? prev.filter((x) => x !== t.id)
                              : [...prev, t.id]
                          )
                        }
                        className={`w-full text-left border rounded-xl px-4 py-3 transition ${
                          checked
                            ? "border-[#9b2423] bg-[#9b2423]/5"
                            : "border-gray-100 hover:border-gray-200"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold line-clamp-1">{t.title}</p>
                          <span
                            className={`w-[18px] h-[18px] rounded-md border flex items-center justify-center flex-shrink-0 ${
                              checked ? "bg-[#9b2423] border-[#9b2423]" : "border-gray-300"
                            }`}
                          >
                            {checked && <span className="text-white text-[10px] font-bold">✓</span>}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {t.status}
                          {t.assigned_to_name ? ` · ${t.assigned_to_name}` : ""}
                          {t.due_date ? ` · due ${dstr(t.due_date)}` : ""}
                        </p>
                      </button>
                    );
                  });
                })()
              )}
            </div>

            <div className="border-t px-6 py-4 flex gap-3">
              <button
                onClick={linkTasks}
                disabled={linking || linkSelected.length === 0}
                className="flex-1 inline-flex items-center justify-center gap-2 bg-[#9b2423] hover:bg-[#7d1d1c] disabled:opacity-50 text-white font-semibold text-sm px-4 py-3 rounded-xl transition"
              >
                {linking ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={15} />}
                Add {linkSelected.length > 0 ? `${linkSelected.length} ` : ""}to Project
              </button>
              <button
                onClick={() => setShowLink(false)}
                className="px-5 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== ADD TASK MODAL ===== */}
      {showAdd && (
        <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-6">
          <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-bold">Add Task</h2>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {taskError && (
                <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl border border-red-200">
                  {taskError}
                </div>
              )}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  value={tTitle}
                  onChange={(e) => setTTitle(e.target.value)}
                  placeholder="e.g., Collect product photos and videos"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 outline-none focus:ring-2 focus:ring-[#9b2423]/40"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={tDesc}
                  onChange={(e) => setTDesc(e.target.value)}
                  placeholder="What exactly needs to be delivered?"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 outline-none focus:ring-2 focus:ring-[#9b2423]/40 resize-vertical"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Assign to</label>
                  <select
                    value={tAssignee}
                    onChange={(e) => setTAssignee(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 outline-none"
                  >
                    <option value="">Unassigned</option>
                    {assigneeOptions.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Priority</label>
                  <select
                    value={tPriority}
                    onChange={(e) => setTPriority(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 outline-none"
                  >
                    <option>Low</option>
                    <option>Medium</option>
                    <option>High</option>
                    <option>Critical</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Due date</label>
                <input
                  type="date"
                  value={tDue}
                  max={!isAdmin ? dstr(project.target_date) || undefined : undefined}
                  onChange={(e) => setTDue(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 outline-none"
                />
                {project.target_date && (
                  <p className="text-xs text-gray-400 mt-1.5">
                    Project target: {dstr(project.target_date)}
                    {isAdmin
                      ? " — a later date extends the project timeline automatically"
                      : " — task due dates cannot exceed it"}
                  </p>
                )}
              </div>
            </div>
            <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex gap-3">
              <button
                onClick={addTask}
                disabled={savingTask}
                className="flex-1 inline-flex items-center justify-center gap-2 bg-[#9b2423] hover:bg-[#7d1d1c] disabled:opacity-60 text-white font-semibold text-sm px-4 py-3 rounded-xl transition"
              >
                {savingTask ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                Create Task
              </button>
              <button
                onClick={() => setShowAdd(false)}
                className="px-5 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== EDIT PROJECT MODAL ===== */}
      {showEdit && (
        <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-6">
          <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-bold">Edit Project</h2>
              <button onClick={() => setShowEdit(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {editError && (
                <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl border border-red-200">
                  {editError}
                </div>
              )}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Name</label>
                <input
                  value={eName}
                  onChange={(e) => setEName(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 outline-none focus:ring-2 focus:ring-[#9b2423]/40"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Description</label>
                <textarea
                  rows={3}
                  value={eDesc}
                  onChange={(e) => setEDesc(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 outline-none focus:ring-2 focus:ring-[#9b2423]/40 resize-vertical"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Status</label>
                  <select
                    value={eStatus}
                    onChange={(e) => setEStatus(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 outline-none"
                  >
                    <option>Active</option>
                    <option>On Hold</option>
                    <option>Completed</option>
                    <option>Archived</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Target date</label>
                  <input
                    type="date"
                    value={eTarget}
                    onChange={(e) => setETarget(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  <span className="inline-flex items-center gap-1.5"><Users size={14} /> Members</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {allUsers.map((u) => {
                    const active = eMembers.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() =>
                          setEMembers((prev) =>
                            prev.includes(u.id) ? prev.filter((m) => m !== u.id) : [...prev, u.id]
                          )
                        }
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
                </div>
              </div>
              {isAdmin && (
                <button
                  onClick={deleteProject}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600 hover:bg-red-50 px-3 py-2 rounded-xl border border-red-200"
                >
                  <Trash2 size={14} /> Delete project
                </button>
              )}
            </div>
            <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex gap-3">
              <button
                onClick={saveProject}
                disabled={savingProject}
                className="flex-1 inline-flex items-center justify-center gap-2 bg-[#9b2423] hover:bg-[#7d1d1c] disabled:opacity-60 text-white font-semibold text-sm px-4 py-3 rounded-xl transition"
              >
                {savingProject ? <Loader2 size={16} className="animate-spin" /> : "Save Changes"}
              </button>
              <button
                onClick={() => setShowEdit(false)}
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
