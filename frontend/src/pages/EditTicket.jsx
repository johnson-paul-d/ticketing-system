import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import api from "../services/api";
import { TICKET_STATUSES } from "../constants/statuses";

export default function EditTicket() {
  const { id } = useParams();
  const navigate = useNavigate();

  // Get current user role from localStorage (or your auth context)
  const storedUser = JSON.parse(localStorage.getItem("user") || "{}");
  const currentUserRole = storedUser.role || "";
  const isAdmin = currentUserRole === "Admin" || currentUserRole === "Super Admin";

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    priority: "Medium",
    category: "",
    division: "",
    status: "Open",
    due_date: "",
  });

  // Additional fields for approval status display
  const [dueDateChangeStatus, setDueDateChangeStatus] = useState("");
  const [dueDateChangeRequestedBy, setDueDateChangeRequestedBy] = useState("");
  const [dueDateChangeRequestedRole, setDueDateChangeRequestedRole] = useState("");

  useEffect(() => {
    fetchTicket();
  }, []);

  const fetchTicket = async () => {
    try {
      const res = await api.get(`/tickets/${id}`);
      const ticket = res.data;

      setFormData({
        title: ticket.title || "",
        description: ticket.description || "",
        priority: ticket.priority || "Medium",
        category: ticket.category || "",
        division: ticket.division || "",
        status: ticket.status || "Open",
        due_date: ticket.due_date || "",
      });

      // Save approval‑related fields for conditional UI
      setDueDateChangeStatus(ticket.due_date_change_status || "");
      setDueDateChangeRequestedBy(ticket.due_date_change_requested_by || "");
      setDueDateChangeRequestedRole(ticket.due_date_change_requested_role || "");
    } catch (error) {
      console.error(error);
      alert("Failed to load ticket");
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      await api.put(`/tickets/${id}`, formData);
      alert("Ticket updated successfully");
      navigate("/tickets");
    } catch (error) {
      console.error(error);
      alert("Update failed");
    }
  };

  // Determine if due date input should be disabled
  const isDueDatePending = dueDateChangeStatus === "Pending";
  const isDueDateBlocked = isDueDatePending && !isAdmin;

  return (
    <MainLayout>
      <div className="bg-white p-8 rounded-2xl shadow-sm">
        <h1 className="text-3xl font-bold mb-8">Edit Ticket</h1>

        <form onSubmit={handleSubmit} className="space-y-5">
          <input
            type="text"
            name="title"
            placeholder="Title"
            value={formData.title}
            onChange={handleChange}
            className="w-full border p-4 rounded-xl"
          />

          <textarea
            name="description"
            placeholder="Description"
            value={formData.description}
            onChange={handleChange}
            className="w-full border p-4 rounded-xl h-40"
          />

          <select
            name="priority"
            value={formData.priority}
            onChange={handleChange}
            className="w-full border p-4 rounded-xl"
          >
            <option>Low</option>
            <option>Medium</option>
            <option>High</option>
            <option>Critical</option>
          </select>

          <select
            name="status"
            value={formData.status}
            onChange={handleChange}
            className="w-full border p-4 rounded-xl"
          >
            {formData.status && !TICKET_STATUSES.includes(formData.status) && (
              <option value={formData.status} disabled>
                {formData.status}
              </option>
            )}
            {TICKET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          {/* Due Date field with pending request handling */}
          <div>
            {isDueDateBlocked && (
              <div className="mb-3 p-3 bg-yellow-50 text-yellow-800 rounded-xl text-sm border border-yellow-200">
                ⏳ A due date change request is already pending approval
                {dueDateChangeRequestedBy && ` (requested by ${dueDateChangeRequestedBy})`}.
                You cannot submit another request until this one is reviewed.
              </div>
            )}
            <input
              type="date"
              name="due_date"
              value={formData.due_date || ""}
              onChange={handleChange}
              disabled={isDueDateBlocked}
              className={`w-full border p-4 rounded-xl ${
                isDueDateBlocked ? "bg-gray-100 text-gray-500 cursor-not-allowed" : ""
              }`}
            />
            {!isAdmin && dueDateChangeStatus !== "Pending" && (
              <p className="text-xs text-gray-500 mt-1">
                Non‑admin users: changing the due date will send a request for approval.
              </p>
            )}
          </div>

          <button
            type="submit"
            className="bg-[#9b2423] hover:bg-[#7d1d1c] text-white px-6 py-4 rounded-xl"
          >
            Save Changes
          </button>
        </form>
      </div>
    </MainLayout>
  );
}