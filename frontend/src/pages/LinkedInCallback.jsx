import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../services/api";

const LI_BLUE = "#0077B5";

function LILogo() {
  return (
    <div className="w-14 h-14 rounded-2xl mx-auto mb-6 flex items-center justify-center flex-shrink-0" style={{ background: LI_BLUE }}>
      <svg viewBox="0 0 24 24" className="w-8 h-8 fill-white">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    </div>
  );
}

export default function LinkedInCallback() {
  const [searchParams] = useSearchParams();
  const navigate       = useNavigate();
  const [phase,  setPhase]  = useState("loading"); // loading | picker | done | error
  const [status, setStatus] = useState("Exchanging token with LinkedIn…");
  const [error,  setError]  = useState(null);
  const [orgs,   setOrgs]   = useState([]);
  const [saving, setSaving] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const code    = searchParams.get("code");
    const err     = searchParams.get("error");
    const errDesc = searchParams.get("error_description");

    if (err) { setError(errDesc || err); setPhase("error"); return; }
    if (!code) { setError("No authorization code received from LinkedIn."); setPhase("error"); return; }

    (async () => {
      try {
        setStatus("Exchanging code for access token…");
        const res = await api.post("/linkedin/exchange-token", { code });
        const { orgs: orgList, needsPicker } = res.data;

        if (needsPicker && orgList?.length > 1) {
          setOrgs(orgList);
          setPhase("picker");
        } else {
          setPhase("done");
          setStatus("Connected! Redirecting…");
          setTimeout(() => navigate("/linkedin"), 1200);
        }
      } catch (e) {
        const detail = e?.response?.data?.detail;
        const msg    = e?.response?.data?.message || e.message || "Token exchange failed";
        setError(detail ? `${msg} — ${detail}` : msg);
        setPhase("error");
      }
    })();
  }, []);

  const selectOrg = async (org) => {
    setSaving(true);
    try {
      await api.post("/linkedin/select-org", {
        orgId:   org.id,
        orgName: org.name,
        orgUrn:  org.urn,
      });
      setPhase("done");
      setStatus(`Connected to "${org.name}". Redirecting…`);
      setTimeout(() => navigate("/linkedin"), 1200);
    } catch (e) {
      setError(e?.response?.data?.message || e.message);
      setPhase("error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-3xl shadow-lg p-10 w-full max-w-md mx-4 text-center">
        <LILogo />

        {/* Loading */}
        {phase === "loading" && (
          <>
            <div className="flex justify-center mb-5">
              <svg className="animate-spin w-8 h-8" style={{ color: LI_BLUE }} fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
            <p className="text-gray-600 font-medium">{status}</p>
          </>
        )}

        {/* Org picker */}
        {phase === "picker" && (
          <>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Choose a LinkedIn Page</h2>
            <p className="text-gray-500 text-sm mb-6">
              Your account has {orgs.length} pages. Select which one to connect to the dashboard.
            </p>
            <div className="space-y-3 text-left">
              {orgs.map((org) => (
                <button
                  key={org.id}
                  onClick={() => selectOrg(org)}
                  disabled={saving}
                  className="w-full flex items-center gap-4 border-2 border-gray-100 hover:border-blue-400 rounded-2xl px-5 py-4 transition-all text-left disabled:opacity-50"
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-white text-sm font-bold"
                    style={{ background: LI_BLUE }}
                  >
                    {org.name?.[0]?.toUpperCase() || "L"}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{org.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">ID: {org.id}</p>
                  </div>
                  <svg className="w-4 h-4 text-gray-300 ml-auto flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Done */}
        {phase === "done" && (
          <>
            <div className="flex justify-center mb-5">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
            <p className="text-gray-700 font-medium">{status}</p>
          </>
        )}

        {/* Error */}
        {phase === "error" && (
          <>
            <h2 className="text-xl font-bold text-red-600 mb-3">Connection failed</h2>
            <p className="text-gray-500 text-sm mb-6 break-words">{error}</p>
            <button
              onClick={() => navigate("/linkedin")}
              className="bg-black text-white px-6 py-2.5 rounded-xl text-sm font-semibold"
            >
              Back to Dashboard
            </button>
          </>
        )}
      </div>
    </div>
  );
}
