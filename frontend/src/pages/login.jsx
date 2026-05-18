import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import useAuthStore from "../store/authStore";
import logo from "./Sieger_logo.jpg";

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
      const res = await api.post("/auth/login", { email, password });
      login(res.data.user, res.data.token);
      navigate("/dashboard");
    } catch (err) {
      setError(err?.response?.data?.message || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow:wght@300;400;500;600;700&family=Barlow+Condensed:wght@600;700;800&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        .sieger-root {
          min-height: 100vh;
          display: flex;
          font-family: 'Barlow', sans-serif;
          background-color: #0b1220;
          overflow: hidden;
          position: relative;
        }

        /* ── Left panel (brand) ── */
        .sieger-brand {
          display: none;
          flex-direction: column;
          justify-content: space-between;
          padding: 3rem;
          background: linear-gradient(160deg, #0f1e38 0%, #0b1220 60%, #071629 100%);
          position: relative;
          overflow: hidden;
        }

        @media (min-width: 960px) {
          .sieger-brand { display: flex; width: 46%; flex-shrink: 0; }
        }

        /* Grid lines decoration */
        .sieger-brand::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
          background-size: 48px 48px;
          pointer-events: none;
        }

        /* Accent glow orb */
        .sieger-brand::after {
          content: '';
          position: absolute;
          bottom: -80px;
          left: -80px;
          width: 400px;
          height: 400px;
          background: radial-gradient(circle, rgba(0,112,243,0.18) 0%, transparent 70%);
          pointer-events: none;
        }

        .brand-top { position: relative; z-index: 1; }

        .brand-wordmark {
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 800;
          font-size: 2.4rem;
          letter-spacing: 0.08em;
          color: #ffffff;
          text-transform: uppercase;
        }

        .brand-wordmark span {
          color: #0070f3;
        }

        .brand-tagline {
          margin-top: 0.4rem;
          font-size: 0.7rem;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.35);
          font-weight: 500;
        }

        .brand-divider {
          margin-top: 2.5rem;
          width: 40px;
          height: 3px;
          background: #0070f3;
          border-radius: 2px;
        }

        .brand-headline {
          margin-top: 2rem;
          font-size: 2rem;
          font-weight: 700;
          color: #ffffff;
          line-height: 1.25;
          max-width: 280px;
        }

        .brand-headline em {
          font-style: normal;
          color: #0070f3;
        }

        .brand-body {
          margin-top: 1rem;
          font-size: 0.875rem;
          color: rgba(255,255,255,0.45);
          line-height: 1.7;
          max-width: 300px;
        }

        .brand-stats {
          display: flex;
          gap: 2rem;
          margin-top: 2.5rem;
          position: relative;
          z-index: 1;
        }

        .stat-item {
          display: flex;
          flex-direction: column;
        }

        .stat-num {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 1.75rem;
          font-weight: 800;
          color: #ffffff;
          line-height: 1;
        }

        .stat-label {
          font-size: 0.65rem;
          text-transform: uppercase;
          letter-spacing: 0.15em;
          color: rgba(255,255,255,0.3);
          margin-top: 0.25rem;
        }

        .brand-footer {
          font-size: 0.7rem;
          color: rgba(255,255,255,0.2);
          letter-spacing: 0.05em;
          position: relative;
          z-index: 1;
        }

        /* ── Right panel (form) ── */
        .sieger-form-panel {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem 1.5rem;
          background: #f5f6f8;
          position: relative;
        }

        /* Top bar accent on mobile */
        .sieger-form-panel::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 4px;
          background: linear-gradient(90deg, #0070f3, #00aaff);
        }

        @media (min-width: 960px) {
          .sieger-form-panel::before { display: none; }
        }

        .form-card {
          width: 100%;
          max-width: 420px;
        }

        /* Mobile logo (hidden on desktop) */
        .mobile-logo {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 2.5rem;
        }

        @media (min-width: 960px) {
          .mobile-logo { display: none; }
        }

        .mobile-logo img {
          width: 48px;
          height: 48px;
          object-fit: contain;
        }

        .mobile-brand-name {
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 800;
          font-size: 1.6rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #0b1220;
        }

        .mobile-brand-name span { color: #0070f3; }

        .form-label-heading {
          font-size: 0.65rem;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: #0070f3;
          font-weight: 600;
          margin-bottom: 0.5rem;
        }

        .form-heading {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 2rem;
          font-weight: 800;
          color: #0b1220;
          line-height: 1.1;
          margin-bottom: 0.5rem;
        }

        .form-subheading {
          font-size: 0.85rem;
          color: #8892a4;
          margin-bottom: 2.25rem;
        }

        /* Error */
        .error-box {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          background: #fff1f0;
          border-left: 3px solid #e53e3e;
          border-radius: 6px;
          padding: 0.75rem 1rem;
          margin-bottom: 1.5rem;
          font-size: 0.83rem;
          color: #c53030;
        }

        .error-icon {
          width: 16px;
          height: 16px;
          flex-shrink: 0;
          margin-top: 1px;
        }

        /* Fields */
        .field-group { margin-bottom: 1.25rem; }

        .field-label {
          display: block;
          font-size: 0.75rem;
          font-weight: 600;
          letter-spacing: 0.05em;
          color: #3d4a60;
          margin-bottom: 0.5rem;
          text-transform: uppercase;
        }

        .field-input {
          width: 100%;
          background: #ffffff;
          border: 1.5px solid #dde2ec;
          border-radius: 8px;
          padding: 0.85rem 1rem;
          font-size: 0.925rem;
          font-family: 'Barlow', sans-serif;
          color: #0b1220;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }

        .field-input::placeholder { color: #b0bac8; }

        .field-input:focus {
          border-color: #0070f3;
          box-shadow: 0 0 0 3px rgba(0,112,243,0.12);
        }

        .field-input:disabled {
          background: #f0f2f5;
          color: #8892a4;
          cursor: not-allowed;
        }

        /* Submit button */
        .submit-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          width: 100%;
          padding: 0.9rem 1.5rem;
          background: #0b1220;
          color: #ffffff;
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 1.05rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          margin-top: 0.5rem;
          position: relative;
          overflow: hidden;
          transition: background 0.2s, transform 0.1s;
        }

        .submit-btn::after {
          content: '';
          position: absolute;
          bottom: 0; left: 0; right: 0;
          height: 3px;
          background: linear-gradient(90deg, #0070f3, #00aaff);
          transition: height 0.2s;
        }

        .submit-btn:hover:not(:disabled) {
          background: #16213e;
        }

        .submit-btn:hover:not(:disabled)::after {
          height: 4px;
        }

        .submit-btn:active:not(:disabled) { transform: scale(0.99); }

        .submit-btn:disabled {
          background: #8892a4;
          cursor: not-allowed;
        }

        .submit-btn:disabled::after { display: none; }

        /* Spinner */
        .spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          flex-shrink: 0;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        /* Arrow icon */
        .arrow-icon {
          width: 16px;
          height: 16px;
          flex-shrink: 0;
          transition: transform 0.2s;
        }

        .submit-btn:hover .arrow-icon { transform: translateX(3px); }

        /* Footer note */
        .form-footer {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-top: 2rem;
          padding-top: 1.5rem;
          border-top: 1px solid #e2e6ef;
        }

        .lock-icon {
          width: 14px;
          height: 14px;
          color: #8892a4;
          flex-shrink: 0;
        }

        .form-footer-text {
          font-size: 0.72rem;
          color: #8892a4;
          letter-spacing: 0.03em;
        }
      `}</style>

      <div className="sieger-root">

        {/* ── Brand Panel (desktop only) ── */}
        <div className="sieger-brand">
          <div className="brand-top">
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <img src={logo} alt="Sieger" style={{ width: 44, height: 44, objectFit: "contain", borderRadius: 6 }} />
              <div>
                <div className="brand-wordmark">Siege<span>R</span></div>
                <div className="brand-tagline">Partnering Progress</div>
              </div>
            </div>

            <div className="brand-divider" />

            <h2 className="brand-headline">
              Engineering <em>progress,</em> one solution at a time.
            </h2>

            <p className="brand-body">
              Sieger Spintech's internal portal — streamlining operations across Textile Automation, Parking Systems, and Storage Solutions.
            </p>

            <div className="brand-stats">
              <div className="stat-item">
                <div className="stat-num">30+</div>
                <div className="stat-label">Years</div>
              </div>
              <div className="stat-item">
                <div className="stat-num">500+</div>
                <div className="stat-label">Clients</div>
              </div>
              <div className="stat-item">
                <div className="stat-num">3</div>
                <div className="stat-label">Divisions</div>
              </div>
            </div>
          </div>

          <div className="brand-footer">
            © {new Date().getFullYear()} Sieger Spintech Equipments Pvt. Ltd. · Coimbatore, India
          </div>
        </div>

        {/* ── Form Panel ── */}
        <div className="sieger-form-panel">
          <div className="form-card">

            {/* Mobile logo */}
            <div className="mobile-logo">
              <img src={logo} alt="Sieger" />
              <div className="mobile-brand-name">Siege<span>R</span></div>
            </div>

            <p className="form-label-heading">Internal Access</p>
            <h1 className="form-heading">Team Login</h1>
            <p className="form-subheading">Sign in to the Sieger Ticketing System</p>

            {/* Error */}
            {error && (
              <div className="error-box">
                <svg className="error-icon" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}

            {/* Email */}
            <div className="field-group">
              <label className="field-label" htmlFor="email">Email Address</label>
              <input
                id="email"
                type="email"
                className="field-input"
                placeholder="you@siegerglobal.net"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                autoComplete="email"
              />
            </div>

            {/* Password */}
            <div className="field-group">
              <label className="field-label" htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                className="field-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                autoComplete="current-password"
              />
            </div>

            {/* Submit */}
            <button className="submit-btn" onClick={handleLogin} disabled={loading}>
              {loading ? (
                <>
                  <div className="spinner" />
                  Verifying...
                </>
              ) : (
                <>
                  Sign In
                  <svg className="arrow-icon" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </>
              )}
            </button>

            {/* Footer */}
            <div className="form-footer">
              <svg className="lock-icon" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
              <span className="form-footer-text">Secure access for Sieger team members only</span>
            </div>

          </div>
        </div>

      </div>
    </>
  );
}