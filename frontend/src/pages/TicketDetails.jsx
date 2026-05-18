import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import api from "../services/api";
import useAuthStore from "../store/authStore";
import socket from "../services/socket";

export default function TicketDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);

  const [ticket, setTicket] = useState(null);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState("");
  const [comment, setComment] = useState("");
  const [timeline, setTimeline] = useState([]);

  // =====================================================
  // TIME TRACKING
  // =====================================================
  const [timeEntries, setTimeEntries] = useState([]);
  const [workDate, setWorkDate] = useState(new Date().toISOString().split("T")[0]);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [notes, setNotes] = useState("");

  // TOTAL MINUTES STORED IN DB
  const [allottedMinutes, setAllottedMinutes] = useState(0);

  // UI STATES FOR EDITING ALLOTTED TIME
  const [allottedDays, setAllottedDays] = useState(0);
  const [allottedHours, setAllottedHours] = useState(0);
  const [allottedMins, setAllottedMins] = useState(0);

  // =====================================================
  // FETCH
  // =====================================================
  useEffect(() => {
    fetchTicket();
    if (user?.role === "Admin") {
      fetchUsers();
    }
    socket.on("ticketUpdated", fetchTicket);
    return () => socket.off("ticketUpdated", fetchTicket);
  }, [user]);

  // =====================================================
  // FETCH TICKET
  // =====================================================
  const fetchTicket = async () => {
    try {
      const res = await api.get(`/tickets/${id}`);

      setTicket(res.data);
      setDueDate(res.data.due_date || "");
      setStatus(res.data.status || "Open");
      setTimeline(res.data.timeline || []);
      setTimeEntries(res.data.time_entries || []);

      // Allotted time
      const mins = Math.max(0, res.data.allotted_minutes || 0);
      setAllottedMinutes(mins);
      setAllottedDays(Math.floor(mins / (60 * 24)));
      setAllottedHours(Math.floor((mins % (60 * 24)) / 60));
      setAllottedMins(mins % 60);
    } catch (err) {
      console.error(err);
    }
  };

  // =====================================================
  // FETCH USERS
  // =====================================================
  const fetchUsers = async () => {
    try {
      const res = await api.get("/users");
      setUsers(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  // =====================================================
  // HELPER: FORMAT MINUTES
  // =====================================================
  const formatMinutes = (minutes) => {
    const safeMinutes = Math.max(0, minutes);
    const days = Math.floor(safeMinutes / (60 * 24));
    const hours = Math.floor((safeMinutes % (60 * 24)) / 60);
    const mins = safeMinutes % 60;
    return `${days}d ${hours}h ${mins}m`;
  };

  // =====================================================
  // UPDATE ALLOTTED TIME (using days/hours/mins)
  // =====================================================
  const updateAllottedTime = async () => {
    try {
      const total =
        Math.max(0, allottedDays) * 24 * 60 +
        Math.max(0, allottedHours) * 60 +
        Math.max(0, allottedMins);

      await api.put(`/tickets/${ticket.id}`, {
        allotted_minutes: total,
      });
      alert("Allotted time updated");
      fetchTicket();
    } catch (err) {
      console.error(err);
      alert("Failed to update allotted time");
    }
  };

  // =====================================================
  // ASSIGN
  // =====================================================
  const assignTicket = async () => {
    if (!selectedUser) {
      return alert("Select a team member");
    }
    try {
      const selected = users.find((u) => u.id === selectedUser);
      await api.put(`/tickets/${ticket.id}/assign`, {
        assigned_to: selected.id,
        assigned_to_name: selected.name,
      });
      alert("Ticket assigned");
      fetchTicket();
    } catch (err) {
      alert("Assignment failed");
    }
  };

  // =====================================================
  // DELETE
  // =====================================================
  const deleteTicket = async () => {
    if (!window.confirm("Delete this ticket?")) return;
    try {
      await api.delete(`/tickets/${ticket.id}`);
      alert("Ticket deleted");
      navigate("/tickets");
    } catch (err) {
      alert("Delete failed");
    }
  };

  // =====================================================
  // UPDATE DUE DATE
  // =====================================================
  const updateDueDate = async () => {
    try {
      await api.put(`/tickets/${ticket.id}`, {
        due_date: dueDate,
        comment,
      });
      fetchTicket();
      setComment("");
      alert("Due date updated");
    } catch (err) {
      alert("Failed to update due date");
    }
  };

  // =====================================================
  // UPDATE STATUS
  // =====================================================
  const updateStatus = async () => {
    try {
      await api.put(`/tickets/${ticket.id}`, {
        status,
        comment,
      });
      fetchTicket();
      setComment("");
      alert("Status updated");
    } catch (err) {
      alert("Failed to update status");
    }
  };

  // =====================================================
  // APPROVE
  // =====================================================
  const approveTicket = async () => {
    try {
      await api.put(`/tickets/${ticket.id}/approve`);
      fetchTicket();
      alert("Ticket approved");
    } catch (err) {
      console.error(err);
      alert("Approval failed");
    }
  };

  // =====================================================
  // REJECT
  // =====================================================
  const rejectTicket = async () => {
    try {
      await api.put(`/tickets/${ticket.id}/reject`);
      fetchTicket();
      alert("Ticket rejected");
    } catch (err) {
      console.error(err);
      alert("Reject failed");
    }
  };

  // =====================================================
  // LOG TIME (with start/end time & auto duration)
  // =====================================================
  const logTime = async () => {
    try {
      if (!startTime || !endTime) {
        return alert("Select start & end time");
      }
      const duration = Math.round((new Date(endTime) - new Date(startTime)) / 60000);
      await api.post("/ticket-time-entries", {
        ticket_id: ticket.id,
        work_date: workDate,
        start_time: startTime,
        end_time: endTime,
        duration_minutes: duration,
        notes,
        user_name: user?.name,
      });
      alert("Time logged");
      setNotes("");
      setStartTime("");
      setEndTime("");
      fetchTicket();
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.message || "Failed to log time");
    }
  };

  // =====================================================
  // TOTAL TIME (consumed)
  // =====================================================
  const totalMinutes = timeEntries.reduce(
    (sum, entry) => sum + Math.max(0, entry.duration_minutes || 0),
    0
  );

  const remainingMinutes = Math.max(0, allottedMinutes - totalMinutes);

  // =====================================================
  // TIMELINE FILTERS
  // =====================================================
  const generalTimeline = timeline.filter(
    (t) =>
      t.type !== "comment_add" &&
      t.type !== "due_date" &&
      t.type !== "time_log" &&
      t.type !== "allotted_time"
  );

  const commentTimeline = timeline.filter((t) => t.type === "comment_add");
  const dueDateTimeline = timeline.filter((t) => t.type === "due_date");
  const timeTimeline = timeline.filter((t) => t.type === "time_log");
  const allottedTimeline = timeline.filter((t) => t.type === "allotted_time");

  // =====================================================
  // LOADING
  // =====================================================
  if (!ticket) {
    return <MainLayout>Loading...</MainLayout>;
  }

  // =====================================================
  // MAIN UI
  // =====================================================
  return (
    <MainLayout>
      <div className="bg-white rounded-3xl shadow-sm p-8">
        {/* ===================================================== */}
        {/* HEADER */}
        {/* ===================================================== */}
        <div className="flex flex-col lg:flex-row justify-between lg:items-start gap-6">
          <div>
            <h1 className="text-4xl lg:text-5xl font-bold">{ticket.title}</h1>
            <p className="text-gray-500 mt-2">Ticket ID: {ticket.id}</p>
            <div className="flex flex-wrap gap-3 mt-5">
              <span className="bg-gray-100 px-4 py-2 rounded-full text-sm font-medium">
                {ticket.status}
              </span>
              {ticket.approval_status && (
                <span className="bg-yellow-100 text-yellow-700 px-4 py-2 rounded-full text-sm font-medium">
                  Approval: {ticket.approval_status}
                </span>
              )}
            </div>
          </div>
          {user?.role === "Admin" && (
            <button
              onClick={deleteTicket}
              className="bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-2xl"
            >
              Delete Ticket
            </button>
          )}
        </div>

        {/* ===================================================== */}
        {/* APPROVAL */}
        {/* ===================================================== */}
        {ticket.status === "Waiting For Approval" && user?.role === "Admin" && (
          <div className="mt-8 bg-yellow-50 border border-yellow-200 rounded-3xl p-6">
            <h2 className="text-2xl font-bold">Approval Required</h2>
            <p className="text-gray-600 mt-2">This ticket requires manager approval.</p>
            <div className="flex gap-4 mt-6">
              <button
                onClick={approveTicket}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-2xl"
              >
                Approve
              </button>
              <button
                onClick={rejectTicket}
                className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-2xl"
              >
                Reject
              </button>
            </div>
          </div>
        )}

        {/* ===================================================== */}
        {/* DETAILS */}
        {/* ===================================================== */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mt-12">
          {/* LEFT */}
          <div className="space-y-8">
            <div>
              <p className="font-semibold text-gray-500">Description</p>
              <p className="text-lg font-medium mt-2">{ticket.description}</p>
            </div>
            <div>
              <p className="font-semibold text-gray-500">Priority</p>
              <p className="text-lg font-medium mt-2">{ticket.priority}</p>
            </div>
            <div>
              <p className="font-semibold text-gray-500">Category</p>
              <p className="text-lg font-medium mt-2">{ticket.category}</p>
            </div>
            <div>
              <p className="font-semibold text-gray-500">Due Date</p>
              <p className="text-lg font-medium mt-2">{ticket.due_date || "Not set"}</p>
            </div>
          </div>

          {/* RIGHT */}
          <div className="space-y-8">
            <div>
              <p className="font-semibold text-gray-500">Assigned To</p>
              <p className="text-lg font-medium mt-2">{ticket.assigned_to_name || "Unassigned"}</p>
            </div>

            {/* STATUS */}
            <div>
              <p className="font-semibold text-gray-500">Update Status</p>
              <div className="flex flex-col sm:flex-row gap-4 mt-3">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="border rounded-2xl px-4 py-3 w-full"
                >
                  <option>Open</option>
                  <option>In Progress</option>
                  <option>Waiting For Sources</option>
                  <option>Completed</option>
                </select>
                <button
                  onClick={updateStatus}
                  className="bg-black hover:bg-gray-800 text-white px-5 py-3 rounded-2xl whitespace-nowrap"
                >
                  Update
                </button>
              </div>
            </div>

            {/* DUE DATE */}
            <div>
              <p className="font-semibold text-gray-500">Due Date</p>
              <div className="flex flex-col sm:flex-row gap-4 mt-3">
                <input
                  type="date"
                  value={dueDate || ""}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="border rounded-2xl px-4 py-3 w-full"
                />
                <button
                  onClick={updateDueDate}
                  className="bg-black hover:bg-gray-800 text-white px-5 py-3 rounded-2xl whitespace-nowrap"
                >
                  Update
                </button>
              </div>
            </div>

            {/* COMMENT */}
            <div>
              <p className="font-semibold text-gray-500">Comment</p>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add comment..."
                className="border rounded-2xl px-4 py-3 w-full h-32 mt-3"
              />
              <button
                onClick={() => {
                  if (comment) {
                    updateStatus();
                  } else {
                    alert("Write a comment first");
                  }
                }}
                className="mt-3 bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded-xl text-sm"
              >
                Attach comment
              </button>
            </div>
          </div>
        </div>

        {/* ===================================================== */}
        {/* ALLOTTED / CONSUMED / REMAINING UI + EDITABLE */}
        {/* ===================================================== */}
        <div className="mt-12 bg-black text-white rounded-3xl p-8">
          <h2 className="text-3xl font-bold">Ticket Time Allocation</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
            {/* ALLOTTED */}
            <div className="bg-white/10 rounded-2xl p-5">
              <div className="text-sm opacity-80">Allotted</div>
              <div className="text-3xl font-bold mt-2">
                {formatMinutes(allottedMinutes)}
              </div>
            </div>
            {/* CONSUMED */}
            <div className="bg-white/10 rounded-2xl p-5">
              <div className="text-sm opacity-80">Consumed</div>
              <div className="text-3xl font-bold mt-2">
                {formatMinutes(totalMinutes)}
              </div>
            </div>
            {/* REMAINING */}
            <div className="bg-white/10 rounded-2xl p-5">
              <div className="text-sm opacity-80">Remaining</div>
              <div className="text-3xl font-bold mt-2">
                {formatMinutes(remainingMinutes)}
              </div>
            </div>
          </div>

          {/* EDIT ALLOTTED TIME (Admin only) */}
          {user?.role === "Admin" && (
            <div className="mt-8 flex flex-wrap items-end gap-4">
              {/* Days */}
              <div>
                <label className="block text-sm mb-2">Days</label>
                <input
                  type="number"
                  min="0"
                  value={allottedDays}
                  onChange={(e) => setAllottedDays(Math.max(0, Number(e.target.value)))}
                  className="border rounded-2xl px-5 py-3 text-black w-28"
                />
              </div>
              {/* Hours */}
              <div>
                <label className="block text-sm mb-2">Hours</label>
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={allottedHours}
                  onChange={(e) =>
                    setAllottedHours(Math.min(23, Math.max(0, Number(e.target.value))))
                  }
                  className="border rounded-2xl px-5 py-3 text-black w-28"
                />
              </div>
              {/* Minutes */}
              <div>
                <label className="block text-sm mb-2">Minutes</label>
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={allottedMins}
                  onChange={(e) =>
                    setAllottedMins(Math.min(59, Math.max(0, Number(e.target.value))))
                  }
                  className="border rounded-2xl px-5 py-3 text-black w-28"
                />
              </div>
              {/* Button */}
              <button
                onClick={updateAllottedTime}
                className="bg-white text-black px-6 py-3 rounded-2xl font-semibold hover:bg-gray-200"
              >
                Update Allotted Time
              </button>
            </div>
          )}
        </div>

        {/* ===================================================== */}
        {/* LOG TIME SECTION (with start/end) */}
        {/* ===================================================== */}
        <div className="mt-16 border-t pt-10">
          <h2 className="text-3xl font-bold mb-6">Log Work Time</h2>
          <div className="bg-gray-50 border rounded-3xl p-6">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <input
                type="date"
                value={workDate}
                onChange={(e) => setWorkDate(e.target.value)}
                className="border rounded-2xl px-4 py-3"
              />
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="border rounded-2xl px-4 py-3"
              />
              <input
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="border rounded-2xl px-4 py-3"
              />
              <input
                type="text"
                placeholder="Work notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="border rounded-2xl px-4 py-3"
              />
              <button
                onClick={logTime}
                className="bg-black hover:bg-gray-800 text-white rounded-2xl px-6 py-3 font-semibold"
              >
                Log Time
              </button>
            </div>
          </div>
        </div>

        {/* ===================================================== */}
        {/* TIME TRACKING LIST with start/end times */}
        {/* ===================================================== */}
        <div className="mt-16 border-t pt-10">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-3xl font-bold">Time Tracking</h2>
              <p className="text-gray-500 mt-2">Work sessions logged for this ticket</p>
            </div>
            <div className="bg-black text-white rounded-2xl px-6 py-4">
              <div className="text-sm opacity-80">Total Time</div>
              <div className="text-2xl font-bold">{formatMinutes(totalMinutes)}</div>
            </div>
          </div>

          {timeEntries.length === 0 ? (
            <div className="bg-gray-50 border rounded-3xl p-8 text-center text-gray-500">
              No time logged for this ticket
            </div>
          ) : (
            <div className="space-y-5">
              {timeEntries
                .slice()
                .reverse()
                .map((entry, idx) => (
                  <div key={idx} className="bg-gray-50 rounded-3xl border p-6">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="bg-blue-100 text-blue-700 px-4 py-2 rounded-full text-sm font-medium">
                            📅{" "}
                            {new Date(entry.work_date).toLocaleDateString("en-IN", {
                              weekday: "long",
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                          <span className="bg-purple-100 text-purple-700 px-4 py-2 rounded-full text-sm font-medium">
                            👤 {entry.user_name || ticket.assigned_to_name || "Unknown"}
                          </span>
                        </div>
                        {entry.start_time && entry.end_time && (
                          <div className="text-sm text-gray-500 mt-2">
                            🕒{" "}
                            {new Date(entry.start_time).toLocaleTimeString("en-IN", {
                              timeZone: "Asia/Kolkata",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}{" "}
                            -{" "}
                            {new Date(entry.end_time).toLocaleTimeString("en-IN", {
                              timeZone: "Asia/Kolkata",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        )}
                        {entry.notes && (
                          <p className="mt-4 text-gray-700 whitespace-pre-wrap">{entry.notes}</p>
                        )}
                      </div>
                      <div className="flex flex-col items-start lg:items-end">
                        <div className="text-3xl font-bold">
                          {formatMinutes(entry.duration_minutes)}
                        </div>
                        <div className="text-sm text-gray-500 mt-1">Time Spent</div>
                        {entry.created_at && (
                          <div className="text-xs text-gray-400 mt-3">
                            Logged on {new Date(entry.created_at).toLocaleString()}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* ===================================================== */}
        {/* ASSIGN TICKET (Admin) */}
        {/* ===================================================== */}
        {user?.role === "Admin" && (
          <div className="mt-16 border-t pt-10">
            <h2 className="text-3xl font-bold mb-6">Assign Ticket</h2>
            <div className="flex flex-col sm:flex-row gap-4">
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="border px-5 py-3 rounded-2xl w-full sm:w-96"
              >
                <option value="">Select Team Member</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              <button
                onClick={assignTicket}
                className="bg-black hover:bg-gray-800 text-white px-8 py-3 rounded-2xl"
              >
                Assign
              </button>
            </div>
          </div>
        )}

        {/* ===================================================== */}
        {/* MAIN TIMELINE (General) */}
        {/* ===================================================== */}
        <div className="mt-16 border-t pt-10">
          <h2 className="text-3xl font-bold mb-8">Ticket Timeline</h2>
          <div className="space-y-5">
            {generalTimeline.length === 0 ? (
              <div className="text-gray-400">No timeline events available</div>
            ) : (
              generalTimeline
                .slice()
                .reverse()
                .map((item, idx) => (
                  <div key={idx} className="bg-gray-50 rounded-3xl p-5 border">
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="font-semibold text-lg">{item.action}</p>
                      {item.type && (
                        <span className="bg-gray-200 text-gray-700 text-xs px-3 py-1 rounded-full">
                          {item.type}
                        </span>
                      )}
                    </div>
                    {item.comment && (
                      <p className="mt-3 text-gray-700 whitespace-pre-wrap">{item.comment}</p>
                    )}
                    <div className="flex gap-4 text-sm text-gray-500 mt-4">
                      <span>{item.user}</span>
                      <span>{item.created_at}</span>
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>

        {/* ===================================================== */}
        {/* COMMENTS TIMELINE */}
        {/* ===================================================== */}
        <div className="mt-16">
          <h2 className="text-2xl font-bold mb-6">Comments Timeline</h2>
          <div className="space-y-4">
            {commentTimeline.length === 0 ? (
              <div className="text-gray-400">No comments yet</div>
            ) : (
              commentTimeline.map((item, idx) => (
                <div key={idx} className="bg-blue-50 border rounded-2xl p-5">
                  <p className="font-semibold">{item.comment}</p>
                  <div className="text-sm text-gray-500 mt-2">
                    {item.user} •{" "}
                    {new Date(item.created_at).toLocaleString("en-IN", {
                      timeZone: "Asia/Kolkata",
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ===================================================== */}
        {/* DUE DATE TIMELINE */}
        {/* ===================================================== */}
        <div className="mt-16">
          <h2 className="text-2xl font-bold mb-6">Due Date Changes</h2>
          <div className="space-y-4">
            {dueDateTimeline.length === 0 ? (
              <div className="text-gray-400">No due date changes</div>
            ) : (
              dueDateTimeline.map((item, idx) => (
                <div key={idx} className="bg-yellow-50 border rounded-2xl p-5">
                  <p className="font-semibold">{item.action}</p>
                  <div className="text-sm text-gray-500 mt-2">{item.user}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ===================================================== */}
        {/* ALLOTTED TIME TIMELINE */}
        {/* ===================================================== */}
        <div className="mt-16">
          <h2 className="text-2xl font-bold mb-6">Allotted Time Changes</h2>
          <div className="space-y-4">
            {allottedTimeline.length === 0 ? (
              <div className="text-gray-400">No allotted time changes</div>
            ) : (
              allottedTimeline.map((item, idx) => (
                <div key={idx} className="bg-green-50 border rounded-2xl p-5">
                  <p className="font-semibold">{item.action}</p>
                  <div className="text-sm text-gray-500 mt-2">{item.user}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}