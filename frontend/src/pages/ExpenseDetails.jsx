import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Receipt, Plus, Loader2, Save, Trash2, Pencil, ArrowLeft } from "lucide-react";
import MainLayout from "../layouts/MainLayout";
import api from "../services/api";
import useAuthStore from "../store/authStore";
import { getTeam } from "../constants/roles";
import { expenseCategoriesForTeam } from "../constants/expenseCategories";

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED"];
const CURRENCY_SYMBOL = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };

const statusChip = {
  Draft: "bg-gray-100 text-gray-600 border-gray-200",
  Submitted: "bg-amber-50 text-amber-700 border-amber-200",
  Approved: "bg-blue-50 text-blue-700 border-blue-200",
  Rejected: "bg-red-50 text-red-700 border-red-200",
  Paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

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

// Date-only columns come back as "YYYY-MM-DD"; new Date() would read them as UTC
// and show the previous day to an IST viewer, so format the stored parts as-is.
const fmtDate = (value) => {
  if (!value) return "—";
  const [y, m, d] = String(value).slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : String(value);
};

const dateInputValue = (value) => (value ? String(value).slice(0, 10) : "");

const inputCls =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 outline-none focus:ring-2 focus:ring-[#9b2423]/40 disabled:opacity-60 disabled:cursor-not-allowed";
const inputSmCls =
  "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 outline-none focus:ring-2 focus:ring-[#9b2423]/40";
const errorCls = "border-red-300 bg-red-50/60 focus:ring-red-300";

const EMPTY_LINE = {
  expense_date: "",
  category: "",
  description: "",
  amount: "",
  tax_amount: "0",
};

function FieldError({ children }) {
  if (!children) return null;
  return <p className="text-xs text-red-600 mt-1.5">{children}</p>;
}

function LineForm({
  value,
  onChange,
  errors,
  categories,
  currency,
  onSubmit,
  onCancel,
  submitting,
  submitLabel,
  submitIcon: SubmitIcon = Plus,
}) {
  const set = (key) => (e) => onChange({ ...value, [key]: e.target.value });

  return (
    <div className="bg-gray-50/70 border-t px-4 py-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-2">
          <label className="block text-[11px] uppercase tracking-wide text-gray-400 mb-1.5">
            Date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={value.expense_date}
            onChange={set("expense_date")}
            className={`${inputSmCls} ${errors.expense_date ? errorCls : ""}`}
          />
          <FieldError>{errors.expense_date}</FieldError>
        </div>

        <div className="lg:col-span-3">
          <label className="block text-[11px] uppercase tracking-wide text-gray-400 mb-1.5">
            Category <span className="text-red-500">*</span>
          </label>
          <select
            value={value.category}
            onChange={set("category")}
            className={`${inputSmCls} ${errors.category ? errorCls : ""}`}
          >
            <option value="">— Select —</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <FieldError>{errors.category}</FieldError>
        </div>

        <div className="lg:col-span-3">
          <label className="block text-[11px] uppercase tracking-wide text-gray-400 mb-1.5">
            Description
          </label>
          <input
            value={value.description}
            onChange={set("description")}
            placeholder="e.g., Chennai → Pune, return fare"
            className={inputSmCls}
          />
        </div>

        <div className="lg:col-span-2">
          <label className="block text-[11px] uppercase tracking-wide text-gray-400 mb-1.5">
            Amount ({currency}) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={value.amount}
            onChange={set("amount")}
            placeholder="0.00"
            className={`${inputSmCls} text-right ${errors.amount ? errorCls : ""}`}
          />
          <FieldError>{errors.amount}</FieldError>
        </div>

        <div className="lg:col-span-2">
          <label className="block text-[11px] uppercase tracking-wide text-gray-400 mb-1.5">
            Tax ({currency})
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={value.tax_amount}
            onChange={set("tax_amount")}
            placeholder="0.00"
            className={`${inputSmCls} text-right ${errors.tax_amount ? errorCls : ""}`}
          />
          <FieldError>{errors.tax_amount}</FieldError>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="inline-flex items-center gap-2 bg-[#9b2423] hover:bg-[#7d1d1c] disabled:opacity-60 text-white font-semibold text-sm px-4 py-2.5 rounded-xl transition"
        >
          {submitting ? <Loader2 size={15} className="animate-spin" /> : <SubmitIcon size={15} />}
          {submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

export default function ExpenseDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const isNew = !id;

  const [claim, setClaim] = useState(null);
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [form, setForm] = useState({
    title: "",
    period_from: "",
    period_to: "",
    currency: "INR",
  });
  const [headerErrors, setHeaderErrors] = useState({});

  const [newLine, setNewLine] = useState(EMPTY_LINE);
  const [newLineErrors, setNewLineErrors] = useState({});
  const [editingLineId, setEditingLineId] = useState(null);
  const [editLine, setEditLine] = useState(EMPTY_LINE);
  const [editLineErrors, setEditLineErrors] = useState({});
  const [lineSaving, setLineSaving] = useState(false);

  // syncForm is off for the refetches that follow a line change: those only need
  // the recalculated total, and rewriting the header fields would throw away
  // whatever the claimant had typed but not saved yet.
  const fetchClaim = useCallback(async ({ syncForm = true } = {}) => {
    try {
      const res = await api.get(`/expenses/${id}`);
      const data = res.data || {};
      setClaim(data);
      setLines(data.lines || []);
      if (syncForm) {
        setForm({
          title: data.title || "",
          period_from: dateInputValue(data.period_from),
          period_to: dateInputValue(data.period_to),
          currency: data.currency || "INR",
        });
      }
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load the expense claim");
    } finally {
      setLoading(false);
    }
  }, [id]);

  // /expenses/new and /expenses/:id render the same element, so React can keep
  // this instance mounted across the post-create redirect. Re-arming `loading`
  // here stops the stale (null) claim from flashing the not-found state.
  useEffect(() => {
    if (isNew) return;
    setLoading(true);
    fetchClaim();
  }, [isNew, fetchClaim]);

  // The category list follows the CLAIM's team so an admin editing another
  // team's claim gets that team's list; a claim being created takes the
  // creator's team (Super Admins have none and fall back to Marketing).
  const categories = useMemo(
    () => expenseCategoriesForTeam(claim?.team || getTeam(user)),
    [claim?.team, user]
  );

  const currency = claim?.currency || form.currency || "INR";

  // Only Drafts are editable. Phase 1 never leaves Draft, but the guard has to
  // hold once submit/approve land or an approved claim could be edited.
  const editable = isNew || claim?.status === "Draft";

  const newLineDirty = useMemo(
    () => Object.keys(EMPTY_LINE).some((key) => newLine[key] !== EMPTY_LINE[key]),
    [newLine]
  );

  const linesTotal = useMemo(
    () =>
      lines.reduce(
        (sum, line) => sum + (Number(line.amount) || 0) + (Number(line.tax_amount) || 0),
        0
      ),
    [lines]
  );

  // ---------------------------------------------------------------- header

  const validateHeader = () => {
    const errs = {};
    if (!form.title.trim()) errs.title = "A title is required";
    if (form.period_from && form.period_to && form.period_from > form.period_to)
      errs.period_to = "The period end cannot be before the period start";
    return errs;
  };

  const saveHeader = async () => {
    const errs = validateHeader();
    setHeaderErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    setError("");
    setNotice("");
    const body = {
      title: form.title.trim(),
      period_from: form.period_from || null,
      period_to: form.period_to || null,
      currency: form.currency,
    };
    try {
      if (isNew) {
        const res = await api.post("/expenses", body);
        navigate(`/expenses/${res.data.id}`, { replace: true });
      } else {
        const res = await api.put(`/expenses/${id}`, body);
        setClaim((prev) => ({ ...prev, ...res.data }));
        setNotice("Claim saved");
      }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save the expense claim");
    } finally {
      setSaving(false);
    }
  };

  const deleteClaim = async () => {
    if (!window.confirm("Delete this expense claim and all of its lines?")) return;
    setSaving(true);
    setError("");
    try {
      await api.delete(`/expenses/${id}`);
      navigate("/expenses");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete the expense claim");
      setSaving(false);
    }
  };

  // ----------------------------------------------------------------- lines

  const validateLine = (draft) => {
    const errs = {};
    if (!draft.expense_date) errs.expense_date = "Pick the date the expense was incurred";
    if (!draft.category) errs.category = "Choose a category";

    const amount = Number(draft.amount);
    if (String(draft.amount).trim() === "" || Number.isNaN(amount))
      errs.amount = "Enter an amount";
    else if (amount <= 0) errs.amount = "Amount must be greater than 0";

    const tax = String(draft.tax_amount).trim() === "" ? 0 : Number(draft.tax_amount);
    if (Number.isNaN(tax) || tax < 0) errs.tax_amount = "Tax cannot be negative";

    return errs;
  };

  const linePayload = (draft) => ({
    expense_date: draft.expense_date,
    category: draft.category,
    description: draft.description.trim(),
    amount: Number(draft.amount),
    tax_amount: String(draft.tax_amount).trim() === "" ? 0 : Number(draft.tax_amount),
  });

  const addLine = async () => {
    const errs = validateLine(newLine);
    setNewLineErrors(errs);
    if (Object.keys(errs).length) return;

    setLineSaving(true);
    setError("");
    setNotice("");
    try {
      await api.post(`/expenses/${id}/lines`, linePayload(newLine));
      setNewLine(EMPTY_LINE);
      setNewLineErrors({});
      // Refetch rather than patch state locally: total_amount is recalculated
      // server-side and that figure is the authoritative one.
      await fetchClaim({ syncForm: false });
    } catch (err) {
      setError(err.response?.data?.message || "Failed to add the expense line");
    } finally {
      setLineSaving(false);
    }
  };

  const startEditLine = (line) => {
    setEditingLineId(line.id);
    setEditLineErrors({});
    setEditLine({
      expense_date: dateInputValue(line.expense_date),
      category: line.category || "",
      description: line.description || "",
      amount: line.amount ?? "",
      tax_amount: line.tax_amount ?? "0",
    });
  };

  const cancelEditLine = () => {
    setEditingLineId(null);
    setEditLine(EMPTY_LINE);
    setEditLineErrors({});
  };

  const saveEditLine = async () => {
    const errs = validateLine(editLine);
    setEditLineErrors(errs);
    if (Object.keys(errs).length) return;

    setLineSaving(true);
    setError("");
    setNotice("");
    try {
      await api.put(`/expenses/${id}/lines/${editingLineId}`, linePayload(editLine));
      cancelEditLine();
      await fetchClaim({ syncForm: false });
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update the expense line");
    } finally {
      setLineSaving(false);
    }
  };

  const deleteLine = async (lineId) => {
    if (!window.confirm("Delete this expense line?")) return;
    setLineSaving(true);
    setError("");
    setNotice("");
    try {
      await api.delete(`/expenses/${id}/lines/${lineId}`);
      if (editingLineId === lineId) cancelEditLine();
      await fetchClaim({ syncForm: false });
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete the expense line");
    } finally {
      setLineSaving(false);
    }
  };

  // ---------------------------------------------------------------- render

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-24 text-gray-400 gap-2">
          <Loader2 size={20} className="animate-spin" /> Loading expense claim…
        </div>
      </MainLayout>
    );
  }

  if (!isNew && !claim) {
    return (
      <MainLayout>
        <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
          <Receipt size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">{error || "Expense claim not found"}</p>
          <button
            onClick={() => navigate("/expenses")}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            <ArrowLeft size={15} /> Back to Expenses
          </button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div>
          <button
            onClick={() => navigate("/expenses")}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-[#9b2423] mb-2"
          >
            <ArrowLeft size={13} /> Expenses
          </button>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-3 flex-wrap">
            <Receipt className="text-[#9b2423]" size={28} />
            {isNew ? "New Expense Claim" : claim.title}
            {!isNew && (
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                  statusChip[claim.status] || statusChip.Draft
                }`}
              >
                {claim.status}
              </span>
            )}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {isNew ? (
              "Record the claim period first — expense lines are added once it is created"
            ) : (
              <>
                {claim.claim_number} · {claim.claimant_name || "—"} · raised {fmtDate(claim.created_at)}
              </>
            )}
          </p>
        </div>

        {!isNew && (
          <div className="bg-white rounded-2xl shadow-sm px-5 py-4 text-right">
            <p className="text-[11px] uppercase tracking-wide text-gray-400">Claim total</p>
            <p className="text-2xl font-bold text-[#9b2423]">
              {formatMoney(claim.total_amount, currency)}
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl border border-red-200 mb-5">
          {error}
        </div>
      )}
      {notice && (
        <div className="bg-emerald-50 text-emerald-700 text-sm px-4 py-3 rounded-xl border border-emerald-200 mb-5">
          {notice}
        </div>
      )}
      {!isNew && !editable && (
        <div className="bg-amber-50 text-amber-800 text-sm px-4 py-3 rounded-xl border border-amber-200 mb-5">
          This claim is {claim.status.toLowerCase()} and can no longer be edited.
        </div>
      )}

      {/* Claim header */}
      <div className="bg-white rounded-2xl shadow-sm p-5 sm:p-6 mb-6">
        <h2 className="text-lg font-bold mb-5">Claim details</h2>

        <div className="mb-5">
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="e.g., Pune site visit — August"
            disabled={!editable || saving}
            className={`${inputCls} ${headerErrors.title ? errorCls : ""}`}
          />
          <FieldError>{headerErrors.title}</FieldError>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Period from</label>
            <input
              type="date"
              value={form.period_from}
              onChange={(e) => setForm((f) => ({ ...f, period_from: e.target.value }))}
              disabled={!editable || saving}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Period to</label>
            <input
              type="date"
              value={form.period_to}
              onChange={(e) => setForm((f) => ({ ...f, period_to: e.target.value }))}
              disabled={!editable || saving}
              className={`${inputCls} ${headerErrors.period_to ? errorCls : ""}`}
            />
            <FieldError>{headerErrors.period_to}</FieldError>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Currency</label>
            <select
              value={form.currency}
              onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
              disabled={!editable || saving}
              className={inputCls}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {editable && (
          <div className="flex flex-wrap gap-3 mt-6">
            <button
              onClick={saveHeader}
              disabled={saving}
              className="inline-flex items-center gap-2 bg-[#9b2423] hover:bg-[#7d1d1c] disabled:opacity-60 text-white font-semibold text-sm px-5 py-3 rounded-xl transition"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {isNew ? "Create Claim" : "Save Changes"}
            </button>
            <button
              onClick={() => navigate("/expenses")}
              disabled={saving}
              className="px-5 py-3 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            {!isNew && (
              <button
                onClick={deleteClaim}
                disabled={saving}
                className="inline-flex items-center gap-2 sm:ml-auto px-5 py-3 rounded-xl border border-red-200 bg-white text-sm font-medium text-red-600 hover:bg-red-50"
              >
                <Trash2 size={15} /> Delete Claim
              </button>
            )}
          </div>
        )}
      </div>

      {/* Line items */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b flex-wrap">
          <div>
            <h2 className="text-lg font-bold">Expense lines</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {lines.length} {lines.length === 1 ? "line" : "lines"} · amounts in {currency}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wide text-gray-400">Lines total</p>
            <p className="text-lg font-bold text-gray-800">{formatMoney(linesTotal, currency)}</p>
          </div>
        </div>

        {isNew ? (
          <div className="px-5 py-12 text-center">
            <Receipt size={36} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">Create the claim to add expense lines</p>
            <p className="text-sm text-gray-400 mt-1">
              Lines attach to a saved claim, so the header is filled in first
            </p>
          </div>
        ) : (
          <>
            {/* Column headings (desktop) */}
            {lines.length > 0 && (
              <div className="hidden lg:grid lg:grid-cols-12 gap-3 px-4 py-2.5 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400">
                <span className="lg:col-span-2">Date</span>
                <span className="lg:col-span-3">Category</span>
                <span className="lg:col-span-3">Description</span>
                <span className="lg:col-span-1 text-right">Amount</span>
                <span className="lg:col-span-1 text-right">Tax</span>
                <span className="lg:col-span-2 text-right">Line total</span>
              </div>
            )}

            {lines.length === 0 && (
              <div className="px-5 py-12 text-center">
                <Receipt size={36} className="mx-auto text-gray-300 mb-3" />
                <p className="text-gray-500 font-medium">No expense lines yet</p>
                {editable && (
                  <p className="text-sm text-gray-400 mt-1">
                    Add the first line below to build up this claim
                  </p>
                )}
              </div>
            )}

            {lines.map((line) =>
              editingLineId === line.id ? (
                <LineForm
                  key={line.id}
                  value={editLine}
                  onChange={setEditLine}
                  errors={editLineErrors}
                  categories={categories}
                  currency={currency}
                  onSubmit={saveEditLine}
                  onCancel={cancelEditLine}
                  submitting={lineSaving}
                  submitLabel="Save Line"
                  submitIcon={Save}
                />
              ) : (
                <div
                  key={line.id}
                  className="grid grid-cols-2 lg:grid-cols-12 gap-2 lg:gap-3 items-center px-4 py-3 border-t hover:bg-gray-50/60 transition"
                >
                  <div className="lg:col-span-2">
                    <p className="lg:hidden text-[11px] uppercase tracking-wide text-gray-400">
                      Date
                    </p>
                    <p className="text-sm text-gray-700">{fmtDate(line.expense_date)}</p>
                  </div>
                  <div className="lg:col-span-3">
                    <p className="lg:hidden text-[11px] uppercase tracking-wide text-gray-400">
                      Category
                    </p>
                    <p className="text-sm font-semibold text-gray-800">{line.category}</p>
                  </div>
                  <div className="col-span-2 lg:col-span-3">
                    <p className="lg:hidden text-[11px] uppercase tracking-wide text-gray-400">
                      Description
                    </p>
                    <p className="text-sm text-gray-500 break-words">{line.description || "—"}</p>
                  </div>
                  <div className="lg:col-span-1 lg:text-right">
                    <p className="lg:hidden text-[11px] uppercase tracking-wide text-gray-400">
                      Amount
                    </p>
                    <p className="text-sm text-gray-700">{formatMoney(line.amount, currency)}</p>
                  </div>
                  <div className="lg:col-span-1 lg:text-right">
                    <p className="lg:hidden text-[11px] uppercase tracking-wide text-gray-400">
                      Tax
                    </p>
                    <p className="text-sm text-gray-500">{formatMoney(line.tax_amount, currency)}</p>
                  </div>
                  <div className="col-span-2 lg:col-span-2 flex items-center justify-between lg:justify-end gap-3 border-t lg:border-0 pt-2 lg:pt-0">
                    <p className="text-sm font-bold text-gray-800">
                      {formatMoney(
                        (Number(line.amount) || 0) + (Number(line.tax_amount) || 0),
                        currency
                      )}
                    </p>
                    {editable && (
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => startEditLine(line)}
                          title="Edit line"
                          className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:text-[#9b2423] hover:border-[#9b2423]/40 transition"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteLine(line.id)}
                          title="Delete line"
                          className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-300 transition"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            )}

            {editable && editingLineId === null && (
              <LineForm
                value={newLine}
                onChange={setNewLine}
                errors={newLineErrors}
                categories={categories}
                currency={currency}
                onSubmit={addLine}
                onCancel={
                  newLineDirty
                    ? () => {
                        setNewLine(EMPTY_LINE);
                        setNewLineErrors({});
                      }
                    : null
                }
                submitting={lineSaving}
                submitLabel="Add Line"
              />
            )}

            <div className="flex items-center justify-between gap-3 px-5 py-4 border-t bg-gray-50/60 flex-wrap">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-gray-400">
                  Recorded on the claim
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Server-calculated total, refreshed after every save
                </p>
              </div>
              <p className="text-xl font-bold text-[#9b2423]">
                {formatMoney(claim.total_amount, currency)}
              </p>
            </div>
          </>
        )}
      </div>

    </MainLayout>
  );
}
