import { useState } from "react";
import { useNavigate } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import api from "../services/api";

export default function CreateTicket() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [category, setCategory] = useState("Exhibition");
  const [division, setDivision] = useState("CPS");
  const [dueDate, setDueDate] = useState("");
  const [givenBy, setGivenBy] = useState("");   // ✅ New state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
        given_by: givenBy,          // ✅ Send given_by
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
                <option>Exhibition</option>
                <option>Salesforce</option>
                <option>BPV</option>
                <option>Linkedin Content</option>
                <option>Collateral</option>
                <option>Lead Generation</option>
                <option>Strategy</option>
                <option>Others</option>
                <option>Advertisement</option>
                <option>Video</option>
                <option>Email Campaign</option>
                <option>Graphic Design</option>
                <option>Linkedin Post</option>
                <option>Website</option>
                <option>Reports</option>
                <option>Branding</option>
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
                <option>CPS</option>
                <option>TMD</option>
                <option>ASTOR</option>
                <option>All User</option>
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
                onChange={(e) => setDueDate(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          {/* ✅ NEW: Given By field */}
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