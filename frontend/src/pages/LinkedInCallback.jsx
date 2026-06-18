import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../services/api";

export default function LinkedInCallback() {
  const [searchParams] = useSearchParams();
  const navigate       = useNavigate();
  const [status, setStatus] = useState("Exchanging token with LinkedIn…");
  const [error, setError]   = useState(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const code  = searchParams.get("code");
    const err   = searchParams.get("error");
    const errDesc = searchParams.get("error_description");

    if (err) {
      setError(errDesc || err);
      return;
    }
    if (!code) {
      setError("No authorization code received from LinkedIn.");
      return;
    }

    (async () => {
      try {
        setStatus("Exchanging code for access token…");
        const res = await api.post("/linkedin/exchange-token", { code });
        const { orgName } = res.data;
        setStatus(`Connected to ${orgName || "your LinkedIn page"}. Redirecting…`);
        setTimeout(() => navigate("/linkedin"), 1500);
      } catch (e) {
        setError(e?.response?.data?.message || e.message || "Token exchange failed");
      }
    })();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-3xl shadow-lg p-10 max-w-md w-full text-center">
        {/* LinkedIn logo mark */}
        <div className="w-14 h-14 rounded-2xl mx-auto mb-6 flex items-center justify-center" style={{ background: "#0077B5" }}>
          <svg viewBox="0 0 24 24" className="w-8 h-8 fill-white">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
          </svg>
        </div>

        {error ? (
          <>
            <h2 className="text-xl font-bold text-red-600 mb-3">Connection failed</h2>
            <p className="text-gray-500 text-sm mb-6">{error}</p>
            <button
              onClick={() => navigate("/linkedin")}
              className="bg-black text-white px-6 py-2.5 rounded-xl text-sm font-semibold"
            >
              Back to Dashboard
            </button>
          </>
        ) : (
          <>
            <div className="flex justify-center mb-5">
              <svg className="animate-spin w-8 h-8" style={{ color: "#0077B5" }} fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
            <p className="text-gray-600 font-medium">{status}</p>
          </>
        )}
      </div>
    </div>
  );
}
