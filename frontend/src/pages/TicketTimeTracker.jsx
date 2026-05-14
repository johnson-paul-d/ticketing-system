import { useState, useMemo, useCallback } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────

const USERS = [
  { name: "Rameenathan", color: "#378ADD" },
  { name: "Kavya",       color: "#D4537E" },
  { name: "Johnson",     color: "#1D9E75" },
  { name: "Admin",       color: "#7F77DD" },
];
const USER_COLOR = Object.fromEntries(USERS.map((u) => [u.name, u.color]));
const PRIORITY_COLOR = { High: "#E24B4A", Medium: "#EF9F27", Low: "#639922" };
const DEFAULT_DAILY_LIMIT = 120; // minutes

const INITIAL_TICKETS = [
  {
    id: 1,
    title: "Fix login bug",
    assignee: "Kavya",
    priority: "High",
    status: "In Progress",
    due: "2026-05-14",
    logs: { "2026-05-12": 45, "2026-05-13": 60, "2026-05-14": 90 },
  },
  {
    id: 2,
    title: "Build dashboard UI",
    assignee: "Rameenathan",
    priority: "Medium",
    status: "Open",
    due: "2026-05-20",
    logs: { "2026-05-13": 75, "2026-05-14": 120, "2026-05-15": 60 },
  },
  {
    id: 3,
    title: "Database migration",
    assignee: "Johnson",
    priority: "High",
    status: "Open",
    due: "2026-05-12",
    logs: { "2026-05-11": 90, "2026-05-12": 120, "2026-05-14": 45 },
  },
  {
    id: 4,
    title: "API rate limiting",
    assignee: "Admin",
    priority: "Low",
    status: "Completed",
    due: "2026-05-10",
    logs: { "2026-05-09": 60, "2026-05-10": 90 },
  },
  {
    id: 5,
    title: "Write unit tests",
    assignee: "Rameenathan",
    priority: "Medium",
    status: "In Progress",
    due: "2026-05-22",
    logs: { "2026-05-13": 30, "2026-05-14": 60, "2026-05-16": 45 },
  },
];

const INITIAL_LEAVES = [
  { id: 1, member: "Kavya",   date: "2026-05-15", type: "full", reason: "Medical"  },
  { id: 2, member: "Johnson", date: "2026-05-14", type: "half", reason: "Personal" },
];

const INITIAL_PERMISSIONS = [
  { id: 1, member: "Rameenathan", ticketId: 2, maxHours: 4, reason: "Sprint deadline" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function fmt(date) {
  return date.toISOString().slice(0, 10);
}

function fmtDisplay(dk) {
  return new Date(dk + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function fmtWeekday(d) {
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });
}

function hm(mins) {
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function totalLogged(ticket) {
  return Object.values(ticket.logs).reduce((s, v) => s + v, 0);
}

function isOverdue(ticket) {
  if (ticket.status === "Completed") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(ticket.due + "T00:00:00");
  return due < today;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Dot({ color, size = 8 }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        display: "inline-block",
        flexShrink: 0,
      }}
    />
  );
}

function Badge({ children, variant = "default" }) {
  const styles = {
    high:     { background: "#FCEBEB", color: "#A32D2D" },
    medium:   { background: "#FAEEDA", color: "#854F0B" },
    low:      { background: "#EAF3DE", color: "#3B6D11" },
    done:     { background: "#E1F5EE", color: "#0F6E56" },
    progress: { background: "#E6F1FB", color: "#185FA5" },
    open:     { background: "#F1EFE8", color: "#5F5E5A" },
    overdue:  { background: "#FCEBEB", color: "#A32D2D" },
    leaveFull:{ background: "#FBEAF0", color: "#993556" },
    leaveHalf:{ background: "#FAEEDA", color: "#854F0B" },
    default:  { background: "#F1EFE8", color: "#5F5E5A" },
  };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: 11,
        fontWeight: 500,
        padding: "2px 8px",
        borderRadius: 6,
        ...styles[variant],
      }}
    >
      {children}
    </span>
  );
}

