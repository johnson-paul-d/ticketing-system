import { useEffect, useState, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import socket from "../services/socket";
import useAuthStore from "../store/authStore";
import MainLayout from "../layouts/MainLayout";
import api from "../services/api";

// ----------------------------------------------------------------------
// Multi-Select Dropdown Component (Checkbox based)
// ----------------------------------------------------------------------
const MultiSelect = ({ label, options, selectedValues, onChange, placeholder = "All" }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleOption = (value) => {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter((v) => v !== value));
    } else {
      onChange([...selectedValues, value]);
    }
  };

  const selectAll = () => {
    onChange([...options]);
  };

  const clearAll = () => {
    onChange([]);
  };

  const isAllSelected = selectedValues.length === options.length && options.length > 0;
  const displayText =
    selectedValues.length === 0
      ? placeholder
      : selectedValues.length === 1
      ? selectedValues[0]
      : `${selectedValues.length} selected`;

  return (
    <div className="relative" ref={containerRef}>
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400 uppercase whitespace-nowrap">{label}</span>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="border p-2 rounded-xl bg-white min-w-[140px] text-left flex justify-between items-center"
        >
          <span className="truncate">{displayText}</span>
          <span className="text-gray-400">▼</span>
        </button>
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-64 bg-white border rounded-xl shadow-lg p-3 max-h-60 overflow-y-auto">
          <div className="flex justify-between gap-2 border-b pb-2 mb-2">
            <button
              type="button"
              onClick={selectAll}
              className="text-xs text-blue-600 hover:underline"
            >
              Select All
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="text-xs text-gray-500 hover:underline"
            >
              Clear All
            </button>
          </div>
          {options.map((opt) => (
            <label key={opt} className="flex items-center gap-2 py-1 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedValues.includes(opt)}
                onChange={() => toggleOption(opt)}
                className="rounded"
              />
              <span className="text-sm">{opt}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
};

// ----------------------------------------------------------------------
// Main Tickets Component
// ----------------------------------------------------------------------
export default function Tickets() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [tickets, setTickets] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState({
    key: "due_date",
    direction: "asc",
  });

  // Multi-select filter states
  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [selectedPriorities, setSelectedPriorities] = useState([]);
  const [selectedDivisions, setSelectedDivisions] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);  // <-- ADDED for User filter

  // Single-select filters
  const [overdueFilter, setOverdueFilter] = useState("All");
  const [yearFilter, setYearFilter] = useState("All");
  const [monthFilter, setMonthFilter] = useState("All");

  // ----------------------------------------------------------------------
  // Fetch tickets
  // ----------------------------------------------------------------------
  const fetchTickets = async () => {
    try {
      setLoading(true);
      const res = await api.get("/tickets");
      setTickets(res.data);
    } catch (error) {
      console.error("Fetch tickets error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
    socket.on("ticketCreated", fetchTickets);
    socket.on("ticketUpdated", fetchTickets);
    socket.on("ticketDeleted", fetchTickets);
    return () => {
      socket.off("ticketCreated", fetchTickets);
      socket.off("ticketUpdated", fetchTickets);
      socket.off("ticketDeleted", fetchTickets);
    };
  }, []);

  // ----------------------------------------------------------------------
  // Derived filter options from tickets
  // ----------------------------------------------------------------------
  const statusOptions = useMemo(() => {
    const statuses = new Set(tickets.map((t) => t.status).filter(Boolean));
    return Array.from(statuses).sort();
  }, [tickets]);

  const priorityOptions = useMemo(() => {
    const priorities = new Set(tickets.map((t) => t.priority).filter(Boolean));
    return Array.from(priorities).sort((a, b) => {
      const order = { Critical: 1, High: 2, Medium: 3, Low: 4 };
      return (order[a] || 99) - (order[b] || 99);
    });
  }, [tickets]);

  const divisionOptions = useMemo(() => {
    const divisions = new Set(tickets.map((t) => t.division).filter(Boolean));
    return Array.from(divisions).sort();
  }, [tickets]);

  // ADDED: User options from assigned_to_name or assigned_to
  const userOptions = useMemo(() => {
    const users = new Set(
      tickets
        .map((t) => t.assigned_to_name || t.assigned_to)
        .filter(Boolean)
    );
    return Array.from(users).sort();
  }, [tickets]);

  const yearOptions = useMemo(() => {
    const years = new Set();
    tickets.forEach((ticket) => {
      if (ticket.due_date) {
        const year = new Date(ticket.due_date).getFullYear();
        years.add(year);
      }
      if (ticket.created_at) {
        const year = new Date(ticket.created_at).getFullYear();
        years.add(year);
      }
    });
    return Array.from(years)
      .sort((a, b) => b - a)
      .map(String);
  }, [tickets]);

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  // ----------------------------------------------------------------------
  // Filter logic
  // ----------------------------------------------------------------------
  const filteredTickets = tickets
    .filter((ticket) => {
      // Search filter
      const matchesSearch =
        ticket.title?.toLowerCase().includes(search.toLowerCase()) ||
        ticket.description?.toLowerCase().includes(search.toLowerCase());

      // Multi-select filters
      const matchesStatus =
        selectedStatuses.length === 0 || selectedStatuses.includes(ticket.status);
      const matchesPriority =
        selectedPriorities.length === 0 || selectedPriorities.includes(ticket.priority);
      const matchesDivision =
        selectedDivisions.length === 0 || selectedDivisions.includes(ticket.division);

      // ADDED: User filter
      const assignedUser = ticket.assigned_to_name || ticket.assigned_to;
      const matchesUser =
        selectedUsers.length === 0 || selectedUsers.includes(assignedUser);

      // Overdue filter — finished tickets are never overdue
      const isOverdue =
        ticket.due_date &&
        new Date(ticket.due_date) < new Date() &&
        ticket.status !== "Completed" &&
        ticket.status !== "Closed";
      const matchesOverdue =
        overdueFilter === "All"
          ? true
          : overdueFilter === "Overdue"
          ? isOverdue
          : !isOverdue;

      // Year filter
      let ticketYear = null;
      if (ticket.due_date) ticketYear = new Date(ticket.due_date).getFullYear();
      else if (ticket.created_at) ticketYear = new Date(ticket.created_at).getFullYear();
      const matchesYear =
        yearFilter === "All" || (ticketYear !== null && ticketYear.toString() === yearFilter);

      // Month filter
      let ticketMonth = null;
      if (ticket.due_date) ticketMonth = new Date(ticket.due_date).getMonth();
      else if (ticket.created_at) ticketMonth = new Date(ticket.created_at).getMonth();
      const matchesMonth =
        monthFilter === "All" ||
        (ticketMonth !== null && monthNames[ticketMonth] === monthFilter);

      return (
        matchesSearch &&
        matchesStatus &&
        matchesPriority &&
        matchesDivision &&
        matchesUser &&        // <-- ADDED
        matchesOverdue &&
        matchesYear &&
        matchesMonth
      );
    })
    .sort((a, b) => {
      const key = sortConfig.key;
      let aValue = a[key];
      let bValue = b[key];
      if (key === "due_date" || key === "created_at") {
        aValue = aValue ? new Date(aValue) : new Date(0);
        bValue = bValue ? new Date(bValue) : new Date(0);
      }
      if (typeof aValue === "string" && typeof bValue === "string") {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }
      if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });

  // ----------------------------------------------------------------------
  // Sorting handler
  // ----------------------------------------------------------------------
  const handleSort = (key) => {
    let direction = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  // ----------------------------------------------------------------------
  // Helper functions for styling
  // ----------------------------------------------------------------------
  const getPriorityClass = (priority) => {
    switch (priority) {
      case "Critical":
        return "bg-red-200 text-red-700";
      case "High":
        return "bg-red-100 text-red-600";
      case "Medium":
        return "bg-yellow-100 text-yellow-700";
      case "Low":
        return "bg-green-100 text-green-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const getStatusClass = (status) => {
    switch (status) {
      case "Open":
        return "bg-yellow-100 text-yellow-700";
      case "In Progress":
        return "bg-blue-100 text-blue-700";
      case "Pending Approval":
        return "bg-orange-100 text-orange-700";
      case "Waiting For Sources":
        return "bg-purple-100 text-purple-700";
      case "Waiting For Approval":
        return "bg-orange-100 text-orange-700";
      case "Completed":
        return "bg-green-100 text-green-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const stats = {
    total: tickets.length,
    open: tickets.filter((t) => t.status === "Open").length,
    inProgress: tickets.filter((t) => t.status === "In Progress").length,
    pendingApproval: tickets.filter(
      (t) => t.status === "Pending Approval" || t.status === "Waiting For Approval"
    ).length,
    completed: tickets.filter((t) => t.status === "Completed").length,
  };

  // ----------------------------------------------------------------------
  // Render
  // ----------------------------------------------------------------------
  return (
    <MainLayout>
      {/* HEADER */}
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold">Tickets</h1>
          <p className="text-gray-500 mt-1">Manage and track support tickets</p>
        </div>
        <button
          onClick={() => navigate("/create-ticket")}
          className="bg-black text-white px-5 py-3 rounded-xl w-full lg:w-auto hover:bg-gray-800"
        >
          + Create Ticket
        </button>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 md:gap-6 mb-8">
        <StatCard title="Total" value={stats.total} />
        <StatCard title="Open" value={stats.open} />
        <StatCard title="In Progress" value={stats.inProgress} />
        <StatCard title="Pending Approval" value={stats.pendingApproval} />
        <StatCard title="Completed" value={stats.completed} />
      </div>

      {/* FILTERS */}
      <div className="bg-white rounded-2xl shadow-sm p-5 mb-6">
        <div className="mb-3">
          <h2 className="text-xl font-bold">Filters</h2>
          <p className="text-gray-500 text-sm mt-1">
            Filter tickets by status, priority, campaign, user, overdue period, year or month
          </p>
        </div>

        <div className="flex flex-wrap gap-4 items-end">
          {/* Search */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 uppercase whitespace-nowrap">Search</span>
            <input
              type="text"
              placeholder="Title or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border p-2 rounded-xl w-48"
            />
          </div>

          {/* Multi-select: Status */}
          <MultiSelect
            label="Status"
            options={statusOptions}
            selectedValues={selectedStatuses}
            onChange={setSelectedStatuses}
            placeholder="All statuses"
          />

          {/* Multi-select: Priority */}
          <MultiSelect
            label="Priority"
            options={priorityOptions}
            selectedValues={selectedPriorities}
            onChange={setSelectedPriorities}
            placeholder="All priorities"
          />

          {/* Multi-select: Campaign (Division) */}
          <MultiSelect
            label="Division"
            options={divisionOptions}
            selectedValues={selectedDivisions}
            onChange={setSelectedDivisions}
            placeholder="All divisions"
          />

          {/* ADDED: Multi-select: User */}
          <MultiSelect
            label="User"
            options={userOptions}
            selectedValues={selectedUsers}
            onChange={setSelectedUsers}
            placeholder="All users"
          />

          {/* Overdue filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 uppercase whitespace-nowrap">Overdue</span>
            <select
              value={overdueFilter}
              onChange={(e) => setOverdueFilter(e.target.value)}
              className="border p-2 rounded-xl bg-white"
            >
              <option value="All">All Tasks</option>
              <option value="Overdue">Overdue Tasks</option>
              <option value="NonOverdue">Non Overdue</option>
            </select>
          </div>

          {/* Year filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 uppercase whitespace-nowrap">Year</span>
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="border p-2 rounded-xl bg-white"
            >
              <option value="All">All Years</option>
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          {/* Month filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 uppercase whitespace-nowrap">Month</span>
            <select
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="border p-2 rounded-xl bg-white"
            >
              <option value="All">All Months</option>
              {monthNames.map((month) => (
                <option key={month} value={month}>
                  {month}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-2xl shadow-sm overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr className="text-left">
              <th className="p-5 cursor-pointer" onClick={() => handleSort("title")}>
                Title
              </th>
              <th className="p-5 cursor-pointer" onClick={() => handleSort("division")}>
                Division
              </th>
              <th className="p-5 cursor-pointer" onClick={() => handleSort("category")}>
                Category
              </th>
              <th className="p-5 cursor-pointer" onClick={() => handleSort("priority")}>
                Priority
              </th>
              <th className="p-5 cursor-pointer" onClick={() => handleSort("due_date")}>
                Due Date
              </th>
              <th className="p-5 cursor-pointer" onClick={() => handleSort("created_at")}>
                Created Date
              </th>
              <th className="p-5 cursor-pointer" onClick={() => handleSort("status")}>
                Status
              </th>
              <th className="p-5 cursor-pointer" onClick={() => handleSort("assigned_to_name")}>
                Assigned
              </th>
              <th className="p-5 cursor-pointer" onClick={() => handleSort("given_by")}>
                Given By
              </th>
              <th className="p-5">Logged Time</th>
              <th className="p-5">Allotted Time</th>
              <th className="p-5">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredTickets.map((ticket) => {
              const isOverdue =
                ticket.due_date &&
                new Date(ticket.due_date) < new Date() &&
                ticket.status !== "Completed" &&
                ticket.status !== "Closed";

              const totalMinutes = (ticket.time_entries || []).reduce(
                (sum, entry) => sum + (entry.duration_minutes || 0),
                0
              );

              const formatHours = (minutes) => {
                const hrs = Math.floor(minutes / 60);
                const mins = minutes % 60;
                if (hrs === 0) return `${mins}m`;
                return `${hrs}h ${mins}m`;
              };

              return (
                <tr
                  key={ticket.id}
                  className={`border-t hover:bg-gray-50 ${isOverdue ? "bg-red-50" : ""}`}
                >
                  <td className="p-5">
                    <div>
                      <p className="font-semibold">{ticket.title}</p>
                      <p className="text-sm text-gray-500">{ticket.description}</p>
                    </div>
                  </td>
                  <td className="p-5">{ticket.division}</td>
                  <td className="p-5">{ticket.category}</td>
                  <td className="p-5">
                    <span
                      className={`px-3 py-1 rounded-full text-sm ${getPriorityClass(
                        ticket.priority
                      )}`}
                    >
                      {ticket.priority}
                    </span>
                  </td>
                  <td className="p-5">
                    {ticket.due_date ? (
                      <span className={isOverdue ? "text-red-600 font-semibold" : ""}>
                        {new Date(ticket.due_date).toLocaleDateString()}
                      </span>
                    ) : (
                      <span className="text-gray-400">No Due Date</span>
                    )}
                  </td>
                  <td className="p-5">
                    {ticket.created_at ? (
                      new Date(ticket.created_at).toLocaleDateString()
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="p-5">
                    <span
                      className={`px-3 py-1 rounded-full text-sm ${getStatusClass(ticket.status)}`}
                    >
                      {ticket.status}
                    </span>
                  </td>
                  <td className="p-5">{ticket.assigned_to_name || ticket.assigned_to || "Unassigned"}</td>
                  <td className="p-5">{ticket.given_by || "—"}</td>
                  <td className="p-5">{formatHours(totalMinutes)}</td>
                  <td className="p-5">{formatHours(ticket.allotted_minutes || 0)}</td>
                  <td className="p-5">
                    <button
                      onClick={() => navigate(`/tickets/${ticket.id}`)}
                      className="bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800"
                    >
                      View
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && filteredTickets.length === 0 && (
          <div className="p-10 text-center text-gray-500">No tickets found</div>
        )}
        {loading && <div className="p-10 text-center text-gray-500">Loading tickets...</div>}
      </div>
    </MainLayout>
  );
}

// ----------------------------------------------------------------------
// Stat Card Component
// ----------------------------------------------------------------------
function StatCard({ title, value }) {
  return (
    <div className="bg-white rounded-2xl p-5 md:p-6 shadow-sm">
      <p className="text-gray-500 text-sm">{title}</p>
      <h2 className="text-2xl md:text-3xl font-bold mt-2">{value}</h2>
    </div>
  );
}