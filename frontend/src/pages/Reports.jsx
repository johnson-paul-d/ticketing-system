import { useEffect, useState, useMemo } from "react";
import MainLayout from "../layouts/MainLayout";
import api from "../services/api";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { useNavigate } from "react-router-dom";

const STATUS_TABS = ["All", "Open", "In Progress", "Completed", "Closed"];

const STATUS_COLORS = {
  Open:                 "bg-blue-100 text-blue-700",
  "In Progress":        "bg-yellow-100 text-yellow-700",
  "Waiting For Sources":"bg-orange-100 text-orange-700",
  "Waiting For Approval":"bg-purple-100 text-purple-700",
  Completed:            "bg-green-100 text-green-700",
  Closed:               "bg-gray-200 text-gray-600",
};

const PRIORITY_COLORS = {
  Critical: "bg-red-100 text-red-700",
  High:     "bg-orange-100 text-orange-700",
  Medium:   "bg-yellow-100 text-yellow-700",
  Low:      "bg-green-100 text-green-700",
};

export default function Reports() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [statusFilter, setStatusFilter] = useState("All");
  const [search, setSearch] = useState("");

  const fetchTickets = async () => {
    try {
      const res = await api.get("/tickets");
      setTickets(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  const filtered = useMemo(() => {
    let result = tickets;
    if (statusFilter !== "All") {
      result = result.filter((t) => t.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.title?.toLowerCase().includes(q) ||
          t.assigned_to_name?.toLowerCase().includes(q) ||
          t.division?.toLowerCase().includes(q) ||
          t.priority?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [tickets, statusFilter, search]);

  const counts = useMemo(() => ({
    all:       tickets.length,
    open:      tickets.filter((t) => t.status === "Open").length,
    inProgress:tickets.filter((t) => t.status === "In Progress").length,
    completed: tickets.filter((t) => t.status === "Completed").length,
    closed:    tickets.filter((t) => t.status === "Closed").length,
  }), [tickets]);

  const exportExcel = () => {
    const rows = filtered.map((t) => ({
      ID: t.id,
      Title: t.title,
      Status: t.status,
      Priority: t.priority,
      Division: t.division,
      "Assigned To": t.assigned_to_name,
      "Due Date": t.due_date,
      "Created At": t.created_at,
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook  = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Reports");
    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([excelBuffer], { type: "application/octet-stream" }), "reports.xlsx");
  };

  return (
    <MainLayout>
      {/* HEADER */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Reports</h1>
          <p className="text-gray-500 mt-1">Enterprise reporting center</p>
        </div>
        <button onClick={exportExcel} className="bg-black text-white px-6 py-3 rounded-xl">
          Export Excel
        </button>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <ReportCard label="Total"       value={counts.all}        color="border-gray-300" />
        <ReportCard label="Open"        value={counts.open}        color="border-blue-400" />
        <ReportCard label="In Progress" value={counts.inProgress}  color="border-yellow-400" />
        <ReportCard label="Completed"   value={counts.completed}   color="border-green-400" />
        <ReportCard label="Closed"      value={counts.closed}      color="border-gray-400" />
      </div>

      {/* FILTER TABS */}
      <div className="flex flex-wrap gap-2 mb-5">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setStatusFilter(tab)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
              statusFilter === tab
                ? "bg-black text-white border-black"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
            }`}
          >
            {tab}
            <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${statusFilter === tab ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"}`}>
              {tab === "All"         ? counts.all
               : tab === "Open"      ? counts.open
               : tab === "In Progress" ? counts.inProgress
               : tab === "Completed" ? counts.completed
               : counts.closed}
            </span>
          </button>
        ))}

        {/* Search */}
        <input
          type="text"
          placeholder="Search tickets..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ml-auto border rounded-xl px-4 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-black"
        />
      </div>

      {/* TICKET TABLE */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">No tickets found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {["Title", "Status", "Priority", "Division", "Assigned To", "Due Date"].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => navigate(`/tickets/${t.id}`)}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="px-5 py-4 font-medium max-w-[260px] truncate">{t.title}</td>
                  <td className="px-5 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[t.status] || "bg-gray-100 text-gray-600"}`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${PRIORITY_COLORS[t.priority] || "bg-gray-100 text-gray-600"}`}>
                      {t.priority}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-gray-600">{t.division || "—"}</td>
                  <td className="px-5 py-4 text-gray-600">{t.assigned_to_name || "Unassigned"}</td>
                  <td className="px-5 py-4 text-gray-500">
                    {t.due_date
                      ? new Date(t.due_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-gray-400 mt-3 text-right">
        Showing {filtered.length} of {tickets.length} tickets
      </p>
    </MainLayout>
  );
}

function ReportCard({ label, value, color }) {
  return (
    <div className={`bg-white rounded-2xl p-5 shadow-sm border-l-4 ${color}`}>
      <p className="text-gray-500 text-sm">{label}</p>
      <h2 className="text-3xl font-bold mt-2">{value}</h2>
    </div>
  );
}
