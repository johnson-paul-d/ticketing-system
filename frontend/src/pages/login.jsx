import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import useAuthStore from "../store/authStore";
import logo from "./Sieger_logo.jpg";

export default function Login() {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);

  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  const handleLogin = async () => {
    if (!email || !password) { setError("Please enter both email and password"); return; }
    setLoading(true); setError("");
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
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        /* ─── Root ─── */
        .sg-root {
          min-height: 100vh;
          display: flex;
          font-family: 'DM Sans', sans-serif;
          background: #ffffff;
        }

        /* ─── Left: brand panel ─── */
        .sg-brand {
          display: none;
          position: relative;
          flex-direction: column;
          justify-content: space-between;
          padding: 3.5rem 3rem;
          background: #111111;
          overflow: hidden;
          width: 48%;
          flex-shrink: 0;
        }

        @media (min-width: 900px) { .sg-brand { display: flex; } }

        /* Subtle grid texture */
        .sg-brand::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
          background-size: 52px 52px;
          pointer-events: none;
        }

        /* Large geometric triangle — echoing the arrow mark in the logo */
        .sg-geo-main {
          position: absolute;
          bottom: -80px;
          right: -80px;
          width: 420px;
          height: 420px;
          background: #c8102e;
          clip-path: polygon(100% 0, 100% 100%, 0 100%);
          opacity: 0.09;
          pointer-events: none;
        }

        .sg-geo-small {
          position: absolute;
          top: 140px;
          left: -24px;
          width: 100px;
          height: 100px;
          background: #c8102e;
          clip-path: polygon(0 0, 100% 0, 100% 100%);
          opacity: 0.07;
          pointer-events: none;
        }

        .sg-brand-top { position: relative; z-index: 2; }

        /* Invert the black logo to white on dark background */
        .sg-logo-img {
          filter: brightness(0) invert(1);
          width: 190px;
          object-fit: contain;
        }

        .sg-brand-mid { position: relative; z-index: 2; }

        .sg-red-bar {
          width: 36px;
          height: 4px;
          background: #c8102e;
          margin-bottom: 1.75rem;
        }

        .sg-brand-headline {
          font-family: 'Rajdhani', sans-serif;
          font-size: 2.55rem;
          font-weight: 700;
          color: #ffffff;
          line-height: 1.15;
          letter-spacing: 0.02em;
          text-transform: uppercase;
        }

        .sg-brand-headline span { color: #c8102e; }

        .sg-brand-sub {
          margin-top: 1rem;
          font-size: 0.875rem;
          color: rgba(255,255,255,0.4);
          line-height: 1.75;
          max-width: 300px;
        }

        .sg-stats {
          display: flex;
          gap: 2.25rem;
          margin-top: 2.5rem;
        }

        .sg-stat-num {
          font-family: 'Rajdhani', sans-serif;
          font-size: 2rem;
          font-weight: 700;
          color: #ffffff;
          line-height: 1;
        }

        .sg-stat-label {
          font-size: 0.63rem;
          text-transform: uppercase;
          letter-spacing: 0.18em;
          color: rgba(255,255,255,0.26);
          margin-top: 0.2rem;
        }

        .sg-brand-foot {
          position: relative;
          z-index: 2;
          font-size: 0.68rem;
          color: rgba(255,255,255,0.16);
          letter-spacing: 0.04em;
        }

        /* ─── Right: form panel ─── */
        .sg-form-panel {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem 1.5rem;
          background: #ffffff;
          position: relative;
        }

        /* Red top stripe — mobile only */
        .sg-form-panel::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 4px;
          background: #c8102e;
        }

        @media (min-width: 900px) { .sg-form-panel::before { display: none; } }

        .sg-form-card {
          width: 100%;
          max-width: 400px;
        }

        /* Mobile logo */
        .sg-mobile-logo {
          display: flex;
          align-items: center;
          margin-bottom: 2.75rem;
        }

        @media (min-width: 900px) { .sg-mobile-logo { display: none; } }

        .sg-mobile-logo img {
          width: 170px;
          object-fit: contain;
        }

        /* Form header */
        .sg-eyebrow {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          font-size: 0.63rem;
          text-transform: uppercase;
          letter-spacing: 0.22em;
          color: #c8102e;
          font-weight: 600;
          margin-bottom: 0.55rem;
        }

        .sg-eyebrow::before {
          content: '';
          display: block;
          width: 18px;
          height: 2px;
          background: #c8102e;
          flex-shrink: 0;
        }

        .sg-form-title {
          font-family: 'Rajdhani', sans-serif;
          font-size: 2.2rem;
          font-weight: 700;
          color: #111111;
          text-transform: uppercase;
          letter-spacing: 0.02em;
          line-height: 1.1;
          margin-bottom: 0.4rem;
        }

        .sg-form-desc {
          font-size: 0.85rem;
          color: #999;
          margin-bottom: 2.25rem;
        }

        /* Error */
        .sg-error {
          display: flex;
          align-items: flex-start;
          gap: 0.6rem;
          background: #fff5f5;
          border-left: 3px solid #c8102e;
          border-radius: 4px;
          padding: 0.7rem 0.9rem;
          margin-bottom: 1.5rem;
          font-size: 0.82rem;
          color: #c8102e;
          font-weight: 500;
        }

        .sg-error svg { flex-shrink: 0; margin-top: 1px; }

        /* Fields */
        .sg-field { margin-bottom: 1.2rem; }

        .sg-label {
          display: block;
          font-size: 0.68rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #555;
          margin-bottom: 0.45rem;
        }

        .sg-input {
          width: 100%;
          border: 1.5px solid #e2e2e2;
          border-radius: 6px;
          padding: 0.8rem 1rem;
          font-size: 0.92rem;
          font-family: 'DM Sans', sans-serif;
          color: #111;
          background: #fafafa;
          outline: none;
          transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
        }

        .sg-input::placeholder { color: #c0c0c0; }

        .sg-input:focus {
          border-color: #c8102e;
          background: #fff;
          box-shadow: 0 0 0 3px rgba(200,16,46,0.08);
        }

        .sg-input:disabled {
          background: #f2f2f2;
          color: #aaa;
          cursor: not-allowed;
        }

        /* Button */
        .sg-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.55rem;
          width: 100%;
          padding: 0.875rem 1.5rem;
          margin-top: 0.5rem;
          background: #c8102e;
          color: #fff;
          font-family: 'Rajdhani', sans-serif;
          font-size: 1.1rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          position: relative;
          overflow: hidden;
          transition: background 0.18s, transform 0.1s;
        }

        .sg-btn::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 55%);
          pointer-events: none;
        }

        .sg-btn:hover:not(:disabled) { background: #a80d26; }
        .sg-btn:active:not(:disabled) { transform: scale(0.99); }
        .sg-btn:disabled { background: #e08090; cursor: not-allowed; }

        .sg-spinner {
          width: 17px; height: 17px;
          border: 2px solid rgba(255,255,255,0.35);
          border-top-color: #fff;
          border-radius: 50%;
          animation: sg-spin 0.65s linear infinite;
          flex-shrink: 0;
        }
        @keyframes sg-spin { to { transform: rotate(360deg); } }

        .sg-arrow {
          width: 15px; height: 15px;
          flex-shrink: 0;
          transition: transform 0.18s;
        }
        .sg-btn:hover .sg-arrow { transform: translateX(3px); }

        /* Footer */
        .sg-footer {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          margin-top: 2rem;
          padding-top: 1.5rem;
          border-top: 1px solid #ebebeb;
        }

        .sg-footer-text {
          font-size: 0.7rem;
          color: #c0c0c0;
          letter-spacing: 0.03em;
        }

        .sg-footer svg { color: #ccc; flex-shrink: 0; }
      `}</style>

      <div className="sg-root">

        {/* ── Brand Panel (desktop) ── */}
        <div className="sg-brand">
          <div className="sg-geo-main" />
          <div className="sg-geo-small" />

          <div className="sg-brand-top">
            <img src={logo} alt="Sieger" className="sg-logo-img" />
          </div>

          <div className="sg-brand-mid">
            <div className="sg-red-bar" />
            <h2 className="sg-brand-headline">
              Engineering<br /><span>Progress.</span><br />Delivering Value.
            </h2>
            <p className="sg-brand-sub">
              Sieger Spintech's Marketing portal — streamlining operations across Marketing, Sales, and Support divisions with efficiency and precision.
            </p>
            <div className="sg-stats">
              <div>
                <div className="sg-stat-num">30+</div>
                <div className="sg-stat-label">Years</div>
              </div>
              <div>
                <div className="sg-stat-num">500+</div>
                <div className="sg-stat-label">Clients</div>
              </div>
              <div>
                <div className="sg-stat-num">3</div>
                <div className="sg-stat-label">Divisions</div>
              </div>
            </div>
          </div>

          <div className="sg-brand-foot">
            © {new Date().getFullYear()} Sieger Spintech Equipments Pvt. Ltd. · Coimbatore, India
          </div>
        </div>

        {/* ── Form Panel ── */}
        <div className="sg-form-panel">
          <div className="sg-form-card">

            {/* Mobile logo */}
            <div className="sg-mobile-logo">
              <img src={logo} alt="Sieger" />
            </div>

            <div className="sg-eyebrow">Ticketing System</div>
            <h1 className="sg-form-title">Team Sign In</h1>
            <p className="sg-form-desc">Secure access for Sieger Marketing members</p>

            {error && (
              <div className="sg-error">
                <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}

            <div className="sg-field">
              <label className="sg-label" htmlFor="sg-email">Email Address</label>
              <input
                id="sg-email"
                type="email"
                className="sg-input"
                placeholder="you@siegerglobal.net"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                autoComplete="email"
              />
            </div>

            <div className="sg-field">
              <label className="sg-label" htmlFor="sg-pass">Password</label>
              <input
                id="sg-pass"
                type="password"
                className="sg-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                autoComplete="current-password"
              />
            </div>

            <button className="sg-btn" onClick={handleLogin} disabled={loading}>
              {loading ? (
                <><div className="sg-spinner" /> Verifying...</>
              ) : (
                <>
                  Sign In
                  <svg className="sg-arrow" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </>
              )}
            </button>

            <div className="sg-footer">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
              <span className="sg-footer-text">Protected · Sieger MKT use only</span>
            </div>

          </div>
        </div>

      </div>
    </>
  );
}