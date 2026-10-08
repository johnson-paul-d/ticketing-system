import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, Loader2 } from "lucide-react";
import api from "../services/api";
import useAuthStore from "../store/authStore";
import logo from "../assets/Sieger_logo.png";

// Where a sign-in with a temporary password lands, and where anyone signed in
// can change their password. Until a new password is set the server refuses
// every other request (services/api.js sends those back here), so this page
// stands on its own rather than inside the app's layout.
export default function ChangePassword() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const login = useAuthStore((state) => state.login);
  const logout = useAuthStore((state) => state.logout);

  const forced = !!user?.mustChangePassword;
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirm) {
      setError("Fill in all three fields");
      return;
    }
    if (newPassword !== confirm) {
      setError("The two new passwords do not match");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await api.post("/auth/change-password", { currentPassword, newPassword });
      // The server issues a fresh token without the temporary mark.
      login(res.data.user, res.data.token);
      navigate("/dashboard");
    } catch (err) {
      // A 401 here is the session itself: a temporary sign-in lasts an hour.
      // (A wrong current password is a 400.) Back to the sign-in page, with a
      // line saying why, rather than "Invalid token" under a password form.
      if (err?.response?.status === 401) {
        logout();
        navigate("/", {
          state: {
            info: forced
              ? "Your temporary sign-in ran out. Sign in again with the temporary password to set your own."
              : "Your session ran out. Sign in again to change your password.",
          },
        });
        return;
      }
      setError(err?.response?.data?.message || "Could not change the password");
    } finally {
      setSaving(false);
    }
  };

  const leave = () => {
    if (forced) {
      logout();
      navigate("/");
    } else if (window.history.length > 1) {
      navigate(-1);
    } else {
      // Opened straight from the address bar: nothing to go back to.
      navigate("/dashboard");
    }
  };

  const inputCls =
    "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 outline-none focus:ring-2 focus:ring-[#9b2423]/40";
  const labelCls = "block text-xs font-semibold text-gray-500 mb-1.5";

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-10 font-['Inter',system-ui,sans-serif]">
      <form onSubmit={submit} className="bg-white w-full max-w-md rounded-3xl shadow-xl border border-gray-100 p-6 sm:p-8">
        <img src={logo} alt="Sieger" className="h-10 mb-6" />
        <h1 className="text-xl font-bold flex items-center gap-2">
          <KeyRound size={20} className="text-[#9b2423]" /> {forced ? "Set your password" : "Change password"}
        </h1>
        <p className="text-sm text-gray-500 mt-1 mb-6">
          {forced
            ? "You signed in with a temporary password. Choose one of your own to continue; nothing else opens until you do."
            : `Signed in as ${user?.name || user?.email || "you"}.`}
        </p>

        {error && (
          <div className="mb-4 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl border border-red-200">{error}</div>
        )}

        <label htmlFor="current-password" className={labelCls}>
          {forced ? "Temporary password" : "Current password"}
        </label>
        <input
          id="current-password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className={`${inputCls} mb-4`}
          disabled={saving}
        />
        <label htmlFor="new-password" className={labelCls}>New password (at least 8 characters)</label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className={`${inputCls} mb-4`}
          disabled={saving}
        />
        <label htmlFor="confirm-password" className={labelCls}>New password again</label>
        <input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={`${inputCls} mb-6`}
          disabled={saving}
        />

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-[#9b2423] hover:bg-[#7d1d1c] disabled:opacity-60 text-white font-semibold text-sm px-6 py-3 rounded-xl"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
            {forced ? "Set password" : "Change password"}
          </button>
          <button
            type="button"
            onClick={leave}
            disabled={saving}
            className="px-5 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            {forced ? "Sign out" : "Cancel"}
          </button>
        </div>
      </form>
    </div>
  );
}
