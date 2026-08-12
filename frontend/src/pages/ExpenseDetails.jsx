import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Receipt,
  Plus,
  Loader2,
  Save,
  Trash2,
  Pencil,
  ArrowLeft,
  Paperclip,
  FileText,
  X,
  Send,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  BadgeCheck,
  Download,
} from "lucide-react";
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

// Receipts may hang off a line or off the claim itself; the latter are keyed
// under a sentinel so both share one feedback/grouping map.
const CLAIM_KEY = "__claim__";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "application/pdf"];
const PDF_TYPE = "application/pdf";
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_EDGE = 1600;
const JPEG_QUALITY = 0.8;

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

// Workflow stamps are full UTC ISO timestamps, unlike the date-only columns, so
// they are converted to IST for display.
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

// Some Android camera intents hand back a File with an empty `type`; falling
// back to the extension stops a legitimate phone photo being refused before it
// has even been tried.
const fileKind = (file) => {
  if (ACCEPTED_TYPES.includes(file.type)) return file.type;
  if (file.type) return "";
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "pdf") return PDF_TYPE;
  return "";
};

const fmtBytes = (bytes) => {
  const kb = (Number(bytes) || 0) / 1024;
  return kb < 1024 ? `${Math.max(1, Math.round(kb))} KB` : `${(kb / 1024).toFixed(1)} MB`;
};

const dateInputValue = (value) => (value ? String(value).slice(0, 10) : "");

const inputCls =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 outline-none focus:ring-2 focus:ring-[#9b2423]/40 disabled:opacity-60 disabled:cursor-not-allowed";
const inputSmCls =
  "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 outline-none focus:ring-2 focus:ring-[#9b2423]/40";
const errorCls = "border-red-300 bg-red-50/60 focus:ring-red-300";
const btnPrimaryCls =
  "inline-flex items-center gap-2 bg-[#9b2423] hover:bg-[#7d1d1c] disabled:opacity-60 text-white font-semibold text-sm px-5 py-3 rounded-xl transition";
const btnGhostCls =
  "inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60";

const EMPTY_LINE = {
  expense_date: "",
  category: "",
  description: "",
  amount: "",
  tax_amount: "0",
};

// Phone photos of a bill run 3–8 MB and the server caps uploads at 5 MB, so an
// untouched original is usually rejected. Downscaling to a 1600px long edge and
// re-encoding as JPEG lands a typical bill near 300 KB with the text still
// legible. PDFs never come through here — a canvas round-trip would destroy one.
const compressImage = (file) =>
  new Promise((resolve, reject) => {
    const sourceUrl = URL.createObjectURL(file);
    const img = new window.Image();

    img.onload = () => {
      URL.revokeObjectURL(sourceUrl);
      const longEdge = Math.max(img.naturalWidth, img.naturalHeight);
      const scale = longEdge > MAX_IMAGE_EDGE ? MAX_IMAGE_EDGE / longEdge : 1;
      const width = Math.max(1, Math.round(img.naturalWidth * scale));
      const height = Math.max(1, Math.round(img.naturalHeight * scale));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas is unavailable"));
        return;
      }
      // JPEG has no alpha channel: without a white base a transparent PNG would
      // come out with black patches where the paper should be.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Could not re-encode that image"));
            return;
          }
          const name = `${file.name.replace(/\.[^.]+$/, "") || "receipt"}.jpg`;
          resolve(new File([blob], name, { type: "image/jpeg" }));
        },
        "image/jpeg",
        JPEG_QUALITY
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(sourceUrl);
      reject(new Error("Could not read that image"));
    };

    img.src = sourceUrl;
  });

function FieldError({ children }) {
  if (!children) return null;
  return <p className="text-xs text-red-600 mt-1.5">{children}</p>;
}

