import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { BadgeCheck, ShieldAlert, Loader2 } from "lucide-react";

// Deliberately not the shared api client: that one attaches the stored JWT and,
// on a 401, wipes the session and redirects to the login page. This URL is
// reached from a printed claim by auditors, banks and vendors who have no
// account here, so it talks to the API directly.
const API_BASE =
  import.meta.env.VITE_API_URL || "https://ticketing-backend-6azk.onrender.com/api";

const CURRENCY_SYMBOL = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };

// Amounts arrive as numerics (often strings over REST). toLocaleString with fixed
// fraction digits keeps the two decimals a raw float would drop — 1250.5 has to
// read as ₹1,250.50.
const formatMoney = (value, currency = "INR") => {
  const amount = Number(value) || 0;
  const formatted = amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const symbol = CURRENCY_SYMBOL[currency];
  return symbol ? `${symbol}${formatted}` : `${currency} ${formatted}`;
};

// Timestamps are stored as UTC ISO strings and this document is read in India,
// so the zone is pinned rather than left to the reader's clock.
const fmtDateTime = (value) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

function Row({ label, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 py-3 border-b last:border-0 border-gray-100">
      <span className="text-[11px] uppercase tracking-wide text-gray-400 sm:w-40 sm:flex-shrink-0">
        {label}
      </span>
      <span className="text-sm text-gray-800 break-words">{children}</span>
    </div>
  );
}

export default function Verify() {
  const { code } = useParams();
  const [status, setStatus] = useState("loading"); // loading | valid | invalid | error
  const [claim, setClaim] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setClaim(null);
    setMessage("");

    axios
      .get(`${API_BASE}/verify/${encodeURIComponent(code || "")}`)
      .then((res) => {
        if (cancelled) return;
        setClaim(res.data);
        setStatus("valid");
      })
      .catch((err) => {
        if (cancelled) return;
        // 404 is the endpoint's answer for both an unknown code and a claim that
        // is not approved — it is a verdict, not a failure.
        if (err.response?.status === 404) {
          setStatus("invalid");
          return;
        }
        setMessage(
          err.response?.data?.message ||
            "The verification service could not be reached. Please try again in a moment."
        );
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-start sm:items-center justify-center px-4 py-10 sm:py-16">
      <div className="w-full max-w-xl">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
          {status === "loading" && (
            <div className="flex items-center justify-center gap-2 text-gray-400 py-10">
              <Loader2 size={18} className="animate-spin" /> Checking this claim…
            </div>
          )}

          {status === "valid" && claim && (
            <>
              <div className="flex items-start gap-3">
                <BadgeCheck size={26} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h1 className="text-xl font-bold text-gray-900">Verified</h1>
                  <p className="text-sm text-gray-500 mt-1">
                    This expense claim was approved in the Sieger ticketing system and has not
                    been altered since.
                  </p>
                </div>
              </div>

              <div className="mt-6">
                <Row label="Claim number">
                  <span className="font-semibold">{claim.claim_number || "—"}</span>
                </Row>
                <Row label="Claimant">{claim.claimant_name || "—"}</Row>
                <Row label="Team">{claim.team || "—"}</Row>
                <Row label="Amount">
                  <span className="font-semibold">
                    {formatMoney(claim.total_amount, claim.currency)}
                  </span>
                </Row>
                <Row label="Approved by">
                  {claim.approved_by_name || "—"}
                  {claim.approved_by_role ? (
                    <span className="text-gray-500"> · {claim.approved_by_role}</span>
                  ) : null}
                </Row>
                <Row label="Approved on">{fmtDateTime(claim.approved_at)}</Row>
                <Row label="Verification code">
                  <span className="font-mono text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1">
                    {code}
                  </span>
                </Row>
              </div>
            </>
          )}

          {status === "invalid" && (
            <div className="flex items-start gap-3">
              <ShieldAlert size={26} className="text-[#9b2423] flex-shrink-0 mt-0.5" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">Not verified</h1>
                <p className="text-sm text-gray-500 mt-1">
                  No approved expense claim matches this verification code. The code may have been
                  mistyped, or the claim may have been changed and re-approved under a new code.
                </p>
                <p className="text-xs text-gray-400 mt-4">
                  Code checked:{" "}
                  <span className="font-mono bg-gray-50 border border-gray-200 rounded px-2 py-0.5">
                    {code}
                  </span>
                </p>
              </div>
            </div>
          )}

          {status === "error" && (
            <div className="flex items-start gap-3">
              <ShieldAlert size={26} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">Could not check this code</h1>
                <p className="text-sm text-gray-500 mt-1">{message}</p>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-[11px] text-gray-400 mt-5">
          Sieger · expense claim verification
        </p>
      </div>
    </div>
  );
}