function ProgressBar({ value, max, color }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div
      style={{
        height: 5,
        background: "rgba(0,0,0,0.08)",
        borderRadius: 999,
        overflow: "hidden",
        marginTop: 4,
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${pct}%`,
          background: color,
          borderRadius: 999,
          transition: "width 0.2s",
        }}
      />
    </div>
  );
}

function MetricCard({ label, value, sub, valueColor }) {
  return (
    <div
      style={{
        background: "var(--color-background-secondary, #f5f5f4)",
        borderRadius: 8,
        padding: "12px 16px",
      }}
    >
      <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 500, color: valueColor || "inherit" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function Modal({ open, title, onClose, children, footer }) {
  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.38)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          border: "0.5px solid #ddd",
          width: 360,
          maxWidth: "95vw",
          boxShadow: "0 4px 32px rgba(0,0,0,0.12)",
        }}
      >
        <div
          style={{
            padding: "14px 18px",
            borderBottom: "0.5px solid #eee",
            fontSize: 15,
            fontWeight: 500,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{title}</span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#888", lineHeight: 1 }}
          >
            ×
          </button>
        </div>
        <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
          {children}
        </div>
        {footer && (
          <div
            style={{
              padding: "10px 18px",
              borderTop: "0.5px solid #eee",
              display: "flex",
              gap: 8,
              justifyContent: "flex-end",
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle = {
  fontSize: 13,
  padding: "6px 10px",
  borderRadius: 8,
  border: "0.5px solid #ccc",
  background: "#fff",
  color: "#111",
  width: "100%",
  boxSizing: "border-box",
};

function Btn({ children, onClick, primary, danger, small }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: small ? 11 : 12,
        fontWeight: 500,
        padding: small ? "3px 10px" : "6px 14px",
        borderRadius: 8,
        border: danger ? "0.5px solid #F7C1C1" : "0.5px solid #ccc",
        background: primary ? "#111" : "#fff",
        color: primary ? "#fff" : danger ? "#A32D2D" : "#111",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function AlertBox({ type, children }) {
  const styles = {
    warn: { background: "#FAEEDA", color: "#854F0B", borderLeft: "3px solid #EF9F27" },
    err:  { background: "#FCEBEB", color: "#A32D2D", borderLeft: "3px solid #E24B4A" },
    ok:   { background: "#EAF3DE", color: "#3B6D11", borderLeft: "3px solid #639922" },
  };
  return (
    <div style={{ padding: "9px 12px", fontSize: 12, ...styles[type] }}>
      {children}
    </div>
  );
}

// ─── Log Time Modal ───────────────────────────────────────────────────────────

function LogTimeModal({ open, onClose, tickets, leaves, permissions, filterAssignee, defaultDate, defaultTicketId, onSave }) {
  const [ticketId, setTicketId] = useState(defaultTicketId || "");
  const [date, setDate]         = useState(defaultDate || fmt(new Date()));
  const [mins, setMins]         = useState("");
  const [alert, setAlert]       = useState(null);

  const availableTickets = filterAssignee === "All" ? tickets : tickets.filter((t) => t.assignee === filterAssignee);

  const getLimit = useCallback(
    (member, tId) => {
      const ex = permissions.find((p) => p.member === member && p.ticketId === tId);
      return ex ? ex.maxHours * 60 : DEFAULT_DAILY_LIMIT;
    },
    [permissions]
  );

  const getLeave = useCallback(
    (member, dk) => leaves.find((l) => l.member === member && l.date === dk) || null,
    [leaves]
  );

  const statusInfo = useMemo(() => {
    const tid = parseInt(ticketId, 10);
    if (!tid || !date) return null;
    const t = tickets.find((tk) => tk.id === tid);
    if (!t) return null;
    const leave    = getLeave(t.assignee, date);
    const rawLimit = getLimit(t.assignee, tid);
    const limit    = leave && leave.type === "half" ? Math.floor(rawLimit / 2) : rawLimit;
    const existing = t.logs[date] || 0;
    return { leave, limit, existing, ticket: t };
  }, [ticketId, date, tickets, getLeave, getLimit]);

  function handleOpen() {
    if (defaultTicketId) setTicketId(String(defaultTicketId));
    if (defaultDate) {
      setDate(defaultDate);
      const t = tickets.find((tk) => tk.id === defaultTicketId);
      if (t) setMins(String(t.logs[defaultDate] || ""));
    }
  }

  // sync when props change
  useState(() => { if (open) handleOpen(); });

  function handleSave() {
    const tid   = parseInt(ticketId, 10);
    const m     = parseInt(mins, 10);
    if (!tid)             { setAlert({ type: "err", msg: "Select a ticket." }); return; }
    if (!date)            { setAlert({ type: "err", msg: "Select a date." }); return; }
    if (!m || m < 1)      { setAlert({ type: "err", msg: "Enter valid minutes." }); return; }

    const { leave, limit } = statusInfo || {};
    if (leave && leave.type === "full") {
      setAlert({ type: "err", msg: `${statusInfo.ticket.assignee} is on full-day leave on ${date}. Cannot log time.` });
      return;
    }
    const isOver = m > limit;
    onSave(tid, date, m);
    setAlert({ type: isOver ? "warn" : "ok", msg: isOver ? `Saved with warning — ${m} min exceeds the ${hm(limit)} limit.` : "Time logged successfully." });
    setTimeout(() => { onClose(); setAlert(null); }, 1200);
  }

  if (!open) return null;

  return (
    <Modal
      open={open}
      title={defaultTicketId ? `Edit time — #${defaultTicketId}` : "Log time"}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn primary onClick={handleSave}>Log time</Btn>
        </>
      }
    >
      <Field label="Ticket">
        <select
          style={inputStyle}
          value={ticketId}
          onChange={(e) => {
            setTicketId(e.target.value);
            const t = availableTickets.find((tk) => tk.id === parseInt(e.target.value, 10));
            if (t && date) setMins(String(t.logs[date] || ""));
          }}
        >
          <option value="">— select —</option>
          {availableTickets.map((t) => (
            <option key={t.id} value={t.id}>
              #{t.id} {t.title} ({t.assignee})
            </option>
          ))}
        </select>
      </Field>

      <Field label="Date">
        <input
          type="date"
          style={inputStyle}
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            const tid2 = parseInt(ticketId, 10);
            const t    = tickets.find((tk) => tk.id === tid2);
            if (t) setMins(String(t.logs[e.target.value] || ""));
          }}
        />
      </Field>

      <Field label="Minutes to log">
        <input type="number" style={inputStyle} value={mins} min={1} max={480} placeholder="e.g. 90" onChange={(e) => setMins(e.target.value)} />
      </Field>

      {statusInfo && (
        <AlertBox type={statusInfo.leave && statusInfo.leave.type === "full" ? "err" : "warn"}>
          Limit: {hm(statusInfo.limit)}/day
          {statusInfo.leave ? (statusInfo.leave.type === "full" ? " — full-day leave (blocked)" : " — half-day (limit halved)") : ""}
          {statusInfo.existing > 0 ? ` · Currently logged: ${hm(statusInfo.existing)}` : ""}
        </AlertBox>
      )}

      {alert && <AlertBox type={alert.type}>{alert.msg}</AlertBox>}
    </Modal>
  );
}

