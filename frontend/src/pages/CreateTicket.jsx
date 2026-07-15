import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import api from "../services/api";
import { TICKET_CATEGORIES } from "../constants/categories";
import { TICKET_DIVISIONS } from "../constants/divisions";

export default function CreateTicket() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [category, setCategory] = useState("Exhibition");
  const [division, setDivision] = useState("CPS");
  const [dueDate, setDueDate] = useState("");
  const [givenBy, setGivenBy] = useState("");
  const [projectId, setProjectId] = useState("");
  const [projects, setProjects] = useState([]);
  const [allottedDays, setAllottedDays] = useState(0);
  const [allottedHours, setAllottedHours] = useState(0);
  const [allottedMins, setAllottedMins] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/projects").then((r) => setProjects(r.data || [])).catch(() => {});
  }, []);

  const selectedProject = projects.find((p) => p.id === projectId);

  // Tasks in a project take the project's division
  useEffect(() => {
    if (selectedProject?.division) setDivision(selectedProject.division);
  }, [projectId]);

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) {
      setError("Please fill in both title and description");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await api.post("/tickets", {
        title,
        description,
        priority,
        category,
        division,
        due_date: dueDate || null,
        given_by: givenBy,
        project_id: projectId || null,
        allotted_minutes:
          Math.max(0, allottedDays) * 1440 +
          Math.max(0, allottedHours) * 60 +
          Math.max(0, allottedMins),
      });
      navigate("/tickets");
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || "Failed to create ticket");
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainLayout>
      <div className="font-['Inter',system-ui,sans-serif] px-4 sm:px-6">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight bg-gradient-to-r from-indigo-700 to-cyan-700 bg-clip-text text-transparent">
            Create Ticket
          </h1>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">
            Submit a new support request – fields marked with * are required
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-100 p-5 sm:p-8 max-w-5xl mx-auto">
          {/* Error Alert */}
          {error && (
            <div className="mb-6 p-3 rounded-xl bg-red-50 border-l-4 border-red-500 text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Title */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Ticket Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g., Unable to access Salesforce dashboard"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm sm:text-base focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all outline-none bg-gray-50"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={loading}
            />
          </div>

          {/* Description */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={6}
              placeholder="Describe the issue in detail..."
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm sm:text-base focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all outline-none bg-gray-50 resize-vertical"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={loading}
            />
          </div>

          {/* Row 1: Category + Priority */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Category
              </label>
              <select
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm sm:text-base focus:ring-2 focus:ring-indigo-400 bg-gray-50 outline-none cursor-pointer"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={loading}
              >
                {TICKET_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Priority
              </label>
              <select
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm sm:text-base focus:ring-2 focus:ring-indigo-400 bg-gray-50 outline-none cursor-pointer"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                disabled={loading}
              >
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
                <option>Critical</option>
              </select>
            </div>
          </div>

          {/* Row 2: Division + Due Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Division
              </label>
              <select
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm sm:text-base focus:ring-2 focus:ring-indigo-400 bg-gray-50 outline-none cursor-pointer"
                value={division}
                onChange={(e) => setDivision(e.target.value)}
                disabled={loading}
              >
{TICKET_DIVISIONS.map((division) => (
  <option key={division} value={division}>
    {division}
  </option>
))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Due Date (optional)
              </label>
              <input
                type="date"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm sm:text-base focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all outline-none bg-gray-50"
                value={dueDate}
                max={selectedProject?.target_date || undefined}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={loading}
              />
              {selectedProject?.target_date && (
                <p className="text-xs text-gray-400 mt-1.5">
                  Capped at project target date: {selectedProject.target_date}
                </p>
              )}
            </div>
          </div>

          {/* Project (optional) */}
          {projects.length > 0 && (
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Project (optional)
              </label>
              <select
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm sm:text-base focus:ring-2 focus:ring-indigo-400 bg-gray-50 outline-none cursor-pointer"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                disabled={loading}
              >
                <option value="">— None —</option>
                {projects
                  .filter((p) => p.status === "Active" || p.status === "On Hold")
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.target_date ? ` (target ${p.target_date})` : ""}
                    </option>
                  ))}
              </select>
            </div>
          )}

          {/* Allotted time */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Allotted Time
            </label>
            <div className="grid grid-cols-3 gap-4 max-w-md">
              {[
                { label: "Days", value: allottedDays, set: setAllottedDays },
                { label: "Hours", value: allottedHours, set: setAllottedHours },
                { label: "Minutes", value: allottedMins, set: setAllottedMins },
              ].map((f) => (
                <div key={f.label}>
                  <input
                    type="number"
                    min="0"
                    value={f.value}
                    onChange={(e) => f.set(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm text-center focus:ring-2 focus:ring-indigo-400 bg-gray-50 outline-none"
                    disabled={loading}
                  />
                  <p className="text-xs text-gray-400 text-center mt-1">{f.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Given By field */}
          <div className="mb-8">
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Given By
            </label>
            <input
              type="text"
              placeholder="Enter name of person who gave the ticket"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm sm:text-base focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all outline-none bg-gray-50"
              value={givenBy}
              onChange={(e) => setGivenBy(e.target.value)}
              disabled={loading}
            />
          </div>

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-700 hover:to-cyan-700 text-white font-semibold px-6 py-3 rounded-xl transition-all duration-200 shadow-md disabled:opacity-70 disabled:cursor-not-allowed text-sm sm:text-base w-full sm:w-auto"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Creating...
                </span>
              ) : (
                "Create Ticket →"
              )}
            </button>
            <button
              onClick={() => navigate("/tickets")}
              className="border border-gray-300 bg-white px-6 py-3 rounded-xl hover:bg-gray-50 transition-colors text-gray-700 font-medium text-sm sm:text-base w-full sm:w-auto"
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}