import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import useAuthStore from "../store/authStore";
import logo from "../assets/Sieger_logo.png";

export default function Login() {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Password reset flow: "login" -> "forgot" (enter email) -> "reset" (code + new password)
  const [mode, setMode] = useState("login");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [info, setInfo] = useState("");

  const handleLogin = async () => {
    if (!email || !password) {
      setError("Please enter both email and password");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await api.post("/auth/login", {
        email,
        password,
      });

      login(res.data.user, res.data.token);
      navigate("/dashboard");
    } catch (err) {
      setError(err?.response?.data?.message || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  const requestOtp = async () => {
    if (!email) {
      setError("Please enter your email");
      return;
    }
    setLoading(true);
    setError("");
    setInfo("");
    try {
      const res = await api.post("/auth/forgot-password", { email });
      setInfo(res.data?.message || "If an account exists, a reset code has been sent.");
      setMode("reset");
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to send reset code");
    } finally {
      setLoading(false);
    }
  };

  const submitReset = async () => {
    if (!otp || !newPassword) {
      setError("Enter the code and a new password");
      return;
    }
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    setError("");
    setInfo("");
    try {
      await api.post("/auth/reset-password", { email, otp, newPassword });
      setInfo("Password reset successful. Please sign in with your new password.");
      setMode("login");
      setPassword("");
      setOtp("");
      setNewPassword("");
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  const backToLogin = () => {
    setMode("login");
    setError("");
    setInfo("");
    setOtp("");
    setNewPassword("");
  };

  const linkStyle = {
    background: "none",
    border: "none",
    color: "#c8102e",
    fontWeight: 600,
    fontSize: "0.85rem",
    cursor: "pointer",
    marginTop: 16,
    padding: 0,
    fontFamily: "inherit",
  };

  return (
    <>
      <style>{`
       @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&family=Poppins:wght@500;600;700&display=swap');

        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          overflow: hidden;
          background: #0b0d10;
        }

        .sg-root {
          min-height: 100vh;
          display: flex;
          font-family: 'Poppins', sans-serif;
          background: #ffffff;
        }

        /* LEFT SIDE */

        .sg-brand {
          width: 48%;
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 60px;
          background:
            radial-gradient(circle at top left, rgba(200,16,46,0.18), transparent 30%),
            linear-gradient(135deg, #0a0c0f 0%, #12161c 100%);
        }

        .sg-brand::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px);
          background-size: 48px 48px;
        }

        .sg-glow {
          position: absolute;
          width: 500px;
          height: 500px;
          background: rgba(200,16,46,0.12);
          filter: blur(100px);
          border-radius: 50%;
          top: -120px;
          right: -120px;
        }

        .sg-triangle {
          position: absolute;
          bottom: -120px;
          right: -120px;
          width: 420px;
          height: 420px;
          background: linear-gradient(
            135deg,
            rgba(200,16,46,0.25),
            rgba(200,16,46,0.03)
          );
          clip-path: polygon(100% 0, 100% 100%, 0 100%);
        }

        .sg-brand-top,
        .sg-brand-middle,
        .sg-brand-footer {
          position: relative;
          z-index: 2;
        }

        .sg-logo {
          width: 220px;
          object-fit: contain;
          filter: brightness(0) invert(1);
        }

        .sg-line {
          width: 48px;
          height: 4px;
          background: #c8102e;
          margin-bottom: 30px;
          border-radius: 10px;
        }

        .sg-heading {
          font-family: 'Poppins', sans-serif;
          font-size: 4.2rem;
          line-height: 0.95;
          font-weight: 700;
          text-transform: uppercase;
          color: white;
          letter-spacing: 0.02em;
        }

        .sg-heading span {
          color: #c8102e;
        }

        .sg-subtext {
          margin-top: 28px;
          max-width: 500px;
          color: rgba(255,255,255,0.68);
          line-height: 1.9;
          font-size: 0.95rem;
        }

        .sg-stats {
          margin-top: 50px;
          display: flex;
          gap: 50px;
        }

        .sg-stat-number {
          font-family: 'Poppins', sans-serif;
          font-size: 2.5rem;
          color: white;
          font-weight: 700;
        }

        .sg-stat-label {
          margin-top: 4px;
          font-size: 0.72rem;
          letter-spacing: 0.18em;
          color: rgba(255,255,255,0.45);
          text-transform: uppercase;
        }

        .sg-brand-footer {
          color: rgba(255,255,255,0.25);
          font-size: 0.75rem;
        }

        /* RIGHT */

        .sg-form-panel {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          background:
            radial-gradient(circle at bottom right, rgba(200,16,46,0.05), transparent 25%),
            #f7f8fa;
          padding: 40px;
        }

        .sg-form-card {
          width: 100%;
          max-width: 430px;
          background: rgba(255,255,255,0.75);
          backdrop-filter: blur(18px);
          border: 1px solid rgba(255,255,255,0.6);
          border-radius: 24px;
          padding: 50px;
          box-shadow:
            0 10px 30px rgba(0,0,0,0.06),
            0 2px 10px rgba(0,0,0,0.04);
        }

        .sg-mini {
          font-size: 0.72rem;
          letter-spacing: 0.25em;
          text-transform: uppercase;
          color: #c8102e;
          font-weight: 700;
          margin-bottom: 14px;
        }

        .sg-title {
          font-family: 'Poppins', sans-serif;
          font-size: 3rem;
          line-height: 1;
          font-weight: 700;
          color: #111;
          text-transform: uppercase;
        }

        .sg-desc {
          margin-top: 12px;
          color: #777;
          font-size: 0.95rem;
          margin-bottom: 38px;
        }

        .sg-field {
          margin-bottom: 20px;
        }

        .sg-label {
          display: block;
          margin-bottom: 8px;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #555;
        }

        .sg-input {
          width: 100%;
          height: 56px;
          border-radius: 14px;
          border: 1px solid #d9dde3;
          background: rgba(255,255,255,0.9);
          padding: 0 18px;
          font-size: 0.95rem;
          transition: 0.2s ease;
          outline: none;
        }

        .sg-input:focus {
          border-color: #c8102e;
          box-shadow: 0 0 0 4px rgba(200,16,46,0.08);
          background: white;
        }

        .sg-btn {
          margin-top: 10px;
          width: 100%;
          height: 58px;
          border: none;
          border-radius: 14px;
          background: linear-gradient(
            135deg,
            #c8102e,
            #9f1027
          );
          color: white;
          font-family: 'Poppins', sans-serif;
          font-size: 1.15rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          cursor: popoppins;
          transition: 0.2s ease;
        }

        .sg-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 20px rgba(200,16,46,0.25);
        }

        .sg-error {
          margin-bottom: 18px;
          padding: 14px;
          border-radius: 12px;
          background: rgba(200,16,46,0.08);
          color: #c8102e;
          font-size: 0.9rem;
          border: 1px solid rgba(200,16,46,0.15);
        }

        .sg-footer {
          margin-top: 28px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
          font-size: 0.75rem;
          color: #999;
        }

        @media(max-width: 900px) {

          .sg-brand {
            display: none;
          }

          .sg-form-panel {
            padding: 20px;
          }

          .sg-form-card {
            padding: 35px 28px;
          }

          .sg-title {
            font-size: 2.4rem;
          }
        }
      `}</style>

      <div className="sg-root">

        <div className="sg-brand">

          <div className="sg-glow"></div>
          <div className="sg-triangle"></div>

          <div className="sg-brand-top">
            <img src={logo} alt="Sieger Logo" className="sg-logo" />
          </div>

          <div className="sg-brand-middle">

            <div className="sg-line"></div>

            <h1 className="sg-heading">
              Partnering <br />
              <span>Progress.</span>
            </h1>

            <p className="sg-subtext">
              Enterprise workflow platform for Sieger teams —
              engineered for precision operations, streamlined approvals,
              project execution, and intelligent collaboration.
            </p>

            <div className="sg-stats">

              <div>
                <div className="sg-stat-number">30+</div>
                <div className="sg-stat-label">Years Legacy</div>
              </div>

              <div>
                <div className="sg-stat-number">500+</div>
                <div className="sg-stat-label">Global Clients</div>
              </div>

              <div>
                <div className="sg-stat-number">3</div>
                <div className="sg-stat-label">Automation Divisions</div>
              </div>

            </div>

          </div>

          <div className="sg-brand-footer">
            © {new Date().getFullYear()} Sieger Spintech Equipments Pvt. Ltd.
          </div>

        </div>

        <div className="sg-form-panel">

          <div className="sg-form-card">

            <div className="sg-mini">
               Sieger Ticketing System
            </div>

            <div className="sg-title">
              {mode === "login" ? "Sign In" : mode === "forgot" ? "Reset Password" : "Enter Code"}
            </div>

            <div className="sg-desc">
              {mode === "login"
                ? "Secure access for Sieger team"
                : mode === "forgot"
                ? "Enter your email to receive a reset code"
                : `We sent a 6-digit code to ${email}`}
            </div>

            {error && <div className="sg-error">{error}</div>}
            {info && (
              <div
                className="sg-error"
                style={{
                  background: "rgba(21,128,61,0.08)",
                  color: "#15803d",
                  borderColor: "rgba(21,128,61,0.25)",
                }}
              >
                {info}
              </div>
            )}

            {mode === "login" && (
              <>
                <div className="sg-field">
                  <label className="sg-label">Email Address</label>
                  <input
                    type="email"
                    className="sg-input"
                    placeholder="you@siegerglobal.net"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div className="sg-field">
                  <label className="sg-label">Password</label>
                  <input
                    type="password"
                    className="sg-input"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  />
                </div>

                <button className="sg-btn" onClick={handleLogin} disabled={loading}>
                  {loading ? "VERIFYING..." : "SIGN IN"}
                </button>

                <div>
                  <button
                    type="button"
                    style={linkStyle}
                    onClick={() => {
                      setMode("forgot");
                      setError("");
                      setInfo("");
                    }}
                  >
                    Forgot password?
                  </button>
                </div>
              </>
            )}

            {mode === "forgot" && (
              <>
                <div className="sg-field">
                  <label className="sg-label">Email Address</label>
                  <input
                    type="email"
                    className="sg-input"
                    placeholder="you@siegerglobal.net"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && requestOtp()}
                  />
                </div>

                <button className="sg-btn" onClick={requestOtp} disabled={loading}>
                  {loading ? "SENDING..." : "SEND RESET CODE"}
                </button>

                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <button
                    type="button"
                    style={linkStyle}
                    onClick={() => {
                      if (!email) {
                        setError("Enter your email first");
                        return;
                      }
                      setError("");
                      setInfo("");
                      setMode("reset");
                    }}
                  >
                    Already have a code?
                  </button>
                  <button type="button" style={linkStyle} onClick={backToLogin}>
                    Back to sign in
                  </button>
                </div>
              </>
            )}

            {mode === "reset" && (
              <>
                <div className="sg-field">
                  <label className="sg-label">Reset Code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    className="sg-input"
                    placeholder="6-digit code"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  />
                </div>

                <div className="sg-field">
                  <label className="sg-label">New Password</label>
                  <input
                    type="password"
                    className="sg-input"
                    placeholder="At least 6 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitReset()}
                  />
                </div>

                <button className="sg-btn" onClick={submitReset} disabled={loading}>
                  {loading ? "RESETTING..." : "RESET PASSWORD"}
                </button>

                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <button type="button" style={linkStyle} onClick={requestOtp} disabled={loading}>
                    Resend code
                  </button>
                  <button type="button" style={linkStyle} onClick={backToLogin}>
                    Back to sign in
                  </button>
                </div>
              </>
            )}

            <div className="sg-footer">
              Protected • Sieger Professional Access
            </div>

          </div>

        </div>

      </div>
    </>
  );
}