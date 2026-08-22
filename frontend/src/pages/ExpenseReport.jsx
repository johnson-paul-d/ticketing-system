import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Wallet,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Layers,
  FilterX,
  Download,
  PieChart,
  AlertTriangle,
} from "lucide-react";
import MainLayout from "../layouts/MainLayout";
import api from "../services/api";

const CURRENCY_SYMBOL = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };

// Amounts arrive as numerics (often strings over REST). Fixed fraction digits
// keep the two decimals a raw float would drop — 1250.5 has to read as ₹1,250.50.
const formatMoney = (value, currency = "INR") => {
  const amount = Number(value) || 0;
  const formatted = amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const symbol = CURRENCY_SYMBOL[currency];
  return symbol ? `${symbol}${formatted}` : `${currency} ${formatted}`;
};

// expense_date is a date-only column ("YYYY-MM-DD"); new Date() would read it as
// UTC and show the previous day to an IST viewer, so format the stored parts.
const fmtDate = (value) => {
  if (!value) return "—";
  const [y, m, d] = String(value).slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : String(value);
};

// YYYY-MM, so months sort chronologically rather than alphabetically.
const monthKey = (value) => (value ? String(value).slice(0, 7) : null);

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const monthLabel = (key) => {
  const [y, m] = String(key).split("-");
  return `${MONTH_NAMES[Number(m) - 1] || key} ${y}`;
};

// Claims raised before divisions existed have none, so "No division" has to be a
// selectable value of its own — a sentinel, since "" already means "all".
const NO_DIVISION = "__none__";

// A line is only referenceable once its claim has been numbered.
const lineRef = (line) =>
  line.claim_number ? `${line.claim_number}-${String(line.line_no ?? 0).padStart(2, "0")}` : "—";

const sum = (rows, key) => rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);

const STATUS_CHIP = {
  Approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Rejected: "bg-red-50 text-red-700 border-red-200",
  Pending: "bg-gray-100 text-gray-600 border-gray-200",
};

// Wrap only when needed, and double any embedded quote — otherwise a description
// containing a comma would split into extra columns in a spreadsheet.
const csvCell = (value) => {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function KpiCard({ icon: Icon, label, value, sub, tone }) {
  const tones = {
    good: "text-emerald-600 bg-emerald-50",
    bad: "text-red-600 bg-red-50",
    warn: "text-amber-600 bg-amber-50",
    neutral: "text-[#9b2423] bg-[#9b2423]/10",
  };
  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-5 flex items-start gap-3">
      <span className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${tones[tone] || tones.neutral}`}>
        <Icon size={17} />
      </span>
      <div className="min-w-0">
        <p className="text-xl sm:text-2xl font-bold leading-tight break-words">{value}</p>
        <p className="text-xs text-gray-500 font-medium mt-0.5">{label}</p>
        {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function StatusChip({ status, reason }) {
  const label = status || "Pending";
  return (
    <span
      title={reason || undefined}
      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${
        STATUS_CHIP[label] || STATUS_CHIP.Pending
      }`}
    >
      {label}
    </span>
  );
}

