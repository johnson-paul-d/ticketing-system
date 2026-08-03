const nodemailer = require("nodemailer");

// =====================================================
// Shared mailer — SMTP (e.g. Gmail) preferred, Resend as fallback.
// For Gmail: enable 2-Step Verification and use a 16-char App Password as
// SMTP_PASS. Set SMTP_USER, SMTP_PASS (and optionally SMTP_FROM / SMTP_HOST /
// SMTP_PORT). Falls back to Resend (FROM_EMAIL) when SMTP isn't configured.
// =====================================================
const smtpTransport =
  process.env.SMTP_USER && process.env.SMTP_PASS
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: Number(process.env.SMTP_PORT) || 587,
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      })
    : null;

let resend = null;
if (process.env.RESEND_API_KEY) {
  const { Resend } = require("resend");
  resend = new Resend(process.env.RESEND_API_KEY);
}

if (!smtpTransport && !resend) {
  console.error("❌ No email sender configured — set SMTP_USER/SMTP_PASS or RESEND_API_KEY");
}

// Send an email. Returns { ok, error }. The Resend SDK reports API failures in
// the resolved `error` field (it does not throw), so that path is checked.
const sendMail = async ({ to, subject, html, text }) => {
  if (smtpTransport) {
    try {
      await smtpTransport.sendMail({
        from: process.env.SMTP_FROM || `Sieger Ticketing <${process.env.SMTP_USER}>`,
        to,
        subject,
        html,
        text,
      });
      return { ok: true };
    } catch (err) {
      console.error("Email error (SMTP):", err);
      return { ok: false, error: err.message || "SMTP send failed" };
    }
  }

  if (resend) {
    try {
      const { error } = await resend.emails.send({
        from: process.env.FROM_EMAIL || "onboarding@resend.dev",
        to,
        subject,
        html,
        text,
      });
      if (error) {
        console.error("Email error (Resend):", error);
        return { ok: false, error: error.message || "Email provider rejected the message" };
      }
      return { ok: true };
    } catch (err) {
      console.error("Email error (Resend):", err);
      return { ok: false, error: err.message || "Email send failed" };
    }
  }

  return { ok: false, error: "Email not configured — set SMTP_USER/SMTP_PASS (or RESEND_API_KEY)" };
};

module.exports = { sendMail };
