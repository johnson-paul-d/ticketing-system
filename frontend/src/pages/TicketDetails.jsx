import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import api from "../services/api";
import useAuthStore from "../store/authStore";
import socket from "../services/socket";
import moment from "moment";
import { TICKET_CATEGORIES } from "../constants/categories";
import { TICKET_DIVISIONS } from "../constants/divisions";

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
  const [timeEntries, setTimeEntries] = useState([]);
  const [workDate, setWorkDate] = useState(new Date().toISOString().split("T")[0]);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [notes, setNotes] = useState("");
  const [allottedMinutes, setAllottedMinutes] = useState(0);
  const [allottedDays, setAllottedDays] = useState(0);
  const [allottedHours, setAllottedHours] = useState(0);
  const [allottedMins, setAllottedMins] = useState(0);
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [editWorkDate, setEditWorkDate] = useState("");
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const [requestDueDate, setRequestDueDate] = useState("");
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closeReason, setCloseReason] = useState("");

  useEffect(() => {
    fetchTicket();
    if (user?.role === "Admin") fetchUsers();
    socket.on("ticketUpdated", fetchTicket);
    return () => socket.off("ticketUpdated", fetchTicket);
  }, [user]);

  const fetchTicket = async () => {
    try {
      const res = await api.get(`/tickets/${id}`);
      setTicket(res.data);
      setDueDate(res.data.due_date || "");
      setStatus(res.data.status || "Open");
      setTimeline(res.data.timeline || []);
      setTimeEntries(res.data.time_entries || []);
      const mins = Math.max(0, res.data.allotted_minutes || 0);
      setAllottedMinutes(mins);
      setAllottedDays(Math.floor(mins / (60 * 24)));
      setAllottedHours(Math.floor((mins % (60 * 24)) / 60));
      setAllottedMins(mins % 60);
      setTitleInput(res.data.title || "");
      // Reset request due date field
      setRequestDueDate("");
    } catch (err) {
      console.error(err);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await api.get("/users");
      setUsers(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const formatMinutes = (minutes) => {
    const safeMinutes = Math.max(0, minutes);
    const days = Math.floor(safeMinutes / (60 * 24));
    const hours = Math.floor((safeMinutes % (60 * 24)) / 60);
    const mins = safeMinutes % 60;
    return `${days}d ${hours}h ${mins}m`;
  };

  const updateAllottedTime = async () => {
    try {
      const total = Math.max(0, allottedDays) * 24 * 60 + Math.max(0, allottedHours) * 60 + Math.max(0, allottedMins);
      await api.put(`/tickets/${ticket.id}`, { allotted_minutes: total });
      alert("Allotted time updated");
      fetchTicket();
    } catch (err) {
      console.error(err);
      alert("Failed to update allotted time");
    }
  };

  const assignTicket = async () => {
    if (!selectedUser) return alert("Select a team member");
    try {
      const selected = users.find((u) => u.id === selectedUser);
      await api.put(`/tickets/${ticket.id}/assign`, { assigned_to: selected.id, assigned_to_name: selected.name });
      alert("Ticket assigned");
      fetchTicket();
      setSelectedUser("");
    } catch (err) {
      alert("Assignment failed");
    }
  };

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

  const isAdmin = user?.role === "Admin" || user?.role === "Super Admin";

  const updateDueDate = async () => {
    if (!dueDate) {
      alert("Please select a due date");
      return;
    }
    try {
      if (isAdmin) {
        // Admin: update due date directly, no approval needed
        await api.put(`/tickets/${ticket.id}`, {
          due_date: dueDate,
          comment: comment || "Due date updated by admin",
        });
        alert("Due date updated");
      } else {
        // Non-admin: submit for approval
        await api.put(`/tickets/${ticket.id}`, {
          requested_due_date: dueDate,
          due_date_change_status: "Pending",
          due_date_change_requested_by: user.name,
          due_date_change_requested_at: new Date().toISOString(),
          comment: comment || "Due date change request",
        });
        alert("Due date change request submitted for approval");
      }
      fetchTicket();
      setComment("");
      setDueDate("");
    } catch (err) {
      alert("Failed to update due date");
    }
  };

  // Approve due date change
  const approveDueDate = async () => {
    try {
      await api.put(`/tickets/${ticket.id}`, {
        due_date: ticket.requested_due_date,
        due_date_change_status: "Approved",
        requested_due_date: null,
      });
      alert("Due date change approved");
      fetchTicket();
    } catch (err) {
      console.error(err);
      alert("Failed to approve due date change");
    }
  };

  // Reject due date change
  const rejectDueDate = async () => {
    try {
      await api.put(`/tickets/${ticket.id}`, {
        due_date_change_status: "Rejected",
        requested_due_date: null,
      });
      alert("Due date change rejected");
      fetchTicket();
    } catch (err) {
      console.error(err);
      alert("Failed to reject due date change");
    }
  };

  const updateStatus = async () => {
    if (status === "Closed") {
      setShowCloseModal(true);
      return;
    }
    try {
      await api.put(`/tickets/${ticket.id}`, { status, comment });
      fetchTicket();
      setComment("");
      alert("Status updated");
    } catch (err) {
      alert("Failed to update status");
    }
  };

  const closeTicket = async () => {
    if (!closeReason.trim()) {
      alert("Please provide a reason for closing");
      return;
    }
    try {
      const closedOn = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
      const closureNote = `\n\n---\nClose requested by ${user?.name || "Admin"} on ${closedOn}\nReason: ${closeReason.trim()}`;
      const updatedDescription = (ticket.description || "") + closureNote;
      await api.put(`/tickets/${ticket.id}`, {
        status: "Closed",
        description: updatedDescription,
        comment: `Close requested — Reason: ${closeReason.trim()}`,
      });
      setShowCloseModal(false);
      setCloseReason("");
      fetchTicket();
      alert("Close request submitted. Waiting for admin approval.");
    } catch (err) {
      const msg = err?.response?.data?.message || "Failed to submit close request";
      alert(msg);
    }
  };

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

  const logTime = async () => {
    try {
      if (!workDate || !startTime || !endTime) return alert("Please select date, start time and end time");
      const startDateTime = moment(`${workDate} ${startTime}`, "YYYY-MM-DD HH:mm").format("YYYY-MM-DDTHH:mm:ss");
      const endDateTime = moment(`${workDate} ${endTime}`, "YYYY-MM-DD HH:mm").format("YYYY-MM-DDTHH:mm:ss");
      const startMoment = moment(startDateTime, "YYYY-MM-DDTHH:mm:ss");
      const endMoment = moment(endDateTime, "YYYY-MM-DDTHH:mm:ss");
      if (endMoment <= startMoment) return alert("End time must be greater than start time");
      const duration = endMoment.diff(startMoment, "minutes");
      if (duration > 480) return alert("Maximum 8 hours can be logged");
      await api.post("/ticket-time-entries", {
        ticket_id: ticket.id,
        work_date: workDate,
        start_time: startDateTime,
        end_time: endDateTime,
        duration_minutes: duration,
        notes,
        user_name: user?.name,
      });
      alert("Time logged successfully");
      setStartTime("");
      setEndTime("");
      setNotes("");
      fetchTicket();
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.message || "Failed to log time");
    }
  };

  const startEditEntry = (entry) => {
    setEditingEntryId(entry.id);
    setEditWorkDate(new Date(entry.work_date).toISOString().split("T")[0]);
    setEditStartTime(moment(entry.start_time).format("HH:mm"));
    setEditEndTime(moment(entry.end_time).format("HH:mm"));
    setEditNotes(entry.notes || "");
  };

  const updateTimeEntry = async (entryId) => {
    try {
      const startDateTime = moment(`${editWorkDate} ${editStartTime}`, "YYYY-MM-DD HH:mm").format("YYYY-MM-DDTHH:mm:ss");
      const endDateTime = moment(`${editWorkDate} ${editEndTime}`, "YYYY-MM-DD HH:mm").format("YYYY-MM-DDTHH:mm:ss");
      const startMoment = moment(startDateTime, "YYYY-MM-DDTHH:mm:ss");
      const endMoment = moment(endDateTime, "YYYY-MM-DDTHH:mm:ss");
      if (endMoment <= startMoment) return alert("End time must be greater than start time");
      const duration = endMoment.diff(startMoment, "minutes");
      if (duration > 480) return alert("Maximum 8 hours can be logged");
      await api.put(`/ticket-time-entries/${entryId}`, {
        work_date: editWorkDate,
        start_time: startDateTime,
        end_time: endDateTime,
        duration_minutes: duration,
        notes: editNotes,
      });
      alert("Time updated successfully");
      setEditingEntryId(null);
      fetchTicket();
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.message || "Failed to update time");
    }
  };

  const updateTicketTitle = async () => {
    if (!titleInput.trim()) return alert("Title cannot be empty");
    try {
      await api.put(`/tickets/${ticket.id}`, { title: titleInput });
      alert("Ticket title updated");
      setEditingTitle(false);
      fetchTicket();
    } catch (err) {
      console.error(err);
      alert("Failed to update title");
    }
  };

  const totalMinutes = timeEntries.reduce((sum, entry) => sum + Math.max(0, entry.duration_minutes || 0), 0);
  const remainingMinutes = Math.max(0, allottedMinutes - totalMinutes);

  const generalTimeline = timeline.filter(t => t.type !== "comment_add" && t.type !== "due_date" && t.type !== "time_log" && t.type !== "allotted_time");
  const commentTimeline = timeline.filter(t => t.type === "comment_add");
  const dueDateTimeline = timeline.filter(t => t.type === "due_date");
  const allottedTimeline = timeline.filter(t => t.type === "allotted_time");

  if (!ticket) return <MainLayout>Loading...</MainLayout>;

  return (
    <>
    <MainLayout>
      <div className="bg-white rounded-3xl shadow-sm p-8">
        {/* HEADER */}
        <div className="flex flex-col lg:flex-row justify-between lg:items-start gap-6">
          <div>
            {user?.role === "Admin" && editingTitle ? (
              <div className="flex flex-col sm:flex-row gap-4 items-start">
                <input
                  type="text"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  className="border rounded-2xl px-4 py-3 text-4xl lg:text-5xl font-bold w-full"
                />
                <div className="flex gap-2">
                  <button
                    onClick={updateTicketTitle}
                    className="bg-black hover:bg-gray-800 text-white px-5 py-3 rounded-2xl whitespace-nowrap"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setEditingTitle(false);
                      setTitleInput(ticket.title);
                    }}
                    className="bg-gray-300 hover:bg-gray-400 text-black px-5 py-3 rounded-2xl whitespace-nowrap"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <h1 className="text-4xl lg:text-5xl font-bold">{ticket.title}</h1>
                {user?.role === "Admin" && (
                  <button
                    onClick={() => {
                      setEditingTitle(true);
                      setTitleInput(ticket.title);
                    }}
                    className="text-gray-400 hover:text-gray-600 text-sm underline"
                  >
                    Edit
                  </button>
                )}
              </div>
            )}
            <p className="text-gray-500 mt-2">Ticket ID: {ticket.id}</p>
            <div className="flex flex-wrap gap-3 mt-5">
              <span className="bg-gray-100 px-4 py-2 rounded-full text-sm font-medium">{ticket.status}</span>
              {ticket.approval_status && <span className="bg-yellow-100 text-yellow-700 px-4 py-2 rounded-full text-sm font-medium">Approval: {ticket.approval_status}</span>}
              {/* NEW: Pending due date approval badge */}
              {ticket.due_date_change_status === "Pending" && (
                <span className="bg-orange-100 text-orange-700 px-4 py-2 rounded-full text-sm font-medium">
                  Due Date Approval Pending
                </span>
              )}
            </div>
          </div>
          {user?.role === "Admin" && (
            <button onClick={deleteTicket} className="bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-2xl">Delete Ticket</button>
          )}
        </div>

        {/* APPROVAL */}
        {ticket.status === "Waiting For Approval" && user?.role === "Admin" && (
          <div className="mt-8 bg-yellow-50 border border-yellow-200 rounded-3xl p-6">
            <h2 className="text-2xl font-bold">Approval Required</h2>
            <p className="text-gray-600 mt-2">This ticket requires manager approval.</p>
            <div className="flex gap-4 mt-6">
              <button onClick={approveTicket} className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-2xl">Approve</button>
              <button onClick={rejectTicket} className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-2xl">Reject</button>
            </div>
          </div>
        )}

        {/* NEW: Admin approval UI for due date change */}
        {user?.role === "Admin" && ticket.due_date_change_status === "Pending" && (
          <div className="mt-8 bg-orange-50 border border-orange-200 rounded-2xl p-5">
            <h3 className="font-bold text-xl">Due Date Change Approval Required</h3>
            <div className="mt-4 space-y-2">
              <p>
                <span className="font-semibold">Current Due Date:</span>{" "}
                {ticket.due_date || "Not set"}
              </p>
              <p>
                <span className="font-semibold">Requested Due Date:</span>{" "}
                {ticket.requested_due_date || "Not provided"}
              </p>
              <p>
                <span className="font-semibold">Requested By:</span>{" "}
                {ticket.due_date_change_requested_by || "Unknown"}
              </p>
            </div>
            <div className="flex gap-4 mt-6">
              <button
                onClick={approveDueDate}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl"
              >
                Approve
              </button>
              <button
                onClick={rejectDueDate}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl ml-3"
              >
                Reject
              </button>
            </div>
          </div>
        )}

        {/* DETAILS - LEFT AND RIGHT COLUMNS */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mt-12">
          {/* LEFT COLUMN */}
          <div className="space-y-8">
            {/* DESCRIPTION */}
            <div>
              <p className="font-semibold text-gray-500">Description</p>
              {user?.role === "Admin" ? (
                <div className="flex flex-col gap-3 mt-3">
                  <textarea
                    value={ticket.description || ""}
                    onChange={(e) =>
                      setTicket({
                        ...ticket,
                        description: e.target.value,
                      })
                    }
                    className="border rounded-2xl px-4 py-3 w-full h-32"
                  />
                  <button
                    onClick={async () => {
                      try {
                        await api.put(`/tickets/${ticket.id}`, {
                          description: ticket.description,
                        });
                        alert("Description updated");
                        fetchTicket();
                      } catch (err) {
                        console.error(err);
                        alert("Failed to update description");
                      }
                    }}
                    className="bg-black hover:bg-gray-800 text-white px-5 py-3 rounded-2xl w-fit"
                  >
                    Update
                  </button>
                </div>
              ) : (
                <p className="text-lg font-medium mt-2">{ticket.description}</p>
              )}
            </div>

            {/* PRIORITY */}
            <div>
              <p className="font-semibold text-gray-500">Priority</p>
              {user?.role === "Admin" ? (
                <div className="flex gap-4 mt-3">
                  <select
                    value={ticket.priority || ""}
                    onChange={(e) =>
                      setTicket({
                        ...ticket,
                        priority: e.target.value,
                      })
                    }
                    className="border rounded-2xl px-4 py-3 w-full"
                  >
                    <option>Low</option>
                    <option>Medium</option>
                    <option>High</option>
                    <option>Critical</option>
                  </select>
                  <button
                    onClick={async () => {
                      try {
                        await api.put(`/tickets/${ticket.id}`, {
                          priority: ticket.priority,
                        });
                        alert("Priority updated");
                        fetchTicket();
                      } catch (err) {
                        console.error(err);
                        alert("Failed to update priority");
                      }
                    }}
                    className="bg-black hover:bg-gray-800 text-white px-5 py-3 rounded-2xl"
                  >
                    Update
                  </button>
                </div>
              ) : (
                <p className="text-lg font-medium mt-2">{ticket.priority}</p>
              )}
            </div>

            {/* CATEGORY */}
            <div>
              <p className="font-semibold text-gray-500">Category</p>
              {user?.role === "Admin" ? (
                <div className="flex gap-4 mt-3">
                  <select
                    value={ticket.category || ""}
                    onChange={(e) =>
                      setTicket({
                        ...ticket,
                        category: e.target.value,
                      })
                    }
                    className="border rounded-2xl px-4 py-3 w-full"
                  >
                    <option value="">Select Category</option>
                    {TICKET_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={async () => {
                      try {
                        await api.put(`/tickets/${ticket.id}`, {
                          category: ticket.category,
                        });
                        alert("Category updated");
                        fetchTicket();
                      } catch (err) {
                        console.error(err);
                        alert("Failed to update category");
                      }
                    }}
                    className="bg-black hover:bg-gray-800 text-white px-5 py-3 rounded-2xl"
                  >
                    Update
                  </button>
                </div>
              ) : (
                <p className="text-lg font-medium mt-2">{ticket.category}</p>
              )}
            </div>

            {/* DUE DATE DISPLAY */}
            <div>
              <p className="font-semibold text-gray-500">Due Date</p>
              <p className="text-lg font-medium mt-2">
                {ticket.due_date || "Not set"}
                {ticket.due_date_change_status === "Pending" && (
                  <span className="ml-3 text-sm text-orange-600 bg-orange-100 px-2 py-1 rounded-full">
                    Change requested to {ticket.requested_due_date}
                  </span>
                )}
              </p>
            </div>

            {/* DIVISION */}
            <div>
              <p className="font-semibold text-gray-500">Division</p>
              {user?.role === "Admin" ? (
                <div className="flex gap-4 mt-3">
                  <select
                    value={ticket.division || ""}
                    onChange={(e) =>
                      setTicket({
                        ...ticket,
                        division: e.target.value,
                      })
                    }
                    className="border rounded-2xl px-4 py-3 w-full"
                  >
                    <option value="">Select Division</option>
                    {TICKET_DIVISIONS.map((division) => (
                      <option key={division} value={division}>
                        {division}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={async () => {
                      try {
                        await api.put(`/tickets/${ticket.id}`, {
                          division: ticket.division,
                        });
                        alert("Division updated");
                        fetchTicket();
                      } catch (err) {
                        console.error(err);
                        alert("Failed to update division");
                      }
                    }}
                    className="bg-black hover:bg-gray-800 text-white px-5 py-3 rounded-2xl"
                  >
                    Update
                  </button>
                </div>
              ) : (
                <p className="text-lg font-medium mt-2">{ticket.division}</p>
              )}
            </div>

            {/* GIVEN BY */}
            <div>
              <p className="font-semibold text-gray-500">Given By</p>
              {user?.role === "Admin" ? (
                <div className="flex flex-col sm:flex-row gap-4 mt-3">
                  <input
                    type="text"
                    value={ticket.given_by || ""}
                    onChange={(e) => setTicket({ ...ticket, given_by: e.target.value })}
                    placeholder="Enter Given By"
                    className="border rounded-2xl px-4 py-3 w-full"
                  />
                  <button
                    onClick={async () => {
                      try {
                        await api.put(`/tickets/${ticket.id}`, { given_by: ticket.given_by });
                        alert("Given By updated");
                        fetchTicket();
                      } catch (err) {
                        console.error(err);
                        alert("Failed to update Given By");
                      }
                    }}
                    className="bg-black hover:bg-gray-800 text-white px-5 py-3 rounded-2xl whitespace-nowrap"
                  >
                    Update
                  </button>
                </div>
              ) : (
                <p className="text-lg font-medium mt-2">{ticket.given_by || "Not specified"}</p>
              )}
            </div>
          </div> {/* end LEFT COLUMN */}

          {/* RIGHT COLUMN */}
          <div className="space-y-8">
            {/* Update Status */}
            <div>
              <p className="font-semibold text-gray-500">Update Status</p>
              <div className="flex flex-col sm:flex-row gap-4 mt-3">
                <select value={status} onChange={(e) => setStatus(e.target.value)} className="border rounded-2xl px-4 py-3 w-full">
                  <option>Open</option>
                  <option>In Progress</option>
                  <option>Waiting For Sources</option>
                  <option>Completed</option>
                  <option>Closed</option>
                </select>
                <button onClick={updateStatus} className="bg-black hover:bg-gray-800 text-white px-5 py-3 rounded-2xl whitespace-nowrap">Update</button>
              </div>
            </div>

            {/* Due Date */}
            <div>
              <p className="font-semibold text-gray-500">
                {isAdmin ? "Update Due Date" : "Request Due Date Change"}
              </p>
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
                  disabled={!isAdmin && ticket.due_date_change_status === "Pending"}
                >
                  {isAdmin ? "Update" : "Request Change"}
                </button>
              </div>
              {!isAdmin && ticket.due_date_change_status === "Pending" && (
                <p className="text-sm text-orange-600 mt-2">
                  A due date change request is pending approval.
                </p>
              )}
            </div>

            {/* Comment */}
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
                  if (comment) updateStatus();
                  else alert("Write a comment first");
                }}
                className="mt-3 bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded-xl text-sm"
              >
                Attach comment
              </button>
            </div>

            {/* Assigned To */}
            <div>
              <p className="font-semibold text-gray-500 mb-3">Assigned To</p>
              <div className="bg-gray-100 border rounded-2xl px-5 py-4 inline-flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center font-bold">
                  {(ticket.assigned_to_name || "U")[0]}
                </div>
                <div>
                  <p className="font-semibold">{ticket.assigned_to_name || "Unassigned"}</p>
                  <p className="text-sm text-gray-500">Ticket Owner</p>
                </div>
              </div>
            </div>

            {/* ASSIGN TICKET */}
            {user?.role === "Admin" && (
              <div className="mt-8">
                <p className="font-semibold text-gray-500 mb-3">Assign Team Member</p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <select
                    value={selectedUser}
                    onChange={(e) => setSelectedUser(e.target.value)}
                    className="border px-5 py-3 rounded-2xl w-full"
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
                    className="bg-black hover:bg-gray-800 text-white px-8 py-3 rounded-2xl whitespace-nowrap"
                  >
                    Assign
                  </button>
                </div>
                {ticket.assigned_to_name && (
                  <p className="text-sm text-gray-500 mt-3">
                    Currently assigned to{" "}
                    <span className="font-semibold text-black">
                      {ticket.assigned_to_name}
                    </span>
                  </p>
                )}
              </div>
            )}
          </div> {/* end RIGHT COLUMN */}
        </div> {/* end grid */}

        {/* ALLOTTED / CONSUMED / REMAINING */}
        <div className="mt-12 bg-black text-white rounded-3xl p-8">
          <h2 className="text-3xl font-bold">Ticket Time Allocation</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
            <div className="bg-white/10 rounded-2xl p-5"><div className="text-sm opacity-80">Allotted</div><div className="text-3xl font-bold mt-2">{formatMinutes(allottedMinutes)}</div></div>
            <div className="bg-white/10 rounded-2xl p-5"><div className="text-sm opacity-80">Consumed</div><div className="text-3xl font-bold mt-2">{formatMinutes(totalMinutes)}</div></div>
            <div className="bg-white/10 rounded-2xl p-5"><div className="text-sm opacity-80">Remaining</div><div className="text-3xl font-bold mt-2">{formatMinutes(remainingMinutes)}</div></div>
          </div>
          {user?.role === "Admin" && (
            <div className="mt-8 flex flex-wrap items-end gap-4">
              <div><label className="block text-sm mb-2">Days</label><input type="number" min="0" value={allottedDays} onChange={(e) => setAllottedDays(Math.max(0, Number(e.target.value)))} className="border rounded-2xl px-5 py-3 text-black w-28" /></div>
              <div><label className="block text-sm mb-2">Hours</label><input type="number" min="0" max="23" value={allottedHours} onChange={(e) => setAllottedHours(Math.min(23, Math.max(0, Number(e.target.value))))} className="border rounded-2xl px-5 py-3 text-black w-28" /></div>
              <div><label className="block text-sm mb-2">Minutes</label><input type="number" min="0" max="59" value={allottedMins} onChange={(e) => setAllottedMins(Math.min(59, Math.max(0, Number(e.target.value))))} className="border rounded-2xl px-5 py-3 text-black w-28" /></div>
              <button onClick={updateAllottedTime} className="bg-white text-black px-6 py-3 rounded-2xl font-semibold hover:bg-gray-200">Update Allotted Time</button>
            </div>
          )}
        </div>

        {/* LOG TIME */}
        <div className="mt-16 border-t pt-10">
          <h2 className="text-3xl font-bold mb-6">Log Work Time</h2>
          <div className="bg-gray-50 border rounded-3xl p-6">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div><label className="block text-sm font-medium mb-2">Date</label><input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} className="border rounded-2xl px-4 py-3 w-full" /></div>
              <div><label className="block text-sm font-medium mb-2">Start Time</label><input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="border rounded-2xl px-4 py-3 w-full" /></div>
              <div><label className="block text-sm font-medium mb-2">End Time</label><input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="border rounded-2xl px-4 py-3 w-full" /></div>
              <div><label className="block text-sm font-medium mb-2">Notes</label><input type="text" placeholder="Work notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="border rounded-2xl px-4 py-3 w-full" /></div>
              <div className="flex items-end"><button onClick={logTime} className="bg-black hover:bg-gray-800 text-white rounded-2xl px-6 py-3 font-semibold w-full">Log Time</button></div>
            </div>
            <p className="text-sm text-gray-500 mt-4">Maximum allowed work log is 8 hours per entry.</p>
          </div>
        </div>

        {/* TIME TRACKING LIST */}
        <div className="mt-16 border-t pt-10">
          <div className="flex items-center justify-between mb-8">
            <div><h2 className="text-3xl font-bold">Time Tracking</h2><p className="text-gray-500 mt-2">Work sessions logged for this ticket</p></div>
            <div className="bg-black text-white rounded-2xl px-6 py-4"><div className="text-sm opacity-80">Total Time</div><div className="text-2xl font-bold">{formatMinutes(totalMinutes)}</div></div>
          </div>
          {timeEntries.length === 0 ? (
            <div className="bg-gray-50 border rounded-3xl p-8 text-center text-gray-500">No time logged for this ticket</div>
          ) : (
            <div className="space-y-5">
              {timeEntries.slice().reverse().map((entry) => (
                <div key={entry.id} className="bg-gray-50 rounded-3xl border p-6">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                    {editingEntryId !== entry.id ? (
                      <>
                        <div>
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="bg-blue-100 text-blue-700 px-4 py-2 rounded-full text-sm font-medium">📅 {new Date(entry.work_date).toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "short", day: "numeric" })}</span>
                            <span className="bg-purple-100 text-purple-700 px-4 py-2 rounded-full text-sm font-medium">👤 {entry.user_name || ticket.assigned_to_name || "Unknown"}</span>
                          </div>
                          {entry.start_time && entry.end_time && <div className="text-sm text-gray-500 mt-2">🕒 {moment(entry.start_time).format("hh:mm A")} - {moment(entry.end_time).format("hh:mm A")}</div>}
                          {entry.notes && <p className="mt-4 text-gray-700 whitespace-pre-wrap">{entry.notes}</p>}
                        </div>
                        <div className="flex flex-col items-start lg:items-end gap-3">
                          <div><div className="text-3xl font-bold">{formatMinutes(entry.duration_minutes)}</div><div className="text-sm text-gray-500 mt-1">Time Spent</div></div>
                          <button onClick={() => startEditEntry(entry)} className="bg-black text-white px-5 py-2 rounded-xl hover:bg-gray-800">Edit</button>
                        </div>
                      </>
                    ) : (
                      <div className="w-full">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <input type="date" value={editWorkDate} onChange={(e) => setEditWorkDate(e.target.value)} className="border rounded-2xl px-4 py-3" />
                          <input type="time" value={editStartTime} onChange={(e) => setEditStartTime(e.target.value)} className="border rounded-2xl px-4 py-3" />
                          <input type="time" value={editEndTime} onChange={(e) => setEditEndTime(e.target.value)} className="border rounded-2xl px-4 py-3" />
                          <input type="text" value={editNotes} placeholder="Notes" onChange={(e) => setEditNotes(e.target.value)} className="border rounded-2xl px-4 py-3" />
                        </div>
                        <div className="flex gap-3 mt-5">
                          <button onClick={() => updateTimeEntry(entry.id)} className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-xl">Save</button>
                          <button onClick={() => setEditingEntryId(null)} className="bg-gray-300 hover:bg-gray-400 px-5 py-2 rounded-xl">Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* TIMELINES */}
        <div className="mt-16 border-t pt-10"><h2 className="text-3xl font-bold mb-8">Ticket Timeline</h2><div className="space-y-5">{generalTimeline.length === 0 ? <div className="text-gray-400">No timeline events available</div> : generalTimeline.slice().reverse().map((item, idx) => (<div key={idx} className="bg-gray-50 rounded-3xl p-5 border"><div className="flex flex-wrap items-center gap-3"><p className="font-semibold text-lg">{item.action}</p>{item.type && <span className="bg-gray-200 text-gray-700 text-xs px-3 py-1 rounded-full">{item.type}</span>}</div>{item.comment && <p className="mt-3 text-gray-700 whitespace-pre-wrap">{item.comment}</p>}<div className="flex gap-4 text-sm text-gray-500 mt-4"><span>{item.user}</span><span>{item.created_at}</span></div></div>))}</div></div>
        <div className="mt-16"><h2 className="text-2xl font-bold mb-6">Comments Timeline</h2><div className="space-y-4">{commentTimeline.length === 0 ? <div className="text-gray-400">No comments yet</div> : commentTimeline.map((item, idx) => (<div key={idx} className="bg-blue-50 border rounded-2xl p-5"><p className="font-semibold">{item.comment}</p><div className="text-sm text-gray-500 mt-2">{item.user} • {new Date(item.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</div></div>))}</div></div>
        <div className="mt-16"><h2 className="text-2xl font-bold mb-6">Due Date Changes</h2><div className="space-y-4">{dueDateTimeline.length === 0 ? <div className="text-gray-400">No due date changes</div> : dueDateTimeline.map((item, idx) => (<div key={idx} className="bg-yellow-50 border rounded-2xl p-5"><p className="font-semibold">{item.action}</p><div className="text-sm text-gray-500 mt-2">{item.user}</div></div>))}</div></div>
        <div className="mt-16"><h2 className="text-2xl font-bold mb-6">Allotted Time Changes</h2><div className="space-y-4">{allottedTimeline.length === 0 ? <div className="text-gray-400">No allotted time changes</div> : allottedTimeline.map((item, idx) => (<div key={idx} className="bg-green-50 border rounded-2xl p-5"><p className="font-semibold">{item.action}</p><div className="text-sm text-gray-500 mt-2">{item.user}</div></div>))}</div></div>
      </div>
    </MainLayout>

    {/* CLOSE TICKET MODAL */}
    {showCloseModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-lg mx-4">
          <h2 className="text-2xl font-bold text-red-600">Request Ticket Closure</h2>
          <p className="text-gray-500 mt-2">
            Provide a reason for closing <span className="font-semibold text-black">"{ticket?.title}"</span>.
            This will be sent for admin approval before the ticket is closed.
          </p>
          <textarea
            value={closeReason}
            onChange={(e) => setCloseReason(e.target.value)}
            placeholder="e.g. Duplicate ticket, issue resolved offline, no longer required..."
            className="mt-5 border rounded-2xl px-4 py-3 w-full h-36 focus:outline-none focus:ring-2 focus:ring-red-400"
            autoFocus
          />
          <div className="flex gap-3 mt-6">
            <button
              onClick={closeTicket}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-3 rounded-2xl"
            >
              Request Closure
            </button>
            <button
              onClick={() => { setShowCloseModal(false); setCloseReason(""); setStatus(ticket?.status || "Open"); }}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-black font-semibold px-6 py-3 rounded-2xl"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}