export default function ExpenseReport() {
  const navigate = useNavigate();

  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [fMonth, setFMonth] = useState("");
  const [fStatus, setFStatus] = useState("All");
  const [fCategory, setFCategory] = useState("");
  const [fPerson, setFPerson] = useState("");
  const [fDivision, setFDivision] = useState("");

  // Fetched once, unfiltered: every filter below is a client-side narrowing of
  // the same rows, so re-querying per dropdown change would only add latency.
  useEffect(() => {
    api
      .get("/expenses/report")
      .then((res) => {
        setLines(res.data?.lines || []);
        setError("");
      })
      .catch((err) => {
        setLines([]);
        setError(err.response?.data?.message || "Failed to build the expense report");
      })
      .finally(() => setLoading(false));
  }, []);

  const monthOptions = useMemo(
    () => [...new Set(lines.map((l) => monthKey(l.expense_date)).filter(Boolean))].sort().reverse(),
    [lines]
  );

  // Categories come from the rows rather than the constants file, so the list
  // reflects whichever teams the viewer can actually see.
  const categoryOptions = useMemo(
    () => [...new Set(lines.map((l) => l.category).filter(Boolean))].sort(),
    [lines]
  );

  const personOptions = useMemo(
    () => [...new Set(lines.map((l) => l.claimant_name || "—"))].sort(),
    [lines]
  );

  const divisionOptions = useMemo(
    () => [...new Set(lines.map((l) => l.division).filter(Boolean))].sort(),
    [lines]
  );

  const hasUndivided = useMemo(() => lines.some((l) => !l.division), [lines]);

  const filtered = useMemo(
    () =>
      lines.filter((l) => {
        if (fMonth && monthKey(l.expense_date) !== fMonth) return false;
        if (fStatus !== "All" && (l.approval_status || "Pending") !== fStatus) return false;
        if (fCategory && l.category !== fCategory) return false;
        if (fPerson && (l.claimant_name || "—") !== fPerson) return false;
        if (fDivision === NO_DIVISION) {
          if (l.division) return false;
        } else if (fDivision && l.division !== fDivision) return false;
        return true;
      }),
    [lines, fMonth, fStatus, fCategory, fPerson, fDivision]
  );

  const filtersActive = !!(fMonth || fStatus !== "All" || fCategory || fPerson || fDivision);

  const clearFilters = () => {
    setFMonth("");
    setFStatus("All");
    setFCategory("");
    setFPerson("");
    setFDivision("");
  };

  // The API's `totals` cover the whole fetched range; the cards have to track
  // the filters, so they are recomputed from the visible rows.
  const kpis = useMemo(() => {
    const of = (status) => filtered.filter((l) => (l.approval_status || "Pending") === status);
    const approved = of("Approved");
    const pending = of("Pending");
    const rejected = of("Rejected");
    return {
      approved: { count: approved.length, amount: sum(approved, "total") },
      pending: { count: pending.length, amount: sum(pending, "total") },
      rejected: { count: rejected.length, amount: sum(rejected, "total") },
      all: { count: filtered.length, amount: sum(filtered, "total") },
    };
  }, [filtered]);

  // One symbol for the aggregates. Everything is INR in practice; if a viewer
  // ever spans currencies the mixed note below flags that the sums are indicative.
  const currencies = useMemo(
    () => [...new Set(filtered.map((l) => l.currency || "INR"))],
    [filtered]
  );
  const currency = currencies[0] || "INR";

  const byCategory = useMemo(() => {
    const map = new Map();
    filtered.forEach((l) => {
      const key = l.category || "Uncategorised";
      const row = map.get(key) || { category: key, count: 0, total: 0 };
      row.count += 1;
      row.total += Number(l.total) || 0;
      map.set(key, row);
    });
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [filtered]);

  const maxCategoryTotal = byCategory[0]?.total || 0;

  const detail = useMemo(
    () => [...filtered].sort((a, b) => String(b.expense_date || "").localeCompare(String(a.expense_date || ""))),
    [filtered]
  );

  const exportCsv = () => {
    const header = [
      "Date", "Reference", "Claim", "Claimant", "Division", "Team", "Category", "Description",
      "Currency", "Amount", "Tax", "Total", "Status", "Approved By", "Approved At", "Reason",
    ];
    const body = detail.map((l) => [
      String(l.expense_date || "").slice(0, 10),
      lineRef(l),
      l.title,
      l.claimant_name,
      l.division,
      l.team,
      l.category,
      l.description,
      l.currency || "INR",
      Number(l.amount || 0).toFixed(2),
      Number(l.tax_amount || 0).toFixed(2),
      Number(l.total || 0).toFixed(2),
      l.approval_status || "Pending",
      l.approved_by_name,
      String(l.approved_at || "").slice(0, 10),
      l.rejection_reason,
    ]);

    const csv = [header, ...body].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `expense-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <MainLayout>
      <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-3">
            <Wallet className="text-[#9b2423]" size={28} /> Expense Report
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Every individual expense line you can see, and how each one was decided — approved,
            rejected or still pending
          </p>
        </div>
        {!loading && !error && lines.length > 0 && (
          <button
            onClick={exportCsv}
            disabled={detail.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#9b2423] text-white text-sm font-medium hover:bg-[#7d1d1c] transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={15} /> Export CSV
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-gray-400 gap-2">
          <Loader2 size={20} className="animate-spin" /> Building the expense report…
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl shadow-sm p-8 flex items-start gap-3">
          <span className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={17} />
          </span>
          <p className="text-sm text-gray-600 leading-relaxed">{error}</p>
        </div>
      ) : lines.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm p-12 text-center text-gray-400">
          No expense lines have been recorded yet
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap mb-5">
            <select value={fMonth} onChange={(e) => setFMonth(e.target.value)}
              className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none text-gray-600">
              <option value="">All months</option>
              {monthOptions.map((m) => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </select>
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}
              className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none text-gray-600">
              <option value="All">All statuses</option>
              <option value="Approved">Approved only</option>
              <option value="Pending">Pending only</option>
              <option value="Rejected">Rejected only</option>
            </select>
            <select value={fCategory} onChange={(e) => setFCategory(e.target.value)}
              className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none text-gray-600 max-w-[180px]">
              <option value="">All categories</option>
              {categoryOptions.map((c) => <option key={c}>{c}</option>)}
            </select>
            <select value={fPerson} onChange={(e) => setFPerson(e.target.value)}
              className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none text-gray-600 max-w-[180px]">
              <option value="">All people</option>
              {personOptions.map((p) => <option key={p}>{p}</option>)}
            </select>
            <select value={fDivision} onChange={(e) => setFDivision(e.target.value)}
              className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none text-gray-600 max-w-[180px]">
              <option value="">All divisions</option>
              {divisionOptions.map((d) => <option key={d}>{d}</option>)}
              {hasUndivided && <option value={NO_DIVISION}>No division</option>}
            </select>
            {filtersActive && (
              <button
                onClick={clearFilters}
                className="inline-flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-[#9b2423] px-2 py-2">
                <FilterX size={14} /> Clear
              </button>
            )}
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-2">
            <KpiCard
              icon={CheckCircle2}
              label="Approved"
              value={formatMoney(kpis.approved.amount, currency)}
              sub={`${kpis.approved.count} ${kpis.approved.count === 1 ? "expense" : "expenses"}`}
              tone="good"
            />
            <KpiCard
              icon={Clock}
              label="Pending"
              value={formatMoney(kpis.pending.amount, currency)}
              sub={`${kpis.pending.count} ${kpis.pending.count === 1 ? "expense" : "expenses"}`}
              tone="warn"
            />
            <KpiCard
              icon={XCircle}
              label="Rejected"
              value={formatMoney(kpis.rejected.amount, currency)}
              sub={`${kpis.rejected.count} ${kpis.rejected.count === 1 ? "expense" : "expenses"}`}
              tone="bad"
            />
            <KpiCard
              icon={Layers}
              label="Line items"
              value={kpis.all.count}
              sub={`${formatMoney(kpis.all.amount, currency)} claimed in total`}
              tone="neutral"
            />
          </div>
          <p className="text-[11px] text-gray-400 mb-6">
            Totals are per expense line — a single claim can be part approved.
            {currencies.length > 1 && ` Mixed currencies (${currencies.join(", ")}) are summed as ${currency}.`}
          </p>

          {filtered.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm p-12 text-center text-gray-400">
              No expense lines match the current filters
            </div>
          ) : (
            <>
              {/* Spend by category */}
              <div className="bg-white rounded-2xl shadow-sm p-5 mb-6">
                <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
                  <PieChart size={15} className="text-[#9b2423]" /> Spend by category
                </h2>
                <div className="flex flex-col gap-3">
                  {byCategory.map((c) => (
                    <div key={c.category}>
                      <div className="flex items-baseline justify-between gap-3 mb-1">
                        <span className="text-xs font-medium text-gray-700 truncate">{c.category}</span>
                        <span className="text-xs text-gray-500 whitespace-nowrap">
                          <span className="text-gray-400">{c.count}×</span>{" "}
                          <span className="font-semibold text-gray-800">
                            {formatMoney(c.total, currency)}
                          </span>
                          <span className="text-gray-400 ml-1">
                            ({kpis.all.amount ? Math.round((c.total / kpis.all.amount) * 100) : 0}%)
                          </span>
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#9b2423]"
                          style={{ width: `${maxCategoryTotal ? (c.total / maxCategoryTotal) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Detail table */}
              <div className="hidden md:block bg-white rounded-2xl shadow-sm overflow-x-auto">
                <table className="w-full min-w-[1180px] text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                      <th className="px-5 py-2.5 font-semibold">Date</th>
                      <th className="px-3 py-2.5 font-semibold">Reference</th>
                      <th className="px-3 py-2.5 font-semibold">Claimant</th>
                      <th className="px-3 py-2.5 font-semibold">Division</th>
                      <th className="px-3 py-2.5 font-semibold">Category</th>
                      <th className="px-3 py-2.5 font-semibold">Description</th>
                      <th className="px-3 py-2.5 font-semibold text-right">Amount</th>
                      <th className="px-3 py-2.5 font-semibold text-right">Tax</th>
                      <th className="px-3 py-2.5 font-semibold text-right">Total</th>
                      <th className="px-3 py-2.5 font-semibold">Status</th>
                      <th className="px-5 py-2.5 font-semibold">Approved By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.map((l) => (
                      <tr
                        key={l.line_id}
                        onClick={() => navigate(`/expenses/${l.claim_id}`)}
                        className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer transition"
                      >
                        <td className="px-5 py-3 text-xs whitespace-nowrap text-gray-600">
                          {fmtDate(l.expense_date)}
                        </td>
                        <td className="px-3 py-3">
                          <div className="text-xs font-semibold text-gray-800 whitespace-nowrap">
                            {lineRef(l)}
                          </div>
                          {l.title && (
                            <div className="text-[11px] text-gray-400 line-clamp-1 max-w-[180px]">{l.title}</div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-600 whitespace-nowrap">
                          {l.claimant_name || "—"}
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-600 whitespace-nowrap">
                          {l.division || "—"}
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-600">{l.category || "—"}</td>
                        <td className="px-3 py-3 text-xs text-gray-500 max-w-[240px]">
                          <span className="line-clamp-2">{l.description || "—"}</span>
                        </td>
                        <td className="px-3 py-3 text-right whitespace-nowrap text-gray-600">
                          {formatMoney(l.amount, l.currency)}
                        </td>
                        <td className="px-3 py-3 text-right whitespace-nowrap text-gray-400">
                          {formatMoney(l.tax_amount, l.currency)}
                        </td>
                        <td className="px-3 py-3 text-right whitespace-nowrap font-semibold text-gray-800">
                          {formatMoney(l.total, l.currency)}
                        </td>
                        <td className="px-3 py-3">
                          <StatusChip status={l.approval_status} reason={l.rejection_reason} />
                        </td>
                        <td className="px-5 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {l.approved_by_name || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden grid grid-cols-1 gap-4">
                {detail.map((l) => (
                  <button
                    key={l.line_id}
                    type="button"
                    onClick={() => navigate(`/expenses/${l.claim_id}`)}
                    className="bg-white rounded-2xl shadow-sm border border-transparent hover:border-[#9b2423]/20 transition p-5 text-left flex flex-col gap-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h2 className="font-bold text-sm">{l.category || "—"}</h2>
                        <p className="text-[11px] text-gray-400 mt-0.5">{lineRef(l)}</p>
                      </div>
                      <StatusChip status={l.approval_status} reason={l.rejection_reason} />
                    </div>

                    {l.description && (
                      <p className="text-xs text-gray-500 line-clamp-2">{l.description}</p>
                    )}

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-gray-500">{fmtDate(l.expense_date)}</span>
                      <span className="text-base font-bold text-gray-800">
                        {formatMoney(l.total, l.currency)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-[11px] text-gray-400 border-t pt-2">
                      <span>{l.claimant_name || "—"}</span>
                      <span>{l.division || "—"}</span>
                      <span>{l.approved_by_name ? `by ${l.approved_by_name}` : "—"}</span>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </MainLayout>
  );
}