function ReceiptThumb({ receipt, url, editable, busy, onOpen, onDelete }) {
  const isPdf = receipt.mime_type === PDF_TYPE;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onOpen}
        title={`${receipt.file_name} · ${fmtBytes(receipt.byte_size)}`}
        className="block rounded-lg border border-gray-200 bg-white overflow-hidden hover:border-[#9b2423]/40 transition"
      >
        {isPdf ? (
          // A PDF cannot be thumbnailed in the browser, so it gets a file chip.
          <span className="flex items-center gap-1.5 px-2.5 h-16 text-xs text-gray-600 max-w-[160px]">
            <FileText size={15} className="text-[#9b2423] flex-shrink-0" />
            <span className="truncate">{receipt.file_name}</span>
          </span>
        ) : url ? (
          <img
            src={url}
            alt={receipt.file_name}
            className="h-16 w-16 object-cover"
            loading="lazy"
          />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center text-gray-300">
            <Loader2 size={15} className="animate-spin" />
          </span>
        )}
      </button>

      {editable && (
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          title="Remove receipt"
          className="absolute -top-2 -right-2 rounded-full bg-white border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-300 p-1 shadow-sm disabled:opacity-60"
        >
          {busy ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
        </button>
      )}
    </div>
  );
}

function ReceiptStrip({
  label,
  receipts,
  urls,
  editable,
  uploading,
  busyId,
  feedback,
  onPick,
  onOpen,
  onDelete,
  missing,
}) {
  const inputRef = useRef(null);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-wide text-gray-400 mr-1">{label}</span>

        {receipts.map((receipt) => (
          <ReceiptThumb
            key={receipt.id}
            receipt={receipt}
            url={urls[receipt.id]}
            editable={editable}
            busy={busyId === receipt.id}
            onOpen={() => onOpen(receipt)}
            onDelete={() => onDelete(receipt)}
          />
        ))}

        {editable && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                // Cleared straight away so picking the same file twice still
                // fires onChange.
                e.target.value = "";
                if (file) onPick(file);
              }}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 h-16 px-3 rounded-lg border border-dashed border-gray-300 text-xs font-medium text-gray-500 hover:border-[#9b2423]/50 hover:text-[#9b2423] transition disabled:opacity-60"
            >
              {uploading ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Paperclip size={13} />
              )}
              {uploading ? "Uploading…" : "Attach receipt"}
            </button>
          </>
        )}

        {!editable && receipts.length === 0 && (
          <span className="text-xs text-gray-400">No receipt attached</span>
        )}
      </div>

      {missing && (
        <p className="text-xs text-red-600 mt-1.5 font-medium">
          This line needs a receipt before the claim can be submitted
        </p>
      )}
      {feedback?.error && <p className="text-xs text-red-600 mt-1.5">{feedback.error}</p>}
      {feedback?.notice && <p className="text-xs text-gray-500 mt-1.5">{feedback.notice}</p>}
      {feedback?.duplicate && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-1.5">
          This exact file is already attached to another claim. That is allowed — a shared invoice
          can be split — but check it is not a double claim.
        </p>
      )}
    </div>
  );
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
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [signatureRequired, setSignatureRequired] = useState(false);

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

  // Receipt view state. The blob URLs live in a ref as well as state: state
  // drives the render, the ref is what the cleanup can reach to revoke them.
  const objectUrlsRef = useRef(new Map());
  const [receiptUrls, setReceiptUrls] = useState({});
  const [uploadingKey, setUploadingKey] = useState("");
  const [receiptBusyId, setReceiptBusyId] = useState("");
  const [receiptFeedback, setReceiptFeedback] = useState({});
  const [previewId, setPreviewId] = useState("");
  const [previewError, setPreviewError] = useState("");

  // Workflow state.
  const [missingLineIds, setMissingLineIds] = useState([]);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState("");
  const [busyAction, setBusyAction] = useState("");

  // syncForm is off for the refetches that follow a line change: those only need
  // the recalculated total, and rewriting the header fields would throw away
  // whatever the claimant had typed but not saved yet.
  const fetchClaim = useCallback(async ({ syncForm = true } = {}) => {
    try {
      const res = await api.get(`/expenses/${id}`);
      const data = res.data || {};
      setClaim(data);
      setLines(data.lines || []);
      setReceipts(data.receipts || []);
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

  // A blob URL is held by the tab until it is revoked, and a claim's worth of
  // receipts is megabytes — so they go on unmount and whenever the route moves
  // to a different claim.
  useEffect(() => {
    const urls = objectUrlsRef.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
      setReceiptUrls({});
      setPreviewId("");
    };
  }, [id]);

  // The stream endpoint needs the Authorization header, so the bytes have to be
  // fetched and wrapped in an object URL — a bare <img src> would arrive
  // unauthenticated and render broken.
  const loadReceipt = useCallback(
    async (receipt) => {
      const cached = objectUrlsRef.current.get(receipt.id);
      if (cached) return cached;

      const res = await api.get(`/expenses/${id}/receipts/${receipt.id}`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data);
      objectUrlsRef.current.set(receipt.id, url);
      setReceiptUrls((prev) => ({ ...prev, [receipt.id]: url }));
      return url;
    },
    [id]
  );

  // Images are fetched up front so the thumbnails fill in; PDFs are left until
  // one is actually opened, since there is nothing to show until then.
  useEffect(() => {
    receipts
      .filter((r) => r.mime_type !== PDF_TYPE && !objectUrlsRef.current.has(r.id))
      .forEach((r) => {
        loadReceipt(r).catch(() => {});
      });
  }, [receipts, loadReceipt]);

  // The category list follows the CLAIM's team so an admin editing another
  // team's claim gets that team's list; a claim being created takes the
  // creator's team (Super Admins have none and fall back to Marketing).
  const categories = useMemo(
    () => expenseCategoriesForTeam(claim?.team || getTeam(user)),
    [claim?.team, user]
  );

  const currency = claim?.currency || form.currency || "INR";

  // The server decides who may edit what (claimant or admin, and only while the
  // claim is a Draft) and answers with can_edit — mirroring that rule here would
  // only be a second place for it to drift.
  const editable = isNew || claim?.can_edit === true;
  const canApprove = claim?.can_approve === true;
  const isApproved = claim?.status === "Approved";
  const sentBack =
    Boolean(claim?.rejection_reason) &&
    (claim?.status === "Draft" || claim?.status === "Rejected");

  const verifyUrl = claim?.verify_code
    ? `${window.location.origin}/verify/${claim.verify_code}`
    : "";

  const receiptsByLine = useMemo(() => {
    const map = {};
    receipts.forEach((r) => {
      const key = r.line_id || CLAIM_KEY;
      if (!map[key]) map[key] = [];
      map[key].push(r);
    });
    return map;
  }, [receipts]);

  const previewReceipt = useMemo(
    () => receipts.find((r) => r.id === previewId) || null,
    [receipts, previewId]
  );

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

  // -------------------------------------------------------------- receipts

  const setFeedback = (key, value) =>
    setReceiptFeedback((prev) => ({ ...prev, [key]: value }));

  const uploadReceipt = async (key, file) => {
    setFeedback(key, null);

    const kind = fileKind(file);
    if (!kind) {
      setFeedback(key, { error: "Receipts must be a JPEG, PNG or PDF" });
      return;
    }

    let payload = file;
    let compressed = false;
    if (kind !== PDF_TYPE) {
      try {
        payload = await compressImage(file);
        compressed = true;
      } catch {
        // A codec the browser cannot decode still gets its chance at the server,
        // where the size limit is the only thing that can stop it.
        payload = file;
      }
    }

    if (payload.size > MAX_UPLOAD_BYTES) {
      setFeedback(key, {
        error:
          `That file is ${fmtBytes(payload.size)}${compressed ? " even after compression" : ""}` +
          " — the limit is 5 MB. Try a tighter crop or a lower camera resolution.",
      });
      return;
    }

    setUploadingKey(key);
    setError("");
    setNotice("");
    try {
      const body = new FormData();
      body.append("file", payload);
      if (key !== CLAIM_KEY) body.append("line_id", key);

      const res = await api.post(`/expenses/${id}/receipts`, body);

      setFeedback(key, {
        notice: compressed
          ? `Attached ${payload.name} · ${fmtBytes(payload.size)} (compressed from ${fmtBytes(file.size)})`
          : `Attached ${payload.name} · ${fmtBytes(payload.size)}`,
        duplicate: Boolean(res.data?.duplicate_of?.length),
      });
      setMissingLineIds((prev) => prev.filter((lineId) => lineId !== key));
      await fetchClaim({ syncForm: false });
    } catch (err) {
      setFeedback(key, {
        error: err.response?.data?.message || "Failed to attach the receipt",
      });
    } finally {
      setUploadingKey("");
    }
  };

  const deleteReceipt = async (receipt) => {
    if (!window.confirm(`Remove ${receipt.file_name}?`)) return;
    const key = receipt.line_id || CLAIM_KEY;
    setReceiptBusyId(receipt.id);
    setFeedback(key, null);
    try {
      await api.delete(`/expenses/${id}/receipts/${receipt.id}`);
      const url = objectUrlsRef.current.get(receipt.id);
      if (url) {
        URL.revokeObjectURL(url);
        objectUrlsRef.current.delete(receipt.id);
      }
      setReceiptUrls((prev) => {
        const next = { ...prev };
        delete next[receipt.id];
        return next;
      });
      if (previewId === receipt.id) setPreviewId("");
      await fetchClaim({ syncForm: false });
    } catch (err) {
      setFeedback(key, {
        error: err.response?.data?.message || "Failed to remove the receipt",
      });
    } finally {
      setReceiptBusyId("");
    }
  };

  const openPreview = (receipt) => {
    setPreviewError("");
    setPreviewId(receipt.id);
    if (!objectUrlsRef.current.has(receipt.id)) {
      loadReceipt(receipt).catch(() => setPreviewError("Could not load this receipt"));
    }
  };

  // -------------------------------------------------------------- workflow

  const submitClaim = async () => {
    setBusyAction("submit");
    setError("");
    setNotice("");
    try {
      await api.post(`/expenses/${id}/submit`);
      setMissingLineIds([]);
      setShowSubmitConfirm(false);
      await fetchClaim();
      setNotice("Claim submitted for approval");
    } catch (err) {
      const data = err.response?.data;
      // The server names the lines that still need a receipt; highlight exactly
      // those rather than making the claimant hunt for them.
      setMissingLineIds(data?.missing_line_ids || []);
      setError(data?.message || "Failed to submit the claim");
      setShowSubmitConfirm(false);
    } finally {
      setBusyAction("");
    }
  };

  const approveClaim = async () => {
    setBusyAction("approve");
    setError("");
    setNotice("");
    setSignatureRequired(false);
    try {
      await api.post(`/expenses/${id}/approve`);
      await fetchClaim();
      setNotice("Claim approved");
    } catch (err) {
      const data = err.response?.data;
      if (data?.code === "SIGNATURE_REQUIRED") setSignatureRequired(true);
      setError(data?.message || "Failed to approve the claim");
    } finally {
      setBusyAction("");
    }
  };

  const rejectClaim = async () => {
    const reason = rejectReason.trim();
    if (!reason) {
      setRejectError("A reason is required so the claimant knows what to fix");
      return;
    }
    setBusyAction("reject");
    setRejectError("");
    setError("");
    setNotice("");
    try {
      await api.post(`/expenses/${id}/reject`, { reason });
      setShowRejectModal(false);
      setRejectReason("");
      await fetchClaim();
      setNotice("Claim sent back to the claimant");
    } catch (err) {
      setRejectError(err.response?.data?.message || "Failed to reject the claim");
    } finally {
      setBusyAction("");
    }
  };

  const downloadPdf = async () => {
    setBusyAction("pdf");
    setError("");
    try {
      const res = await api.get(`/expenses/${id}/pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${claim.claim_number || "expense-claim"}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      // An error body arrives as a Blob under responseType: "blob", so there is
      // no message to read out of it.
      setError("Failed to download the claim PDF");
    } finally {
      setBusyAction("");
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

  const claimReceipts = receiptsByLine[CLAIM_KEY] || [];

  return (
    <>
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
                  {claim.claim_number || "Not yet numbered"} · {claim.claimant_name || "—"} · raised{" "}
                  {fmtDate(claim.created_at)}
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
            {signatureRequired && (
              <>
                {" "}
                <Link to="/settings/signature" className="font-semibold underline">
                  Upload your signature
                </Link>{" "}
                and then approve again.
              </>
            )}
          </div>
        )}
        {notice && (
          <div className="bg-emerald-50 text-emerald-700 text-sm px-4 py-3 rounded-xl border border-emerald-200 mb-5">
            {notice}
          </div>
        )}

        {/* Sent back — shown above the status so the claimant reads the fix first */}
        {!isNew && sentBack && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5 mb-5">
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-red-800">Sent back for changes</p>
                <p className="text-sm text-red-700 mt-1 whitespace-pre-wrap">
                  {claim.rejection_reason}
                </p>
                <p className="text-xs text-red-600/80 mt-2">
                  Fix the points above and submit again — this is revision {claim.revision || 1}.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Workflow status */}
        {!isNew && (
          <div
            className={`rounded-2xl border p-5 mb-6 ${
              isApproved
                ? "bg-emerald-50 border-emerald-200"
                : claim.status === "Submitted"
                ? "bg-amber-50 border-amber-200"
                : claim.status === "Paid"
                ? "bg-emerald-50 border-emerald-200"
                : "bg-white border-gray-200 shadow-sm"
            }`}
          >
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-3">
                {isApproved || claim.status === "Paid" ? (
                  <BadgeCheck size={20} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                ) : claim.status === "Submitted" ? (
                  <Send size={19} className="text-amber-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <Pencil size={18} className="text-gray-400 flex-shrink-0 mt-0.5" />
                )}

                <div>
                  <p
                    className={`font-bold ${
                      isApproved || claim.status === "Paid"
                        ? "text-emerald-800"
                        : claim.status === "Submitted"
                        ? "text-amber-800"
                        : "text-gray-800"
                    }`}
                  >
                    {isApproved
                      ? "Approved"
                      : claim.status === "Paid"
                      ? "Paid"
                      : claim.status === "Submitted"
                      ? "Awaiting approval"
                      : "Draft — not submitted yet"}
                  </p>
                  <p
                    className={`text-sm mt-0.5 ${
                      isApproved || claim.status === "Paid"
                        ? "text-emerald-700"
                        : claim.status === "Submitted"
                        ? "text-amber-700"
                        : "text-gray-500"
                    }`}
                  >
                    {isApproved
                      ? "This claim is locked and carries a verifiable approval record."
                      : claim.status === "Paid"
                      ? "Reimbursement has been recorded against this claim."
                      : claim.status === "Submitted"
                      ? `Submitted ${fmtDateTime(claim.submitted_at)} — locked until the approver acts.`
                      : "Every line item needs a receipt before this claim can be submitted."}
                  </p>

                  {isApproved && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-3 mt-4">
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-emerald-700/70">
                          Claim number
                        </p>
                        <p className="text-sm font-semibold text-emerald-900">
                          {claim.claim_number || "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-emerald-700/70">
                          Approved by
                        </p>
                        <p className="text-sm font-semibold text-emerald-900">
                          {claim.approved_by_name || "—"}
                          {claim.approved_by_role ? (
                            <span className="font-normal text-emerald-700">
                              {" "}
                              · {claim.approved_by_role}
                            </span>
                          ) : null}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-emerald-700/70">
                          Approved on
                        </p>
                        <p className="text-sm font-semibold text-emerald-900">
                          {fmtDateTime(claim.approved_at)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-emerald-700/70">
                          Verification code
                        </p>
                        <p className="text-sm font-semibold text-emerald-900 font-mono break-all">
                          {claim.verify_code || "—"}
                        </p>
                        {verifyUrl && (
                          <a
                            href={verifyUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-emerald-700 underline break-all"
                          >
                            {verifyUrl}
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {claim.status === "Draft" && editable && (
                  <button
                    onClick={() => setShowSubmitConfirm(true)}
                    disabled={Boolean(busyAction) || lines.length === 0}
                    className={btnPrimaryCls}
                    title={lines.length === 0 ? "Add at least one expense line first" : undefined}
                  >
                    <Send size={16} /> Submit for Approval
                  </button>
                )}

                {canApprove && (
                  <>
                    <button
                      onClick={approveClaim}
                      disabled={Boolean(busyAction)}
                      className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold text-sm px-5 py-3 rounded-xl transition"
                    >
                      {busyAction === "approve" ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <CheckCircle2 size={16} />
                      )}
                      Approve
                    </button>
                    <button
                      onClick={() => {
                        setRejectReason("");
                        setRejectError("");
                        setShowRejectModal(true);
                      }}
                      disabled={Boolean(busyAction)}
                      className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-red-200 bg-white text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                    >
                      <XCircle size={16} /> Reject
                    </button>
                  </>
                )}

                {isApproved && (
                  <button
                    onClick={downloadPdf}
                    disabled={Boolean(busyAction)}
                    className={btnGhostCls}
                  >
                    {busyAction === "pdf" ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Download size={16} />
                    )}
                    Download PDF
                  </button>
                )}
              </div>
            </div>
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
              <button onClick={saveHeader} disabled={saving} className={btnPrimaryCls}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {isNew ? "Create Claim" : "Save Changes"}
              </button>
              <button onClick={() => navigate("/expenses")} disabled={saving} className={btnGhostCls}>
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
                {lines.length} {lines.length === 1 ? "line" : "lines"} · {receipts.length}{" "}
                {receipts.length === 1 ? "receipt" : "receipts"} · amounts in {currency}
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
                    className={`border-t transition ${
                      missingLineIds.includes(line.id)
                        ? "bg-red-50/70 border-l-4 border-l-red-400"
                        : "hover:bg-gray-50/60"
                    }`}
                  >
                    <div className="grid grid-cols-2 lg:grid-cols-12 gap-2 lg:gap-3 items-center px-4 py-3">
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
                        <p className="text-sm text-gray-500 break-words">
                          {line.description || "—"}
                        </p>
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
                        <p className="text-sm text-gray-500">
                          {formatMoney(line.tax_amount, currency)}
                        </p>
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

                    <div className="px-4 pb-3">
                      <ReceiptStrip
                        label="Receipts"
                        receipts={receiptsByLine[line.id] || []}
                        urls={receiptUrls}
                        editable={editable}
                        uploading={uploadingKey === line.id}
                        busyId={receiptBusyId}
                        feedback={receiptFeedback[line.id]}
                        missing={missingLineIds.includes(line.id)}
                        onPick={(file) => uploadReceipt(line.id, file)}
                        onOpen={openPreview}
                        onDelete={deleteReceipt}
                      />
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

              {/* Receipts uploaded against the claim rather than a line. Submit
                  does not count these, so they are called out separately. */}
              {claimReceipts.length > 0 && (
                <div className="px-4 py-4 border-t bg-amber-50/40">
                  <ReceiptStrip
                    label="Unassigned"
                    receipts={claimReceipts}
                    urls={receiptUrls}
                    editable={editable}
                    uploading={uploadingKey === CLAIM_KEY}
                    busyId={receiptBusyId}
                    feedback={receiptFeedback[CLAIM_KEY]}
                    onPick={(file) => uploadReceipt(CLAIM_KEY, file)}
                    onOpen={openPreview}
                    onDelete={deleteReceipt}
                  />
                  <p className="text-xs text-amber-700 mt-2">
                    These are not attached to any line, so they do not satisfy the receipt
                    requirement on submit.
                  </p>
                </div>
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

      {/* RECEIPT PREVIEW */}
      {previewReceipt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPreviewId("")}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b">
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{previewReceipt.file_name}</p>
                <p className="text-xs text-gray-400">
                  {fmtBytes(previewReceipt.byte_size)} · uploaded{" "}
                  {fmtDateTime(previewReceipt.created_at)}
                </p>
              </div>
              <button
                onClick={() => setPreviewId("")}
                className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
              >
                <X size={15} />
              </button>
            </div>

            <div className="bg-gray-50 flex items-center justify-center p-4 min-h-[240px]">
              {previewError ? (
                <p className="text-sm text-red-600">{previewError}</p>
              ) : !receiptUrls[previewReceipt.id] ? (
                <span className="flex items-center gap-2 text-gray-400 text-sm">
                  <Loader2 size={16} className="animate-spin" /> Loading receipt…
                </span>
              ) : previewReceipt.mime_type === PDF_TYPE ? (
                <iframe
                  src={receiptUrls[previewReceipt.id]}
                  title={previewReceipt.file_name}
                  className="w-full h-[70vh] bg-white rounded-lg border border-gray-200"
                />
              ) : (
                <img
                  src={receiptUrls[previewReceipt.id]}
                  alt={previewReceipt.file_name}
                  className="max-h-[70vh] max-w-full object-contain rounded-lg"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUBMIT CONFIRMATION */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 w-full max-w-lg">
            <h2 className="text-xl font-bold">Submit this claim for approval?</h2>
            <p className="text-sm text-gray-500 mt-2">
              <span className="font-semibold text-gray-800">{claim.title}</span> ·{" "}
              {formatMoney(claim.total_amount, currency)} across {lines.length}{" "}
              {lines.length === 1 ? "line" : "lines"}.
            </p>
            <p className="text-sm text-gray-500 mt-3">
              Once submitted the claim locks — lines, amounts and receipts can no longer be
              changed unless an approver sends it back to you.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 mt-6">
              <button
                onClick={submitClaim}
                disabled={busyAction === "submit"}
                className={`${btnPrimaryCls} justify-center flex-1`}
              >
                {busyAction === "submit" ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Send size={16} />
                )}
                Submit for Approval
              </button>
              <button
                onClick={() => setShowSubmitConfirm(false)}
                disabled={busyAction === "submit"}
                className={`${btnGhostCls} justify-center flex-1`}
              >
                Keep editing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECT */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 w-full max-w-lg">
            <h2 className="text-xl font-bold text-[#9b2423]">Send this claim back</h2>
            <p className="text-sm text-gray-500 mt-2">
              The claim returns to the claimant as a draft. Say what needs fixing — they only see
              this reason.
            </p>

            <textarea
              value={rejectReason}
              onChange={(e) => {
                setRejectReason(e.target.value);
                if (rejectError) setRejectError("");
              }}
              placeholder="e.g., The 12 Aug taxi receipt is illegible — please re-upload a clearer photo."
              autoFocus
              className={`mt-4 w-full h-32 border rounded-xl px-4 py-3 text-sm bg-gray-50 outline-none focus:ring-2 focus:ring-[#9b2423]/40 ${
                rejectError ? "border-red-300 bg-red-50/60" : "border-gray-200"
              }`}
            />
            <FieldError>{rejectError}</FieldError>

            <div className="flex flex-col sm:flex-row gap-3 mt-5">
              <button
                onClick={rejectClaim}
                disabled={busyAction === "reject"}
                className={`${btnPrimaryCls} justify-center flex-1`}
              >
                {busyAction === "reject" ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <XCircle size={16} />
                )}
                Send Back
              </button>
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectReason("");
                  setRejectError("");
                }}
                disabled={busyAction === "reject"}
                className={`${btnGhostCls} justify-center flex-1`}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
