import { useEffect, useState } from "react";
import MainLayout from "../layouts/MainLayout";
import api from "../services/api";
import moment from "moment";

export default function TimeTracker() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search state
  const [search, setSearch] = useState("");

  // Permission request state
  const [permissionStart, setPermissionStart] = useState("");
  const [permissionEnd, setPermissionEnd] = useState("");
  const [permissionReason, setPermissionReason] = useState("");
  const [permissionType, setPermissionType] = useState("2hours");
  const [submittingPermission, setSubmittingPermission] = useState(false);

  // Leave request state
  const [leaveType, setLeaveType] = useState("Casual Leave");
  const [leaveStartDate, setLeaveStartDate] = useState("");
  const [leaveEndDate, setLeaveEndDate] = useState("");
  const [leaveReason, setLeaveReason] = useState("");
  const [submittingLeave, setSubmittingLeave] = useState(false);

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const res = await api.get("/tickets");
      setTickets(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Log time (existing)
  const logTime = async (ticketId, workDate, startTime, endTime, notes) => {
    try {
      const duration = Math.round(
        (new Date(endTime) - new Date(startTime)) / 60000
      );
      await api.post("/ticket-time-entries", {
        ticket_id: ticketId,
        work_date: workDate,
        start_time: startTime,
        end_time: endTime,
        duration_minutes: duration,
        notes,
      });
      fetchTickets();
    } catch (err) {
      console.error(err);
    }
  };

  // =====================================================
  // PERMISSION REQUEST – FIXED PAYLOAD
  // =====================================================
  const handlePermissionRequest = async () => {
    if (!permissionStart || !permissionEnd || !permissionReason) {
      alert("Please fill all permission fields");
      return;
    }
    setSubmittingPermission(true);
    try {
      const start = new Date(permissionStart);
      const end = new Date(permissionEnd);
      const durationMinutes = Math.round((end - start) / 60000);

      await api.post("/permission-requests", {
        permission_date: permissionStart.split("T")[0],   // YYYY-MM-DD
        from_time: permissionStart.split("T")[1],        // HH:MM:SS
        to_time: permissionEnd.split("T")[1],
        duration_minutes: durationMinutes,
        reason: permissionReason,
        permission_type: permissionType,
      });
      alert("Permission request submitted");
      // Reset form
      setPermissionStart("");
      setPermissionEnd("");
      setPermissionReason("");
      setPermissionType("2hours");
    } catch (err) {
      console.error(err);
      alert("Failed to submit permission request");
    } finally {
      setSubmittingPermission(false);
    }
  };

  // =====================================================
  // LEAVE REQUEST – FIXED PAYLOAD
  // =====================================================
  const handleLeaveRequest = async () => {
    if (!leaveStartDate || !leaveEndDate || !leaveReason) {
      alert("Please fill all leave fields");
      return;
    }
    const start = new Date(leaveStartDate);
    const end = new Date(leaveEndDate);
    const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    if (totalDays <= 0) {
      alert("End date must be after start date");
      return;
    }

    setSubmittingLeave(true);
    try {
      await api.post("/leave-requests", {
        leave_type: leaveType,
        from_date: leaveStartDate,   // FIXED
        to_date: leaveEndDate,       // FIXED
        total_days: totalDays,
        reason: leaveReason,
      });
      alert("Leave request submitted");
      // Reset form
      setLeaveType("Casual Leave");
      setLeaveStartDate("");
      setLeaveEndDate("");
      setLeaveReason("");
    } catch (err) {
      console.error(err);
      alert("Failed to submit leave request");
    } finally {
      setSubmittingLeave(false);
    }
  };

  // Filtered tickets based on search
  const filteredTickets = tickets.filter((ticket) =>
    ticket.title?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <MainLayout>
        <div className="p-10">Loading...</div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="p-4 lg:p-6">
        {/* HEADER */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold">Time Tracker</h1>
          <p className="text-gray-500 mt-2">Log work sessions & requests</p>
        </div>

        {/* SEARCH INPUT */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="Search tickets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full lg:w-96 border rounded-2xl px-5 py-3"
          />
        </div>

        {/* PERMISSION REQUEST SECTION */}
        <div className="bg-white rounded-3xl border p-6 mb-8">
          <h2 className="text-2xl font-bold mb-2">Permission Request</h2>
          <p className="text-gray-500 mb-5">Request short time off (1h, 2h, half day)</p>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <select
              value={permissionType}
              onChange={(e) => setPermissionType(e.target.value)}
              className="border rounded-2xl px-4 py-3"
            >
              <option value="1hour">1 hour</option>
              <option value="2hours">2 hours</option>
              <option value="halfday">Half day</option>
            </select>
            <input
              type="datetime-local"
              value={permissionStart}
              onChange={(e) => setPermissionStart(e.target.value)}
              className="border rounded-2xl px-4 py-3"
            />
            <input
              type="datetime-local"
              value={permissionEnd}
              onChange={(e) => setPermissionEnd(e.target.value)}
              className="border rounded-2xl px-4 py-3"
            />
            <input
              type="text"
              placeholder="Reason"
              value={permissionReason}
              onChange={(e) => setPermissionReason(e.target.value)}
              className="border rounded-2xl px-4 py-3"
            />
            <button
              onClick={handlePermissionRequest}
              disabled={submittingPermission}
              className="bg-[#9b2423] hover:bg-[#7d1d1c] text-white rounded-2xl px-6 py-3 font-semibold disabled:opacity-50"
            >
              {submittingPermission ? "Submitting..." : "Request Permission"}
            </button>
          </div>
        </div>

        {/* LEAVE REQUEST SECTION */}
        <div className="bg-white rounded-3xl border p-6 mb-8">
          <h2 className="text-2xl font-bold mb-2">Leave Request</h2>
          <p className="text-gray-500 mb-5">Apply for leaves (Casual, Sick, WFH, etc.)</p>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <select
              value={leaveType}
              onChange={(e) => setLeaveType(e.target.value)}
              className="border rounded-2xl px-4 py-3"
            >
              <option>Casual Leave</option>
              <option>Sick Leave</option>
              <option>Work From Home</option>
              <option>Emergency Leave</option>
              <option>Comp Off</option>
            </select>
            <input
              type="date"
              value={leaveStartDate}
              onChange={(e) => setLeaveStartDate(e.target.value)}
              className="border rounded-2xl px-4 py-3"
            />
            <input
              type="date"
              value={leaveEndDate}
              onChange={(e) => setLeaveEndDate(e.target.value)}
              className="border rounded-2xl px-4 py-3"
            />
            <input
              type="text"
              placeholder="Reason"
              value={leaveReason}
              onChange={(e) => setLeaveReason(e.target.value)}
              className="border rounded-2xl px-4 py-3"
            />
            <button
              onClick={handleLeaveRequest}
              disabled={submittingLeave}
              className="bg-green-600 hover:bg-green-700 text-white rounded-2xl px-6 py-3 font-semibold disabled:opacity-50"
            >
              {submittingLeave ? "Submitting..." : "Request Leave"}
            </button>
          </div>
        </div>

        {/* TICKETS SECTION */}
        <div className="space-y-4">
          {filteredTickets.length === 0 ? (
            <div className="text-center py-10 text-gray-500">No tickets found</div>
          ) : (
            filteredTickets.map((ticket) => (
              <LogTimeCard key={ticket.id} ticket={ticket} onLogTime={logTime} />
            ))
          )}
        </div>
      </div>
    </MainLayout>
  );
}

// =====================================================
// LOG TIME CARD (unchanged)
// =====================================================
function LogTimeCard({ ticket, onLogTime }) {
  const [workDate, setWorkDate] = useState(new Date().toISOString().split("T")[0]);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [notes, setNotes] = useState("");

  const handleSave = async () => {
    if (!startTime || !endTime) {
      return alert("Select start & end time");
    }
    await onLogTime(ticket.id, workDate, startTime, endTime, notes);
    alert("Time logged");
    setNotes("");
  };

  let duration = 0;
  if (startTime && endTime) {
    duration = Math.round((new Date(endTime) - new Date(startTime)) / 60000);
  }

  return (
    <div className="bg-white rounded-3xl border p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-xl font-bold">{ticket.title}</h2>
        <p className="text-gray-500 mt-1">{ticket.assigned_to_name}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
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
          onClick={handleSave}
          className="bg-black hover:bg-gray-800 text-white rounded-2xl px-6 py-3 font-semibold"
        >
          Log Time
        </button>
      </div>

      <div className="mt-4">
        <span className="bg-gray-100 px-4 py-2 rounded-full text-sm font-medium">
          ⏱ Duration: {Math.floor(duration / 60)}h {duration % 60}m
        </span>
      </div>

      {ticket.time_entries && ticket.time_entries.length > 0 && (
        <div className="mt-6 border-t pt-6">
          <h3 className="font-bold mb-4">Previous Logs</h3>
          <div className="space-y-3">
            {ticket.time_entries.map((entry) => (
              <div key={entry.id} className="bg-gray-50 border rounded-2xl p-4">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                  <div>
                    <div className="font-semibold">📅 {entry.work_date}</div>
                    <div className="text-sm text-gray-500 mt-1">
                      🕒 {moment(entry.start_time).format("hh:mm A")} -{" "}
                      {moment(entry.end_time).format("hh:mm A")}
                    </div>
                    {entry.notes && <div className="text-sm mt-2">{entry.notes}</div>}
                  </div>
                  <div className="text-lg font-bold">
                    {Math.floor(entry.duration_minutes / 60)}h {entry.duration_minutes % 60}m
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}