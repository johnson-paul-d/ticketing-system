import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import useAuthStore from "../store/authStore";

export default function Login() {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    if (!email || !password) {
      setError("Please enter both email and password");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await api.post('/auth/login', { email, password });
      login(res.data.user, res.data.token);
      navigate('/dashboard');
    } catch (error) {
      const message = error?.response?.data?.message || 'Invalid credentials';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-cyan-50 font-['Inter',system-ui,sans-serif] p-4">
      {/* Responsive card: full width on mobile, capped width on larger screens */}
      <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl w-full max-w-md sm:max-w-lg border border-gray-100 transition-all duration-300 p-6 sm:p-8">
        
        {/* Logo Section - fully responsive */}
        <div className="flex flex-col items-center mb-6 sm:mb-8">
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-tr from-indigo-600 to-cyan-600 rounded-2xl flex items-center justify-center shadow-lg mb-3">
            <img 
              src="/Sieger_logo.jpg" 
              alt="Sieger Logo" 
              className="w-11 h-11 sm:w-14 sm:h-14 object-contain brightness-0 invert" 
            />
          </div>
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-r from-indigo-700 to-cyan-700 bg-clip-text text-transparent">
              Sieger
            </h1>
            <p className="text-[10px] sm:text-xs text-gray-500 tracking-wider uppercase font-semibold">
              partnering progress
            </p>
          </div>
          <p className="text-gray-500 text-xs sm:text-sm mt-2 sm:mt-3">Ticketing System</p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-4 sm:mb-5 p-2 sm:p-3 rounded-xl bg-red-50 border-l-4 border-red-500 text-red-700 text-xs sm:text-sm">
            {error}
          </div>
        )}

        {/* Form Fields */}
        <div className="space-y-4 sm:space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Email address</label>
            <input
              type="email"
              placeholder="you@sieger.com"
              className="w-full border border-gray-200 p-2.5 sm:p-3 rounded-xl focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all outline-none bg-gray-50 text-sm sm:text-base"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Password</label>
            <input
              type="password"
              placeholder="••••••••"
              className="w-full border border-gray-200 p-2.5 sm:p-3 rounded-xl focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all outline-none bg-gray-50 text-sm sm:text-base"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
          </div>
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-700 hover:to-cyan-700 text-white font-semibold py-2.5 sm:py-3 rounded-xl transition-all duration-200 shadow-md disabled:opacity-70 disabled:cursor-not-allowed text-sm sm:text-base"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4 sm:h-5 sm:w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Signing in...
              </span>
            ) : (
              "Login →"
            )}
          </button>
        </div>

        {/* Footer */}
        <p className="text-center text-[10px] sm:text-xs text-gray-400 mt-6 sm:mt-8">
          Secure access for Sieger team members only
        </p>
      </div>
    </div>
  );
}