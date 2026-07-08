import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  XCircle,
  CalendarClock,
  ClipboardCheck,
  Loader2,
  ExternalLink,
  MessageSquare,
} from "lucide-react";
import MainLayout from "../layouts/MainLayout";
import api from "../services/api";
import socket from "../services/socket";

const priorityStyles = {
  Critical: "bg-red-600 text-white",
  High: "bg-red-100 text-red-700",
  Medium: "bg-amber-100 text-amber-700",
  Low: "bg-emerald-100 text-emerald-700",
};

function PriorityBadge({ priority }) {
  return (
    <span
      className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
        priorityStyles[priority] || "bg-gray-100 text-gray-600"
      }`}
    >
      {priority || "—"}
    </span>
  );
}

// The closure/approval comment is pushed as a comment_add entry in the same
// update that requests approval, so match it by timestamp proximity to the
// latest "Approval requested" timeline entry
function approvalComment(ticket) {
  const timeline = Array.isArray(ticket.timeline) ? ticket.timeline : [];
  const comments = timeline.filter((e) => e.type === "comment_add" && e.comment);
  if (comments.length === 0) return null;

  const approvalEntry = [...timeline]
    .reverse()
    .find((e) => e.type === "approval" && e.action?.startsWith("Approval requested"));
  if (!approvalEntry?.created_at) return comments[comments.length - 1];

  const approvalTime = new Date(approvalEntry.created_at).getTime();
  const attached = comments.filter(
    (e) => Math.abs(new Date(e.created_at).getTime() - approvalTime) <= 5000
  );
  return attached[attached.length - 1] || null;
}

function CommentBlock({ entry }) {
  if (!entry) return null;
  return (
    <div className="mt-2 flex items-start gap-2 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-sm text-gray-600">
      <MessageSquare size={14} className="text-gray-400 mt-0.5 flex-shrink-0" />
      <p className="whitespace-pre-wrap break-words min-w-0">
        {entry.comment}
        {entry.user && (
          <span className="text-xs text-gray-400"> — {entry.user}</span>
        )}
      </p>
    </div>
  );
}

function ActionButtons({ busy, onApprove, onReject }) {
  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      <button
        onClick={onApprove}
        disabled={!!busy}
        className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl transition"
      >
        {busy === "approve" ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <CheckCircle2 size={16} />
        )}
        Approve
      </button>
      <button
        onClick={onReject}
        disabled={!!busy}
        className="flex items-center gap-1.5 bg-white hover:bg-red-50 disabled:opacity-50 text-red-600 border border-red-200 text-sm font-semibold px-4 py-2 rounded-xl transition"
      >
        {busy === "reject" ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <XCircle size={16} />
        )}
        Reject
      </button>
    </div>
  );
}

export default function PendingApprovals() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null); // "<ticketId>:<action>"
  const [message, setMessage] = useState(null); // { type, text }

  const fetchTickets = async () => {
    try {
      const res = await api.get("/tickets");
      setTickets(res.data || []);
    } catch (error) {
      console.error("Failed to fetch tickets", error);
      setMessage({ type: "error", text: "Failed to load pending requests" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
    socket.on("ticketUpdated", fetchTickets);
    socket.on("ticketCreated", fetchTickets);
    return () => {
      socket.off("ticketUpdated", fetchTickets);
      socket.off("ticketCreated", fetchTickets);
    };
  }, []);

  const completionRequests = tickets.filter(
    (t) => t.status === "Waiting For Approval" && t.approval_status === "Pending"
  );
  const dueDateRequests = tickets.filter(
    (t) => t.due_date_change_status === "Pending" && t.requested_due_date
  );

  const flash = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const run = async (ticket, action, request) => {
    setBusyId(`${ticket.id}:${action}`);
    try {
      await request();
      setTickets((prev) => prev.filter((t) => t.id !== ticket.id));
      flash(
        "success",
        `"${ticket.title}" ${action === "approve" ? "approved" : "rejected"}`
      );
      fetchTickets();
    } catch (error) {
      console.error(error);
      flash(
        "error",
        error.response?.data?.message || `Failed to ${action} "${ticket.title}"`
      );
    } finally {
      setBusyId(null);
    }
  };

  const approveCompletion = (t) =>
    run(t, "approve", () => api.put(`/tickets/${t.id}/approve`));
  const rejectCompletion = (t) =>
    run(t, "reject", () => api.put(`/tickets/${t.id}/reject`));
  const approveDueDate = (t) =>
    run(t, "approve", () =>
      api.put(`/tickets/${t.id}`, { due_date_change_status: "Approved" })
    );
  const rejectDueDate = (t) =>
    run(t, "reject", () =>
      api.put(`/tickets/${t.id}`, { due_date_change_status: "Rejected" })
    );

  const busyFor = (t) => {
    if (busyId === `${t.id}:approve`) return "approve";
    if (busyId === `${t.id}:reject`) return "reject";
    return null;
  };

  const totalPending = completionRequests.length + dueDateRequests.length;

  return (
    <MainLayout>
      <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">Pending Requests</h1>
          <p className="text-sm text-gray-500 mt-1">
            Approve or reject ticket completions and due date changes in one click
          </p>
        </div>
        <span className="bg-[#9b2423] text-white text-sm font-semibold px-4 py-2 rounded-full">
          {totalPending} pending
        </span>
      </div>

      {message && (
        <div
          className={`mb-6 px-4 py-3 rounded-xl text-sm font-medium ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24 text-gray-400 gap-2">
          <Loader2 size={20} className="animate-spin" /> Loading pending requests…
        </div>
      ) : (
        <div className="space-y-10">
          {/* ===== TICKET COMPLETION APPROVALS ===== */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <ClipboardCheck size={20} className="text-[#9b2423]" />
              <h2 className="text-xl font-semibold">Ticket Approvals</h2>
              <span className="bg-gray-100 text-gray-600 text-xs font-semibold px-2.5 py-1 rounded-full">
                {completionRequests.length}
              </span>
            </div>

            {completionRequests.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-sm p-8 text-center text-gray-400">
                No tickets waiting for approval
              </div>
            ) : (
              <div className="space-y-3">
                {completionRequests.map((t) => (
                  <div
                    key={t.id}
                    className="bg-white rounded-2xl shadow-sm p-5 flex items-center justify-between gap-4 flex-wrap"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          to={`/tickets/${t.id}`}
                          className="font-semibold text-base hover:text-[#9b2423] transition flex items-center gap-1"
                        >
                          {t.title}
                          <ExternalLink size={13} className="text-gray-400" />
                        </Link>
                        <PriorityBadge priority={t.priority} />
                        {t.division && (
                          <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
                            {t.division}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mt-1.5">
                        <span className="font-medium text-gray-700">
                          {t.approval_requested_by || t.assigned_to_name || "Unknown"}
                        </span>{" "}
                        requested approval for{" "}
                        <span className="font-medium text-gray-700">
                          {t.approval_requested_status || "Completed"}
                        </span>
                        {t.due_date && <> · Due {t.due_date}</>}
                      </p>
                      <CommentBlock entry={approvalComment(t)} />
                    </div>
                    <ActionButtons
                      busy={busyFor(t)}
                      onApprove={() => approveCompletion(t)}
                      onReject={() => rejectCompletion(t)}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ===== DUE DATE CHANGE APPROVALS ===== */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <CalendarClock size={20} className="text-[#9b2423]" />
              <h2 className="text-xl font-semibold">Due Date Approvals</h2>
              <span className="bg-gray-100 text-gray-600 text-xs font-semibold px-2.5 py-1 rounded-full">
                {dueDateRequests.length}
              </span>
            </div>

            {dueDateRequests.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-sm p-8 text-center text-gray-400">
                No due date change requests
              </div>
            ) : (
              <div className="space-y-3">
                {dueDateRequests.map((t) => (
                  <div
                    key={t.id}
                    className="bg-white rounded-2xl shadow-sm p-5 flex items-center justify-between gap-4 flex-wrap"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          to={`/tickets/${t.id}`}
                          className="font-semibold text-base hover:text-[#9b2423] transition flex items-center gap-1"
                        >
                          {t.title}
                          <ExternalLink size={13} className="text-gray-400" />
                        </Link>
                        <PriorityBadge priority={t.priority} />
                      </div>
                      <p className="text-sm text-gray-500 mt-1.5">
                        <span className="font-medium text-gray-700">
                          {t.due_date_change_requested_by || "Unknown"}
                        </span>{" "}
                        requested:{" "}
                        <span className="line-through">
                          {t.due_date || "Not set"}
                        </span>{" "}
                        →{" "}
                        <span className="font-semibold text-[#9b2423]">
                          {t.requested_due_date}
                        </span>
                        {t.due_date_change_requested_at && (
                          <> · {t.due_date_change_requested_at}</>
                        )}
                      </p>
                    </div>
                    <ActionButtons
                      busy={busyFor(t)}
                      onApprove={() => approveDueDate(t)}
                      onReject={() => rejectDueDate(t)}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </MainLayout>
  );
}
