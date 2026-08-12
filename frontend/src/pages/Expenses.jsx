import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Receipt, Plus, Loader2, Search, ChevronLeft, ChevronRight } from "lucide-react";
import MainLayout from "../layouts/MainLayout";
import api from "../services/api";

const PAGE_SIZE = 20;

const EXPENSE_STATUSES = ["Draft", "Submitted", "Approved", "Rejected", "Paid"];

const statusChip = {
  Draft: "bg-gray-100 text-gray-600 border-gray-200",
  Submitted: "bg-amber-50 text-amber-700 border-amber-200",
  Approved: "bg-blue-50 text-blue-700 border-blue-200",
  Rejected: "bg-red-50 text-red-700 border-red-200",
  Paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const CURRENCY_SYMBOL = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };

// Totals arrive as numerics (often strings over REST). toLocaleString with fixed
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

// Date-only columns come back as "YYYY-MM-DD"; new Date() would read them as UTC
// and show the previous day to an IST viewer, so format the stored parts as-is.
const fmtDate = (value) => {
  if (!value) return "—";
  const [y, m, d] = String(value).slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : String(value);
};

const fmtPeriod = (from, to) => {
  if (!from && !to) return "—";
  return `${fmtDate(from)} → ${fmtDate(to)}`;
};

// A claim is only numbered when it is approved, so most rows have none yet.
const claimRef = (claim) => claim.claim_number || "Not yet numbered";

// A rejection sends the claim back to Draft, so the status alone cannot tell a
// fresh draft from one that needs fixing — the reason field is the giveaway.
const wasSentBack = (claim) =>
  Boolean(claim.rejection_reason) && (claim.status === "Draft" || claim.status === "Rejected");

export default function Expenses() {
  const navigate = useNavigate();

  const [claims, setClaims] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status]);

  const fetchClaims = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/expenses", {
        params: {
          status: status || undefined,
          search: debouncedSearch || undefined,
          page,
          limit: PAGE_SIZE,
        },
      });
      setClaims(res.data?.claims || []);
      setTotal(res.data?.total ?? 0);
      setError("");
    } catch (err) {
      setClaims([]);
      setTotal(0);
      setError(err.response?.data?.message || "Failed to load expense claims");
    } finally {
      setLoading(false);
    }
  }, [status, debouncedSearch, page]);

  useEffect(() => {
    fetchClaims();
  }, [fetchClaims]);

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isFiltered = Boolean(debouncedSearch || status);

  return (
    <MainLayout>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-3">
            <Receipt className="text-[#9b2423]" size={28} /> Expenses
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {total} {total === 1 ? "claim" : "claims"} · reimbursement claims and their line items
          </p>
        </div>
        <button
          onClick={() => navigate("/expenses/new")}
          className="inline-flex items-center gap-2 bg-[#9b2423] hover:bg-[#7d1d1c] text-white font-semibold text-sm px-4 py-2.5 rounded-xl shadow-sm transition"
        >
          <Plus size={16} /> New Expense Claim
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl border border-red-200 mb-5">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-5">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search claims…"
            className="border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-[#9b2423]/30 w-56"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white outline-none"
        >
          <option value="">All statuses</option>
          {EXPENSE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-gray-400 gap-2">
          <Loader2 size={20} className="animate-spin" /> Loading expense claims…
        </div>
      ) : claims.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
          <Receipt size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">
            {isFiltered ? "No claims match the filters" : "No expense claims yet"}
          </p>
          {!isFiltered && (
            <p className="text-sm text-gray-400 mt-1">
              Create your first claim to start recording reimbursable expenses
            </p>
          )}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white rounded-2xl shadow-sm overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b">
                  <th className="px-5 py-3 font-medium">Claim</th>
                  <th className="px-3 py-3 font-medium">Period</th>
                  <th className="px-3 py-3 font-medium">Claimant</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Created</th>
                  <th className="px-5 py-3 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {claims.map((claim) => (
                  <tr
                    key={claim.id}
                    onClick={() => navigate(`/expenses/${claim.id}`)}
                    className="border-b last:border-0 hover:bg-gray-50 cursor-pointer transition"
                  >
                    <td className="px-5 py-3">
                      <div className="font-semibold text-gray-800">{claim.title}</div>
                      <div className="text-[11px] text-gray-400">{claimRef(claim)}</div>
                    </td>
                    <td className="px-3 py-3 text-gray-600 whitespace-nowrap">
                      {fmtPeriod(claim.period_from, claim.period_to)}
                    </td>
                    <td className="px-3 py-3 text-gray-600">{claim.claimant_name || "—"}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                            statusChip[claim.status] || statusChip.Draft
                          }`}
                        >
                          {claim.status}
                        </span>
                        {wasSentBack(claim) && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-red-50 text-red-700 border-red-200">
                            Sent back
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {fmtDate(claim.created_at)}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-gray-800 whitespace-nowrap">
                      {formatMoney(claim.total_amount, claim.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden grid grid-cols-1 gap-4">
            {claims.map((claim) => (
              <button
                key={claim.id}
                type="button"
                onClick={() => navigate(`/expenses/${claim.id}`)}
                className="bg-white rounded-2xl shadow-sm border border-transparent hover:border-[#9b2423]/20 transition p-5 text-left flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="font-bold text-base line-clamp-1">{claim.title}</h2>
                    <p className="text-[11px] text-gray-400 mt-0.5">{claimRef(claim)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                        statusChip[claim.status] || statusChip.Draft
                      }`}
                    >
                      {claim.status}
                    </span>
                    {wasSentBack(claim) && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-red-50 text-red-700 border-red-200">
                        Sent back
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-500">
                    {fmtPeriod(claim.period_from, claim.period_to)}
                  </span>
                  <span className="text-base font-bold text-gray-800">
                    {formatMoney(claim.total_amount, claim.currency)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 text-[11px] text-gray-400 border-t pt-2">
                  <span>{claim.claimant_name || "—"}</span>
                  <span>{fmtDate(claim.created_at)}</span>
                </div>
              </button>
            ))}
          </div>

          {lastPage > 1 && (
            <div className="flex items-center justify-between gap-3 mt-5">
              <p className="text-xs text-gray-400">
                Page {page} of {lastPage}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="inline-flex items-center gap-1 px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={14} /> Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                  disabled={page >= lastPage}
                  className="inline-flex items-center gap-1 px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </MainLayout>
  );
}
