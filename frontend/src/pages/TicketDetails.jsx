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

  const assignTicket = async () => {
    if (!selectedUser) return alert("Select a team member");
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

  const updateDueDate = async () => {
    try {
      await api.put(`/tickets/${ticket.id}`, { due_date: dueDate, comment });
      fetchTicket();
      setComment("");
      alert("Due date updated");
    } catch (err) {
      alert("Failed to update due date");
    }
  };

  const updateStatus = async () => {
    try {
      await api.put(`/tickets/${ticket.id}`, { status, comment });
      fetchTicket();
      setComment("");
      alert("Status updated");
    } catch (err) {
      alert("Failed to update status");
    }
  };

const approveTicket = async () => {
  try {

    await api.put(
      `/tickets/${ticket.id}/approve`
    );

    fetchTicket();

    alert("Ticket approved");

  } catch (err) {

    console.error(err);

    alert("Approval failed");
  }
};

const rejectTicket = async () => {
  try {

    await api.put(
      `/tickets/${ticket.id}/reject`
    );

    fetchTicket();

    alert("Ticket rejected");

  } catch (err) {

    console.error(err);

    alert("Reject failed");
  }
};

  if (!ticket) return <MainLayout>Loading...</MainLayout>;

  return (
    <MainLayout>
      <div className="bg-white rounded-3xl shadow-sm p-8">
        <div className="flex flex-col lg:flex-row justify-between lg:items-start gap-6">
          <div>
            <h1 className="text-4xl lg:text-5xl font-bold">{ticket.title}</h1>
            <p className="text-gray-500 mt-2">Ticket ID: {ticket.id}</p>
            <div className="flex flex-wrap gap-3 mt-5">
              <span className="bg-gray-100 px-4 py-2 rounded-full text-sm font-medium">{ticket.status}</span>
              {ticket.approval_status && (
                <span className="bg-yellow-100 text-yellow-700 px-4 py-2 rounded-full text-sm font-medium">
                  Approval: {ticket.approval_status}
                </span>
              )}
            </div>
          </div>
          {user?.role === "Admin" && (
            <button onClick={deleteTicket} className="bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-2xl">
              Delete Ticket
            </button>
          )}
        </div>

        {ticket.status === "Waiting For Approval" && user?.role === "Admin" && (
          <div className="mt-8 bg-yellow-50 border border-yellow-200 rounded-3xl p-6">
            <h2 className="text-2xl font-bold">Approval Required</h2>
            <p className="text-gray-600 mt-2">This ticket requires manager approval.</p>
            <div className="flex gap-4 mt-6">
              <button onClick={approveTicket} className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-2xl">
                Approve
              </button>
              <button onClick={rejectTicket} className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-2xl">
                Reject
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mt-12">
          <div className="space-y-8">
            <div><p className="font-semibold text-gray-500">Description</p><p className="text-lg font-medium mt-2">{ticket.description}</p></div>
            <div><p className="font-semibold text-gray-500">Priority</p><p className="text-lg font-medium mt-2">{ticket.priority}</p></div>
            <div><p className="font-semibold text-gray-500">Category</p><p className="text-lg font-medium mt-2">{ticket.category}</p></div>
            <div><p className="font-semibold text-gray-500">Due Date</p><p className="text-lg font-medium mt-2">{ticket.due_date || "Not set"}</p></div>
          </div>
          <div className="space-y-8">
            <div><p className="font-semibold text-gray-500">Assigned To</p><p className="text-lg font-medium mt-2">{ticket.assigned_to_name || "Unassigned"}</p></div>
            <div>
              <p className="font-semibold text-gray-500">Update Status</p>
              <div className="flex flex-col sm:flex-row gap-4 mt-3">
                <select value={status} onChange={(e) => setStatus(e.target.value)} className="border rounded-2xl px-4 py-3 w-full">
                  <option>Open</option>
                  <option>In Progress</option>
                  <option>Waiting For Sources</option>
                  <option>Completed</option>
                </select>
                <button onClick={updateStatus} className="bg-black hover:bg-gray-800 text-white px-5 py-3 rounded-2xl whitespace-nowrap">
                  Update
                </button>
              </div>
            </div>
            <div>
              <p className="font-semibold text-gray-500">Due Date</p>
              <div className="flex flex-col sm:flex-row gap-4 mt-3">
                <input type="date" value={dueDate || ""} onChange={(e) => setDueDate(e.target.value)} className="border rounded-2xl px-4 py-3 w-full" />
                <button onClick={updateDueDate} className="bg-black hover:bg-gray-800 text-white px-5 py-3 rounded-2xl whitespace-nowrap">
                  Update
                </button>
              </div>
            </div>
            <div>
              <p className="font-semibold text-gray-500">Comment</p>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add comment... Use @name to tag users"
                className="border rounded-2xl px-4 py-3 w-full h-32 mt-3"
              />
              <button onClick={() => { if (comment) updateStatus(); else alert("Write a comment first"); }} className="mt-3 bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded-xl text-sm">
                Attach comment to next update
              </button>
            </div>
          </div>
        </div>

        {user?.role === "Admin" && (
          <div className="mt-16 border-t pt-10">
            <h2 className="text-3xl font-bold mb-6">Assign Ticket</h2>
            <div className="flex flex-col sm:flex-row gap-4">
              <select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)} className="border px-5 py-3 rounded-2xl w-full sm:w-96">
                <option value="">Select Team Member</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <button onClick={assignTicket} className="bg-black hover:bg-gray-800 text-white px-8 py-3 rounded-2xl">Assign</button>
            </div>
          </div>
        )}

        <div className="mt-16 border-t pt-10">
          <h2 className="text-3xl font-bold mb-8">Ticket Timeline</h2>
          <div className="space-y-5">
            {timeline.length === 0 ? <div className="text-gray-400">No timeline available</div> :
              timeline.slice().reverse().map((item, idx) => (
                <div key={idx} className="bg-gray-50 rounded-3xl p-5 border">
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="font-semibold text-lg">{item.action}</p>
                    {item.type && <span className="bg-gray-200 text-gray-700 text-xs px-3 py-1 rounded-full">{item.type}</span>}
                  </div>
                  {item.comment && <p className="mt-3 text-gray-700 whitespace-pre-wrap">{item.comment}</p>}
                  {item.mentions?.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-4">
                      {item.mentions.map((mention, i) => <span key={i} className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs">{mention}</span>)}
                    </div>
                  )}
                  <div className="flex gap-4 text-sm text-gray-500 mt-4">
                    <span>{item.user}</span>
                    <span>{item.created_at}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}