// ─── Calendar Tab ─────────────────────────────────────────────────────────────

function CalendarTab({ tickets, leaves, permissions, filterAssignee, setFilterAssignee, onLogSave }) {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [logModal,  setLogModal]  = useState(null); // { date, ticketId }

  const today = fmt(new Date());
  const days  = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  function getLimit(member, ticketId) {
    const ex = permissions.find((p) => p.member === member && p.ticketId === ticketId);
    return ex ? ex.maxHours * 60 : DEFAULT_DAILY_LIMIT;
  }

  function getLeave(member, dk) {
    return leaves.find((l) => l.member === member && l.date === dk) || null;
  }

  const filteredTickets = filterAssignee === "All" ? tickets : tickets.filter((t) => t.assignee === filterAssignee);

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 500 }}>
            Week of {days[0].toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
          </div>
          <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>Date-wise view — each day shows all tickets logged that day</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <Btn onClick={() => setWeekStart(addDays(weekStart, -7))}>‹</Btn>
          <Btn onClick={() => setWeekStart(getWeekStart(new Date()))}>Today</Btn>
          <Btn onClick={() => setWeekStart(addDays(weekStart, 7))}>›</Btn>
        </div>
      </div>

      {/* Admin filter bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 12px",
          background: "#f5f5f4",
          borderRadius: 8,
          border: "0.5px solid #e0e0e0",
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 15, color: "#888" }}>🛡</span>
        <label style={{ fontSize: 12, fontWeight: 500, color: "#666", whiteSpace: "nowrap" }}>Admin — filter by assignee:</label>
        <select
          style={{ ...inputStyle, width: "auto", minWidth: 150 }}
          value={filterAssignee}
          onChange={(e) => setFilterAssignee(e.target.value)}
        >
          <option value="All">All members</option>
          {USERS.map((u) => (
            <option key={u.name} value={u.name}>{u.name}</option>
          ))}
        </select>
        <span style={{ fontSize: 11, color: "#aaa", marginLeft: "auto" }}>
          {filterAssignee === "All" ? "Showing all team members" : `Filtered: ${filterAssignee} only`}
        </span>
      </div>

      {/* Day jump pills */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {days.map((d) => {
          const dk    = fmt(d);
          const isT   = dk === today;
          return (
            <button
              key={dk}
              onClick={() => document.getElementById(`day-${dk}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "4px 11px",
                borderRadius: 999,
                border: "0.5px solid #ccc",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
                background: isT ? "#111" : "#fff",
                color: isT ? "#fff" : "#666",
              }}
            >
              {fmtWeekday(d)}{isT ? " · Today" : ""}
            </button>
          );
        })}
      </div>

      {/* Day blocks */}
      {days.map((d) => {
        const dk         = fmt(d);
        const isT        = dk === today;
        const dayEntries = filteredTickets
          .filter((t) => t.logs[dk] && t.logs[dk] > 0)
          .map((t) => ({ ticket: t, mins: t.logs[dk] }));
        const dayLeaves  = leaves.filter((l) => {
          if (filterAssignee !== "All" && l.member !== filterAssignee) return false;
          return l.date === dk;
        });
        const totalDay   = dayEntries.reduce((s, e) => s + e.mins, 0);

        return (
          <div
            key={dk}
            id={`day-${dk}`}
            style={{
              border: "0.5px solid #e0e0e0",
              borderRadius: 12,
              overflow: "hidden",
              marginBottom: 14,
            }}
          >
            {/* Day header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                background: isT ? "#EBF4FD" : "#fafaf9",
                borderBottom: "0.5px solid #e0e0e0",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontSize: 15, fontWeight: 500, color: isT ? "#185FA5" : "inherit" }}>
                  {fmtDisplay(dk)}
                  {isT && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 400,
                        padding: "2px 7px",
                        background: "#185FA5",
                        color: "#E6F1FB",
                        borderRadius: 999,
                        marginLeft: 8,
                      }}
                    >
                      Today
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {totalDay > 0 && (
                  <span style={{ fontSize: 13, fontWeight: 500, color: "#666" }}>{hm(totalDay)} logged</span>
                )}
                <Btn small onClick={() => setLogModal({ date: dk, ticketId: null })}>
                  + Log time
                </Btn>
              </div>
            </div>

            {/* Leave banners */}
            {dayLeaves.map((l) => (
              <div
                key={l.id}
                style={{
                  padding: "8px 14px",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                  fontWeight: 400,
                  background: l.type === "full" ? "#FBEAF0" : "#FAEEDA",
                  color:      l.type === "full" ? "#993556" : "#854F0B",
                  borderBottom: `0.5px solid ${l.type === "full" ? "#F4C0D1" : "#FAC775"}`,
                }}
              >
                ☂ <strong>{l.member}</strong> — {l.type === "full" ? "Full-day leave" : "Half-day leave"}
                {l.reason ? ` · ${l.reason}` : ""}
              </div>
            ))}

            {/* Empty state */}
            {dayEntries.length === 0 && dayLeaves.length === 0 && (
              <div style={{ padding: 14, textAlign: "center", fontSize: 12, color: "#aaa" }}>
                No time logged ·{" "}
                <button
                  onClick={() => setLogModal({ date: dk, ticketId: null })}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#185FA5", fontSize: 12 }}
                >
                  + Add entry
                </button>
              </div>
            )}

            {/* Entries */}
            {dayEntries.length > 0 && (
              <>
                {/* Column headers */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0,2fr) minmax(0,1.1fr) 70px 82px 82px 68px",
                    padding: "6px 14px",
                    background: "#fafaf9",
                    borderBottom: "0.5px solid #e0e0e0",
                    gap: 8,
                  }}
                >
                  {["Ticket", "Assignee", "Priority", "Logged", "Daily limit", "Edit"].map((h, i) => (
                    <div
                      key={h}
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        color: "#aaa",
                        textAlign: i >= 3 && i < 5 ? "right" : i === 5 ? "center" : "left",
                      }}
                    >
                      {h}
                    </div>
                  ))}
                </div>

                {dayEntries.map(({ ticket: t, mins }) => {
                  const leave      = getLeave(t.assignee, dk);
                  const rawLimit   = getLimit(t.assignee, t.id);
                  const limit      = leave && leave.type === "half" ? Math.floor(rawLimit / 2) : rawLimit;
                  const overLimit  = mins > limit;
                  const barColor   = overLimit ? "#E24B4A" : USER_COLOR[t.assignee] || "#888";

                  return (
                    <div
                      key={t.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0,2fr) minmax(0,1.1fr) 70px 82px 82px 68px",
                        alignItems: "center",
                        gap: 8,
                        padding: "9px 14px",
                        borderBottom: "0.5px solid #f0f0f0",
                      }}
                    >
                      {/* Ticket name + progress */}
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          #{t.id} {t.title}
                        </div>
                        <ProgressBar value={mins} max={limit} color={barColor} />
                        {isOverdue(t) && (
                          <Badge variant="overdue">Overdue</Badge>
                        )}
                      </div>

                      {/* Assignee */}
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <Dot color={USER_COLOR[t.assignee] || "#888"} />
                        <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {t.assignee}
                        </span>
                      </div>

                      {/* Priority */}
                      <div style={{ textAlign: "center" }}>
                        <Badge variant={t.priority.toLowerCase()}>{t.priority}</Badge>
                      </div>

                      {/* Logged */}
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 500, fontSize: 13, color: overLimit ? "#A32D2D" : "inherit" }}>
                          {hm(mins)}
                        </div>
                        <div style={{ fontSize: 10, color: "#aaa" }}>{mins} min</div>
                      </div>

                      {/* Limit */}
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 12, color: "#888" }}>{hm(limit)}</div>
                        {leave && leave.type === "half" && (
                          <div style={{ fontSize: 10, color: "#854F0B" }}>half-day</div>
                        )}
                        {overLimit && (
                          <div style={{ fontSize: 10, color: "#A32D2D" }}>+{mins - limit} over</div>
                        )}
                      </div>

                      {/* Edit */}
                      <div style={{ textAlign: "center" }}>
                        <Btn small onClick={() => setLogModal({ date: dk, ticketId: t.id })}>
                          Edit
                        </Btn>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        );
      })}

      {/* Legend */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 4 }}>
        {[
          { color: "#FBEAF0", border: "#D4537E", label: "Full-day leave" },
          { color: "#FAEEDA", border: "#EF9F27", label: "Half-day leave" },
          { color: "#FCEBEB", border: "#E24B4A", label: "Over daily limit" },
        ].map((l) => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#888" }}>
            <span style={{ width: 12, height: 12, background: l.color, borderLeft: `3px solid ${l.border}`, display: "inline-block" }} />
            {l.label}
          </div>
        ))}
      </div>

      {/* Log time modal */}
      <LogTimeModal
        open={!!logModal}
        onClose={() => setLogModal(null)}
        tickets={tickets}
        leaves={leaves}
        permissions={permissions}
        filterAssignee={filterAssignee}
        defaultDate={logModal?.date}
        defaultTicketId={logModal?.ticketId}
        onSave={(tid, date, mins) => {
          onLogSave(tid, date, mins);
          setLogModal(null);
        }}
      />
    </div>
  );
}

// ─── Tickets Tab ──────────────────────────────────────────────────────────────

function TicketsTab({ tickets, onAdd, onLogSave, leaves, permissions }) {
  const [showAdd,   setShowAdd]   = useState(false);
  const [logModal,  setLogModal]  = useState(null);
  const [form,      setForm]      = useState({ title: "", assignee: USERS[0].name, priority: "Medium", status: "Open", due: fmt(new Date()) });

  function handleAdd() {
    if (!form.title.trim()) return;
    onAdd(form);
    setShowAdd(false);
    setForm({ title: "", assignee: USERS[0].name, priority: "Medium", status: "Open", due: fmt(new Date()) });
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: "#888" }}>All tickets · time spread across multiple days</div>
        <Btn primary onClick={() => setShowAdd(true)}>+ Add ticket</Btn>
      </div>

      <div style={{ border: "0.5px solid #e0e0e0", borderRadius: 12, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <thead style={{ background: "#fafaf9" }}>
            <tr>
              {["Ticket", "Assignee", "Priority", "Status", "Total logged", "Due", "Log"].map((h, i) => (
                <th
                  key={h}
                  style={{
                    padding: "9px 12px",
                    fontSize: 12,
                    fontWeight: 500,
                    color: "#888",
                    textAlign: i >= 4 ? "right" : "left",
                    borderBottom: "0.5px solid #e0e0e0",
                    width: ["32%","14%","10%","10%","14%","10%","10%"][i],
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => {
              const total = totalLogged(t);
              const od    = isOverdue(t);
              const days  = Object.keys(t.logs).filter((d) => t.logs[d] > 0).length;
              return (
                <tr key={t.id} style={{ borderBottom: "0.5px solid #f0f0f0" }}>
                  <td style={{ padding: "9px 12px" }}>
                    <div style={{ fontWeight: 500 }}>#{t.id} {t.title}</div>
                    <div style={{ fontSize: 11, color: "#aaa" }}>{days} days logged</div>
                  </td>
                  <td style={{ padding: "9px 12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <Dot color={USER_COLOR[t.assignee] || "#888"} />
                      <span style={{ fontSize: 12 }}>{t.assignee}</span>
                    </div>
                  </td>
                  <td style={{ padding: "9px 12px" }}><Badge variant={t.priority.toLowerCase()}>{t.priority}</Badge></td>
                  <td style={{ padding: "9px 12px" }}>
                    <Badge variant={t.status === "Completed" ? "done" : t.status === "In Progress" ? "progress" : "open"}>
                      {t.status}
                    </Badge>
                  </td>
                  <td style={{ padding: "9px 12px", textAlign: "right" }}>
                    <div style={{ fontWeight: 500 }}>{hm(total)}</div>
                    <div style={{ fontSize: 11, color: "#aaa" }}>{total} min</div>
                  </td>
                  <td style={{ padding: "9px 12px", textAlign: "right" }}>
                    <div style={{ color: od ? "#A32D2D" : "inherit", fontWeight: od ? 500 : 400 }}>{t.due}</div>
                    {od && <div style={{ fontSize: 10, color: "#A32D2D" }}>Overdue</div>}
                  </td>
                  <td style={{ padding: "9px 12px", textAlign: "right" }}>
                    <Btn small onClick={() => setLogModal({ ticketId: t.id, date: fmt(new Date()) })}>
                      + Log
                    </Btn>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add ticket modal */}
      <Modal
        open={showAdd}
        title="Add ticket"
        onClose={() => setShowAdd(false)}
        footer={
          <>
            <Btn onClick={() => setShowAdd(false)}>Cancel</Btn>
            <Btn primary onClick={handleAdd}>Add</Btn>
          </>
        }
      >
        <Field label="Title">
          <input style={inputStyle} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ticket title" />
        </Field>
        <Field label="Assignee">
          <select style={inputStyle} value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })}>
            {USERS.map((u) => <option key={u.name}>{u.name}</option>)}
          </select>
        </Field>
        <Field label="Priority">
          <select style={inputStyle} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
            {["High","Medium","Low"].map((p) => <option key={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Due date">
          <input type="date" style={inputStyle} value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} />
        </Field>
        <Field label="Status">
          <select style={inputStyle} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            {["Open","In Progress","Completed"].map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
      </Modal>

      {/* Log time modal */}
      <LogTimeModal
        open={!!logModal}
        onClose={() => setLogModal(null)}
        tickets={tickets}
        leaves={leaves}
        permissions={permissions}
        filterAssignee="All"
        defaultDate={logModal?.date}
        defaultTicketId={logModal?.ticketId}
        onSave={(tid, date, mins) => { onLogSave(tid, date, mins); setLogModal(null); }}
      />
    </div>
  );
}

// ─── Leaves Tab ───────────────────────────────────────────────────────────────

function LeavesTab({ leaves, onAdd, onRemove }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form,    setForm]    = useState({ member: USERS[0].name, date: fmt(new Date()), type: "full", reason: "" });

  function handleAdd() {
    if (!form.date) return;
    onAdd(form);
    setShowAdd(false);
    setForm({ member: USERS[0].name, date: fmt(new Date()), type: "full", reason: "" });
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: "#888" }}>Full-day leaves block time logging · half-day leaves halve the limit</div>
        <Btn primary onClick={() => setShowAdd(true)}>+ Add leave</Btn>
      </div>

      <div style={{ border: "0.5px solid #e0e0e0", borderRadius: 12, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "#fafaf9" }}>
            <tr>
              {["Member","Date","Type","Reason","Remove"].map((h, i) => (
                <th key={h} style={{ padding: "9px 12px", fontSize: 12, fontWeight: 500, color: "#888", textAlign: i === 4 ? "center" : "left", borderBottom: "0.5px solid #e0e0e0" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leaves.map((l) => (
              <tr key={l.id} style={{ borderBottom: "0.5px solid #f0f0f0" }}>
                <td style={{ padding: "9px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <Dot color={USER_COLOR[l.member] || "#888"} />
                    {l.member}
                  </div>
                </td>
                <td style={{ padding: "9px 12px", fontSize: 13 }}>{l.date}</td>
                <td style={{ padding: "9px 12px" }}>
                  <Badge variant={l.type === "full" ? "leaveFull" : "leaveHalf"}>
                    {l.type === "full" ? "Full day" : "Half day"}
                  </Badge>
                </td>
                <td style={{ padding: "9px 12px", fontSize: 12, color: "#888" }}>{l.reason || "—"}</td>
                <td style={{ padding: "9px 12px", textAlign: "center" }}>
                  <Btn small danger onClick={() => onRemove(l.id)}>Remove</Btn>
                </td>
              </tr>
            ))}
            {leaves.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: "#aaa", fontSize: 13 }}>No leaves recorded</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={showAdd}
        title="Add leave"
        onClose={() => setShowAdd(false)}
        footer={
          <>
            <Btn onClick={() => setShowAdd(false)}>Cancel</Btn>
            <Btn primary onClick={handleAdd}>Save</Btn>
          </>
        }
      >
        <Field label="Member">
          <select style={inputStyle} value={form.member} onChange={(e) => setForm({ ...form, member: e.target.value })}>
            {USERS.map((u) => <option key={u.name}>{u.name}</option>)}
          </select>
        </Field>
        <Field label="Date">
          <input type="date" style={inputStyle} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </Field>
        <Field label="Type">
          <select style={inputStyle} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="full">Full day</option>
            <option value="half">Half day</option>
          </select>
        </Field>
        <Field label="Reason (optional)">
          <input style={inputStyle} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Medical" />
        </Field>
      </Modal>
    </div>
  );
}

// ─── Permissions Tab ──────────────────────────────────────────────────────────

function PermissionsTab({ permissions, tickets, onAdd, onRemove }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form,    setForm]    = useState({ member: USERS[0].name, ticketId: "", maxHours: 4, reason: "" });

  function handleAdd() {
    if (!form.ticketId) return;
    onAdd({ ...form, ticketId: parseInt(form.ticketId, 10), maxHours: parseFloat(form.maxHours) });
    setShowAdd(false);
    setForm({ member: USERS[0].name, ticketId: "", maxHours: 4, reason: "" });
  }

  return (
    <div>
      <div
        style={{
          background: "#E6F1FB",
          border: "0.5px solid #B5D4F4",
          borderRadius: 8,
          padding: "10px 14px",
          fontSize: 13,
          color: "#185FA5",
          marginBottom: 12,
        }}
      >
        Default rule: each member can log max <strong>2 hours (120 min)</strong> per ticket per day.
        Add exceptions below to allow more for specific ticket/member pairs.
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: "#888" }}>Exceptions override the 2h default</div>
        <Btn primary onClick={() => setShowAdd(true)}>+ Add exception</Btn>
      </div>

      <div style={{ border: "0.5px solid #e0e0e0", borderRadius: 12, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "#fafaf9" }}>
            <tr>
              {["Member","Ticket","Max hours/day","Reason","Remove"].map((h, i) => (
                <th key={h} style={{ padding: "9px 12px", fontSize: 12, fontWeight: 500, color: "#888", textAlign: i === 2 ? "right" : i === 4 ? "center" : "left", borderBottom: "0.5px solid #e0e0e0" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {permissions.map((p) => {
              const t = tickets.find((tk) => tk.id === p.ticketId);
              return (
                <tr key={p.id} style={{ borderBottom: "0.5px solid #f0f0f0" }}>
                  <td style={{ padding: "9px 12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <Dot color={USER_COLOR[p.member] || "#888"} />
                      {p.member}
                    </div>
                  </td>
                  <td style={{ padding: "9px 12px", fontSize: 12 }}>{t ? `#${t.id} ${t.title}` : "—"}</td>
                  <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 500 }}>{p.maxHours}h</td>
                  <td style={{ padding: "9px 12px", fontSize: 12, color: "#888" }}>{p.reason || "—"}</td>
                  <td style={{ padding: "9px 12px", textAlign: "center" }}>
                    <Btn small danger onClick={() => onRemove(p.id)}>Remove</Btn>
                  </td>
                </tr>
              );
            })}
            {permissions.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: "#aaa", fontSize: 13 }}>No exceptions — 2h default applies to all</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={showAdd}
        title="Add time exception"
        onClose={() => setShowAdd(false)}
        footer={
          <>
            <Btn onClick={() => setShowAdd(false)}>Cancel</Btn>
            <Btn primary onClick={handleAdd}>Save</Btn>
          </>
        }
      >
        <Field label="Member">
          <select style={inputStyle} value={form.member} onChange={(e) => setForm({ ...form, member: e.target.value })}>
            {USERS.map((u) => <option key={u.name}>{u.name}</option>)}
          </select>
        </Field>
        <Field label="Ticket">
          <select style={inputStyle} value={form.ticketId} onChange={(e) => setForm({ ...form, ticketId: e.target.value })}>
            <option value="">— select —</option>
            {tickets.map((t) => <option key={t.id} value={t.id}>#{t.id} {t.title}</option>)}
          </select>
        </Field>
        <Field label="Max hours per day">
          <input type="number" style={inputStyle} min={1} max={8} value={form.maxHours} onChange={(e) => setForm({ ...form, maxHours: e.target.value })} />
        </Field>
        <Field label="Reason">
          <input style={inputStyle} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Critical sprint" />
        </Field>
      </Modal>
    </div>
  );
}

// ─── Analytics Tab ────────────────────────────────────────────────────────────

function AnalyticsTab({ tickets, leaves }) {
  const today        = fmt(new Date());
  const totalMins    = tickets.reduce((s, t) => s + totalLogged(t), 0);
  const overdueCount = tickets.filter(isOverdue).length;
  const doneCount    = tickets.filter((t) => t.status === "Completed").length;
  const upLeaves     = leaves.filter((l) => l.date >= today).length;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10, marginBottom: 20 }}>
        <MetricCard label="Total hours logged" value={`${Math.floor(totalMins / 60)}h ${totalMins % 60}m`} sub="all tickets, all days" />
        <MetricCard label="Overdue tickets"    value={overdueCount} sub="need attention" valueColor={overdueCount ? "#A32D2D" : "#3B6D11"} />
        <MetricCard label="Completed"          value={doneCount}    sub={`of ${tickets.length} total`} valueColor="#0F6E56" />
        <MetricCard label="Upcoming leaves"    value={upLeaves}     sub="from today" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {/* Workload by member */}
        <div style={{ background: "#fff", border: "0.5px solid #e0e0e0", borderRadius: 12, padding: "1rem 1.25rem" }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: "#aaa", letterSpacing: "0.06em", marginBottom: 12, textTransform: "uppercase" }}>
            Workload by member
          </div>
          {USERS.map((u) => {
            const mins = tickets.filter((t) => t.assignee === u.name).reduce((s, t) => s + totalLogged(t), 0);
            const tc   = tickets.filter((t) => t.assignee === u.name).length;
            const pct  = Math.min(100, Math.round((mins / 480) * 100));
            return (
              <div key={u.name} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 500 }}>
                    <Dot color={u.color} />
                    {u.name}
                  </div>
                  <div style={{ fontSize: 12, color: "#888" }}>{hm(mins)} · {tc} ticket{tc !== 1 ? "s" : ""}</div>
                </div>
                <ProgressBar value={mins} max={480} color={u.color} />
              </div>
            );
          })}
        </div>

        {/* Time per ticket */}
        <div style={{ background: "#fff", border: "0.5px solid #e0e0e0", borderRadius: 12, padding: "1rem 1.25rem" }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: "#aaa", letterSpacing: "0.06em", marginBottom: 12, textTransform: "uppercase" }}>
            Time per ticket
          </div>
          {[...tickets].sort((a, b) => totalLogged(b) - totalLogged(a)).map((t) => {
            const mins = totalLogged(t);
            return (
              <div key={t.id} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "65%" }}>
                    #{t.id} {t.title}
                  </div>
                  <div style={{ fontSize: 11, color: "#888" }}>{hm(mins)}</div>
                </div>
                <ProgressBar value={mins} max={480} color={isOverdue(t) ? "#E24B4A" : USER_COLOR[t.assignee] || "#888"} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Root Component ───────────────────────────────────────────────────────────

export default function TicketTimeTracker() {
  const [tickets,     setTickets]     = useState(INITIAL_TICKETS);
  const [leaves,      setLeaves]      = useState(INITIAL_LEAVES);
  const [permissions, setPermissions] = useState(INITIAL_PERMISSIONS);
  const [activeTab,   setActiveTab]   = useState("calendar");
  const [filterAssignee, setFilterAssignee] = useState("All");

  const [nextIds, setNextIds] = useState({ ticket: 6, leave: 3, perm: 2 });

  // ── Ticket handlers ──
  function handleAddTicket(form) {
    setTickets((prev) => [
      ...prev,
      { id: nextIds.ticket, ...form, logs: {} },
    ]);
    setNextIds((n) => ({ ...n, ticket: n.ticket + 1 }));
  }

  function handleLogSave(ticketId, date, mins) {
    setTickets((prev) =>
      prev.map((t) =>
        t.id === ticketId ? { ...t, logs: { ...t.logs, [date]: mins } } : t
      )
    );
  }

  // ── Leave handlers ──
  function handleAddLeave(form) {
    setLeaves((prev) => {
      const filtered = prev.filter((l) => !(l.member === form.member && l.date === form.date));
      return [...filtered, { id: nextIds.leave, ...form }];
    });
    setNextIds((n) => ({ ...n, leave: n.leave + 1 }));
  }

  function handleRemoveLeave(id) {
    setLeaves((prev) => prev.filter((l) => l.id !== id));
  }

  // ── Permission handlers ──
  function handleAddPermission(form) {
    setPermissions((prev) => {
      const filtered = prev.filter((p) => !(p.member === form.member && p.ticketId === form.ticketId));
      return [...filtered, { id: nextIds.perm, ...form }];
    });
    setNextIds((n) => ({ ...n, perm: n.perm + 1 }));
  }

  function handleRemovePermission(id) {
    setPermissions((prev) => prev.filter((p) => p.id !== id));
  }

  const TABS = [
    { key: "calendar",    label: "Calendar"    },
    { key: "tickets",     label: "Tickets"     },
    { key: "leaves",      label: "Leaves"      },
    { key: "permissions", label: "Permissions" },
    { key: "analytics",   label: "Analytics"   },
  ];

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: "1.25rem", maxWidth: 1100, margin: "0 auto" }}>
      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: "0.5px solid #e0e0e0", marginBottom: 20 }}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 500,
              border: "none",
              background: "none",
              cursor: "pointer",
              color: activeTab === tab.key ? "#111" : "#888",
              borderBottom: activeTab === tab.key ? "2px solid #111" : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "calendar" && (
        <CalendarTab
          tickets={tickets}
          leaves={leaves}
          permissions={permissions}
          filterAssignee={filterAssignee}
          setFilterAssignee={setFilterAssignee}
          onLogSave={handleLogSave}
        />
      )}
      {activeTab === "tickets" && (
        <TicketsTab
          tickets={tickets}
          leaves={leaves}
          permissions={permissions}
          onAdd={handleAddTicket}
          onLogSave={handleLogSave}
        />
      )}
      {activeTab === "leaves" && (
        <LeavesTab
          leaves={leaves}
          onAdd={handleAddLeave}
          onRemove={handleRemoveLeave}
        />
      )}
      {activeTab === "permissions" && (
        <PermissionsTab
          permissions={permissions}
          tickets={tickets}
          onAdd={handleAddPermission}
          onRemove={handleRemovePermission}
        />
      )}
      {activeTab === "analytics" && (
        <AnalyticsTab tickets={tickets} leaves={leaves} />
      )}
    </div>
  );
}