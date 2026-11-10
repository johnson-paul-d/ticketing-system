// Rejecting a completion request: the reason is required, and a change of
// brief is marked as such so it is not counted as a quality correction.
import { useState } from "react";
import { X, Loader2, Undo2 } from "lucide-react";
import api from "../../services/api";

export default function SendBackDialog({ ticket, onClose, onDone }) {
  const [reason, setReason] = useState("");
  const [scopeChange, setScopeChange] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!reason.trim()) return setError("Say what needs to change.");
    setSaving(true);
    setError("");
    try {
      await api.put(`/tickets/${ticket.id}/reject`, { reason: reason.trim(), scope_change: scopeChange });
      onDone?.();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || "Could not send it back. Please try again.");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/40 backdrop-blur-[2px]" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-6 pt-5">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-widest text-gray-400 font-semibold">Send back</p>
            <h3 className="text-base font-bold mt-1 break-words">{ticket.title}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1 -mr-2" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="px-6 py-4 space-y-3">
          <textarea
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="What needs to change?"
            className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#9b2423]/20 resize-none"
          />
          <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer select-none">
            <input type="checkbox" checked={scopeChange} onChange={(e) => setScopeChange(e.target.checked)} className="mt-1 accent-[#9b2423]" />
            <span>
              The brief changed (scope change)
              <span className="block text-xs text-gray-400">Not counted against first-time pass</span>
            </span>
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="px-6 pb-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-gray-900 hover:bg-black disabled:opacity-40 flex items-center gap-2"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Undo2 size={16} />}
            Send back
          </button>
        </div>
      </div>
    </div>
  );
}
