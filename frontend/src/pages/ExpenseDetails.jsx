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
  Clock,
  Users,
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
  "Partially Approved": "bg-sky-50 text-sky-700 border-sky-200",
  Approved: "bg-blue-50 text-blue-700 border-blue-200",
  Rejected: "bg-red-50 text-red-700 border-red-200",
  Paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

// Approval happens per line, so the claim status is only a rollup of the lines
// beneath it — the row's own chip is the authoritative state.
const lineChip = {
  Approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Rejected: "bg-red-50 text-red-700 border-red-200",
  Pending: "bg-gray-100 text-gray-600 border-gray-200",
};

const rollupTone = {
  Draft: { wrap: "bg-white border-gray-200 shadow-sm", title: "text-gray-800", body: "text-gray-500" },
  Submitted: { wrap: "bg-amber-50 border-amber-200", title: "text-amber-800", body: "text-amber-700" },
  "Partially Approved": {
    wrap: "bg-sky-50 border-sky-200",
    title: "text-sky-900",
    body: "text-sky-700",
  },
  Approved: {
    wrap: "bg-emerald-50 border-emerald-200",
    title: "text-emerald-800",
    body: "text-emerald-700",
  },
  Rejected: { wrap: "bg-red-50 border-red-200", title: "text-red-800", body: "text-red-700" },
  Paid: {
    wrap: "bg-emerald-50 border-emerald-200",
    title: "text-emerald-800",
    body: "text-emerald-700",
  },
};

const rollupCopy = {
  Draft: {
    title: "Draft — not submitted yet",
    body: "Every line item needs a receipt before this claim can be submitted.",
  },
  Submitted: {
    title: "Awaiting approval",
    body: "The approver signs off each line on its own, so lines can be decided separately.",
  },
  "Partially Approved": {
    title: "Partly decided",
    body: "Some lines have been decided; the rest are still with the approver.",
  },
  Approved: {
    title: "Every line approved",
    body: "Each approved line carries its own approval record and printable document.",
  },
  Rejected: {
    title: "Every line rejected",
    body: "No line on this claim was approved — the reasons are on the rows below.",
  },
  Paid: {
    title: "Paid",
    body: "Reimbursement has been recorded against this claim.",
  },
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
  needsReceipt,
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

      {missing ? (
        <p className="text-xs text-red-600 mt-1.5 font-medium">
          This line needs a receipt before the claim can be submitted
        </p>
      ) : needsReceipt ? (
        <p className="inline-flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-1.5">
          <AlertTriangle size={13} className="flex-shrink-0 mt-px" />
          Needs a receipt — an approver cannot approve this line without one
        </p>
      ) : null}
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
  note,
}) {
  const set = (key) => (e) => onChange({ ...value, [key]: e.target.value });

  return (
    <div className="bg-gray-50/70 border-t px-4 py-4">
      {note && <p className="text-xs text-gray-500 mb-3">{note}</p>}
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
  const [rejectLineId, setRejectLineId] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState("");
  const [showApproveAllConfirm, setShowApproveAllConfirm] = useState(false);
  // Lines the batch approval left behind. This is a partial success, not an
  // error, so it lives apart from the error banner.
  const [skippedLines, setSkippedLines] = useState([]);
  const [busyAction, setBusyAction] = useState("");
  // Per-line work in flight, held as "verb:lineId" — a single key is enough
  // because every row's controls are disabled while any one of them is running.
  const [lineBusy, setLineBusy] = useState("");

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

  // The server decides who may do what and answers with these flags; mirroring
  // the rules here would only be a second place for them to drift. A claim is
  // never closed — can_add_lines stays true for the claimant whatever the
  // status, and what freezes is an individual line once it has been decided
  // (line.can_edit). can_edit here is claim ownership and governs the header.
  const editable = isNew || claim?.can_edit === true;
  const canAddLines = !isNew && claim?.can_add_lines === true;
  const canDeleteClaim = !isNew && claim?.can_delete === true;
  const isDraft = !isNew && claim?.status === "Draft";
  // The whole team may work on a claim, but the money still goes to the person
  // who opened it, so a viewer who is not them has to be told whose it is.
  const isClaimant = isNew || (Boolean(user?.id) && claim?.claimant_id === user.id);
  // can_approve answers "may this viewer decide lines on this claim" — the
  // per-line gate is the line's own approval_status.
  const canApprove = claim?.can_approve === true;
  const sentBack =
    Boolean(claim?.rejection_reason) &&
    (claim?.status === "Draft" || claim?.status === "Rejected");

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

  const rollup = useMemo(() => {
    const counts = { Approved: 0, Rejected: 0, Pending: 0 };
    let approvedTotal = 0;
    lines.forEach((line) => {
      const state = line.approval_status || "Pending";
      counts[state] = (counts[state] || 0) + 1;
      if (state === "Approved")
        approvedTotal += (Number(line.amount) || 0) + (Number(line.tax_amount) || 0);
    });
    return { ...counts, approvedTotal };
  }, [lines]);

  // What "Approve all" would actually take: a pending line that has a receipt.
  // approvable_count is the server's own count and is what the button says; the
  // amount is totalled from the same predicate so the confirmation describes one
  // consistent set of lines.
  const approvableLines = useMemo(
    () =>
      lines.filter(
        (line) =>
          (line.approval_status || "Pending") === "Pending" &&
          (line.has_receipt ?? (receiptsByLine[line.id] || []).length > 0)
      ),
    [lines, receiptsByLine]
  );

  const approvableCount = claim?.approvable_count ?? approvableLines.length;

  const approvableTotal = useMemo(
    () =>
      approvableLines.reduce(
        (sum, line) => sum + (Number(line.amount) || 0) + (Number(line.tax_amount) || 0),
        0
      ),
    [approvableLines]
  );

  const rejectingLine = useMemo(
    () => lines.find((line) => line.id === rejectLineId) || null,
    [lines, rejectLineId]
  );

  // ---------------------------------------------------------------- header

  const validateHeader = () => {
    const errs = {};
    if (!form.title.trim()) errs.title = "A title is required";
    return errs;
  };

  const saveHeader = async () => {
    const errs = validateHeader();
    setHeaderErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    setError("");
    setNotice("");
    const currencyChanged = !isNew && Boolean(claim?.currency) && form.currency !== claim.currency;
    const body = {
      title: form.title.trim(),
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
      const message = err.response?.data?.message;
      // The currency is refused once any line has been decided. That reason
      // belongs against the field that caused it, not in the page banner.
      if (message && err.response?.status === 400 && (currencyChanged || /currenc/i.test(message))) {
        setHeaderErrors({ currency: message });
      } else {
        setError(message || "Failed to save the expense claim");
      }
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
      const res = await api.post(`/expenses/${id}/lines`, linePayload(newLine));
      setNewLine(EMPTY_LINE);
      setNewLineErrors({});
      // Refetch rather than patch state locally: total_amount is recalculated
      // server-side and that figure is the authoritative one. A line added to an
      // already-submitted claim comes back with `claim` attached because the
      // rollup status may have moved back to Partially Approved.
      await fetchClaim({ syncForm: false });
      if (res.data?.claim) setNotice("Line added — it goes to the approvers on its own");
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
    setSkippedLines([]);
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

  // Deciding one line moves the claim's rollup status and can change what the
  // server will allow on the others, so the whole claim is refetched rather than
  // patching the one line back into state.
  const approveLine = async (lineId) => {
    setLineBusy(`approve:${lineId}`);
    setError("");
    setNotice("");
    setSkippedLines([]);
    setSignatureRequired(false);
    try {
      await api.post(`/expenses/${id}/lines/${lineId}/approve`);
      await fetchClaim({ syncForm: false });
      setNotice("Line approved");
    } catch (err) {
      const data = err.response?.data;
      if (data?.code === "SIGNATURE_REQUIRED") setSignatureRequired(true);
      setError(data?.message || "Failed to approve that line");
    } finally {
      setLineBusy("");
    }
  };

  // A batch approval can come back part done: the server skips a line it cannot
  // approve rather than failing the whole run, so the skipped list has to be
  // shown as plainly as the success.
  const approveAll = async () => {
    setBusyAction("approve-all");
    setError("");
    setNotice("");
    setSkippedLines([]);
    setSignatureRequired(false);
    try {
      const res = await api.post(`/expenses/${id}/approve-all`);
      const data = res.data || {};
      setShowApproveAllConfirm(false);
      await fetchClaim({ syncForm: false });
      const count = data.approved_count ?? 0;
      setNotice(`${count} ${count === 1 ? "line" : "lines"} approved`);
      setSkippedLines(data.skipped || []);
    } catch (err) {
      const data = err.response?.data;
      if (data?.code === "SIGNATURE_REQUIRED") setSignatureRequired(true);
      setError(data?.message || "Failed to approve the pending lines");
      setShowApproveAllConfirm(false);
    } finally {
      setBusyAction("");
    }
  };

  const openRejectLine = (line) => {
    setRejectLineId(line.id);
    setRejectReason("");
    setRejectError("");
    setSignatureRequired(false);
  };

  const closeRejectLine = () => {
    setRejectLineId("");
    setRejectReason("");
    setRejectError("");
  };

  const rejectLine = async () => {
    const reason = rejectReason.trim();
    if (!reason) {
      setRejectError("A reason is required so the claimant knows what to fix");
      return;
    }
    const lineId = rejectLineId;
    setLineBusy(`reject:${lineId}`);
    setRejectError("");
    setError("");
    setNotice("");
    setSkippedLines([]);
    setSignatureRequired(false);
    try {
      await api.post(`/expenses/${id}/lines/${lineId}/reject`, { reason });
      closeRejectLine();
      await fetchClaim({ syncForm: false });
      setNotice("Line rejected");
    } catch (err) {
      const data = err.response?.data;
      if (data?.code === "SIGNATURE_REQUIRED") setSignatureRequired(true);
      setRejectError(data?.message || "Failed to reject that line");
    } finally {
      setLineBusy("");
    }
  };

  const downloadLinePdf = async (line, fallbackNo) => {
    setLineBusy(`pdf:${line.id}`);
    setError("");
    try {
      const res = await api.get(`/expenses/${id}/lines/${line.id}/pdf`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data);
      const link = document.createElement("a");
      link.href = url;
      const lineNo = String(line.line_no ?? fallbackNo).padStart(2, "0");
      link.download = `${claim.claim_number || "expense-claim"}-${lineNo}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      // An error body arrives as a Blob under responseType: "blob", so there is
      // no message to read out of it.
      setError("Failed to download the document for that line");
    } finally {
      setLineBusy("");
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
  const tone = rollupTone[claim?.status] || rollupTone.Draft;
  const copy = rollupCopy[claim?.status] || rollupCopy.Draft;

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
                "Name the claim first — expense lines are added once it is created"
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
                and then try again.
              </>
            )}
          </div>
        )}
        {notice && (
          <div className="bg-emerald-50 text-emerald-700 text-sm px-4 py-3 rounded-xl border border-emerald-200 mb-5">
            {notice}
          </div>
        )}

        {/* Part of a batch approval went through and part did not — say which,
            so a short count is not read as a failure */}
        {skippedLines.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-5">
            <p className="text-sm font-semibold text-amber-800">
              {skippedLines.length} {skippedLines.length === 1 ? "line was" : "lines were"} left
              pending
            </p>
            <ul className="mt-1.5 space-y-1">
              {skippedLines.map((skipped) => (
                <li key={skipped.line_id} className="text-sm text-amber-700">
                  Line {skipped.line_no ?? "—"} — {skipped.reason}
                </li>
              ))}
            </ul>
            <p className="text-xs text-amber-700/80 mt-2">
              Every other pending line was approved. Once the receipt is attached, these can be
              approved on their own.
            </p>
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

        {/* Whose claim this is. A teammate can add lines to it, but the
            reimbursement is still paid to the person who raised it. */}
        {!isNew && !isClaimant && (
          <div className="flex items-start gap-2.5 bg-white border border-gray-200 rounded-2xl px-4 py-3 mb-5">
            <Users size={16} className="text-gray-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-gray-600">
              Raised by{" "}
              <span className="font-semibold text-gray-800">{claim.claimant_name || "—"}</span>.
              Reimbursement goes to them — anything you add here is claimed in their name.
            </p>
          </div>
        )}

        {/* Approval rollup — the claim has no single decision of its own, so this
            only totals up what the individual lines say */}
        {!isNew && (
          <div className={`rounded-2xl border p-5 mb-6 ${tone.wrap}`}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-3">
                {claim.status === "Approved" || claim.status === "Paid" ? (
                  <BadgeCheck size={20} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                ) : claim.status === "Rejected" ? (
                  <XCircle size={19} className="text-red-600 flex-shrink-0 mt-0.5" />
                ) : claim.status === "Draft" ? (
                  <Pencil size={18} className="text-gray-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <Send size={19} className="text-amber-600 flex-shrink-0 mt-0.5" />
                )}

                <div>
                  <p className={`font-bold ${tone.title}`}>{copy.title}</p>
                  <p className={`text-sm mt-0.5 ${tone.body}`}>{copy.body}</p>
                  {claim.status !== "Draft" && claim.submitted_at && (
                    <p className={`text-xs mt-1 opacity-80 ${tone.body}`}>
                      Submitted {fmtDateTime(claim.submitted_at)}
                    </p>
                  )}

                  {lines.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 mt-4">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">
                        <CheckCircle2 size={12} /> {rollup.Approved} approved
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-red-50 text-red-700 border-red-200">
                        <XCircle size={12} /> {rollup.Rejected} rejected
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-white text-gray-600 border-gray-200">
                        <Clock size={12} /> {rollup.Pending} pending
                      </span>
                      <span className={`text-[11px] ${tone.body} opacity-80`}>
                        of {lines.length} {lines.length === 1 ? "line" : "lines"}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col items-stretch sm:items-end gap-3">
                <div className="text-left sm:text-right">
                  <p className="text-[11px] uppercase tracking-wide text-gray-400">
                    Approved total
                  </p>
                  <p className="text-xl font-bold text-emerald-700">
                    {formatMoney(rollup.approvedTotal, currency)}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {/* Submit is only the first hand-off — the server refuses it on
                      anything but a Draft, and later lines reach the approvers
                      the moment they are added. */}
                  {isDraft && editable && (
                    <button
                      onClick={() => setShowSubmitConfirm(true)}
                      disabled={Boolean(busyAction) || lines.length === 0}
                      className={btnPrimaryCls}
                      title={lines.length === 0 ? "Add at least one expense line first" : undefined}
                    >
                      <Send size={16} /> Submit for Approval
                    </button>
                  )}

                  {/* A shortcut over the per-line buttons, never a replacement:
                      the server approves each line separately either way. */}
                  {canApprove && approvableCount > 0 && (
                    <button
                      onClick={() => setShowApproveAllConfirm(true)}
                      disabled={Boolean(busyAction) || Boolean(lineBusy)}
                      className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold text-sm px-5 py-3 rounded-xl transition"
                    >
                      {busyAction === "approve-all" ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <CheckCircle2 size={16} />
                      )}
                      Approve all ({approvableCount})
                    </button>
                  )}

                  {rollup.Approved > 0 && (
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
                      Whole claim PDF
                    </button>
                  )}
                </div>
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
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Currency</label>
              <select
                value={form.currency}
                onChange={(e) => {
                  setForm((f) => ({ ...f, currency: e.target.value }));
                  if (headerErrors.currency)
                    setHeaderErrors((prev) => ({ ...prev, currency: "" }));
                }}
                disabled={!editable || saving}
                className={`${inputCls} ${headerErrors.currency ? errorCls : ""}`}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <FieldError>{headerErrors.currency}</FieldError>
            </div>
          </div>

          {(editable || canDeleteClaim) && (
            <div className="flex flex-wrap gap-3 mt-6">
              {editable && (
                <>
                  <button onClick={saveHeader} disabled={saving} className={btnPrimaryCls}>
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    {isNew ? "Create Claim" : "Save Changes"}
                  </button>
                  <button
                    onClick={() => navigate("/expenses")}
                    disabled={saving}
                    className={btnGhostCls}
                  >
                    Cancel
                  </button>
                </>
              )}
              {canDeleteClaim && (
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
                  {canAddLines && (
                    <p className="text-sm text-gray-400 mt-1">
                      Add the first line below to build up this claim
                    </p>
                  )}
                </div>
              )}

              {lines.map((line, index) => {
                const lineState = line.approval_status || "Pending";
                // Editing, deleting and receipt changes are the LINE's own
                // right, not the claim's: a decided line is frozen even while
                // the claim itself keeps taking new ones.
                const lineEditable = line.can_edit === true;
                const missingReceipt = missingLineIds.includes(line.id);
                const hasReceipt = line.has_receipt ?? (receiptsByLine[line.id] || []).length > 0;
                // Approving a line with no receipt is refused server-side
                // (RECEIPT_REQUIRED), so say so before it reaches an approver.
                const needsReceipt = lineState === "Pending" && !hasReceipt;

                return editingLineId === line.id ? (
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
                    className={`border-t border-l-4 transition ${
                      missingReceipt
                        ? "bg-red-50/70 border-l-red-400"
                        : lineState === "Approved"
                        ? "border-l-emerald-400"
                        : lineState === "Rejected"
                        ? "bg-red-50/30 border-l-red-300"
                        : needsReceipt
                        ? "bg-amber-50/40 border-l-amber-400"
                        : "border-l-transparent hover:bg-gray-50/60"
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
                        {lineEditable && (
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

                    {/* The line's own decision — this is the headline fact on the row */}
                    <div className="px-4 pb-3">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <span
                          className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
                            lineChip[lineState] || lineChip.Pending
                          }`}
                        >
                          {lineState === "Approved" ? (
                            <CheckCircle2 size={12} />
                          ) : lineState === "Rejected" ? (
                            <XCircle size={12} />
                          ) : (
                            <Clock size={12} />
                          )}
                          {lineState === "Pending" ? "Pending approval" : lineState}
                        </span>

                        {lineState === "Approved" && (
                          <span className="text-xs text-gray-500">
                            {line.approved_by_name || "—"}
                            {line.approved_by_role ? ` · ${line.approved_by_role}` : ""} ·{" "}
                            {fmtDateTime(line.approved_at)}
                          </span>
                        )}

                        {lineState === "Approved" && line.verify_code && (
                          <span
                            title="Verification code for this line"
                            className="text-[11px] font-mono text-gray-500 bg-gray-50 border border-gray-200 rounded px-2 py-0.5 break-all"
                          >
                            {line.verify_code}
                          </span>
                        )}

                        <div className="flex flex-wrap gap-2 sm:ml-auto">
                          {canApprove && lineState === "Pending" && (
                            <>
                              <button
                                type="button"
                                onClick={() => approveLine(line.id)}
                                disabled={Boolean(lineBusy)}
                                className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold text-xs px-3 py-2 rounded-xl transition"
                              >
                                {lineBusy === `approve:${line.id}` ? (
                                  <Loader2 size={13} className="animate-spin" />
                                ) : (
                                  <CheckCircle2 size={13} />
                                )}
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => openRejectLine(line)}
                                disabled={Boolean(lineBusy)}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 bg-white text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                              >
                                <XCircle size={13} /> Reject
                              </button>
                            </>
                          )}

                          {lineState === "Approved" && (
                            <button
                              type="button"
                              onClick={() => downloadLinePdf(line, index + 1)}
                              disabled={Boolean(lineBusy)}
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                            >
                              {lineBusy === `pdf:${line.id}` ? (
                                <Loader2 size={13} className="animate-spin" />
                              ) : (
                                <Download size={13} />
                              )}
                              Download
                            </button>
                          )}
                        </div>
                      </div>

                      {lineState === "Rejected" && line.rejection_reason && (
                        <p className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5 whitespace-pre-wrap">
                          {line.rejection_reason}
                        </p>
                      )}
                    </div>

                    <div className="px-4 pb-3">
                      <ReceiptStrip
                        label="Receipts"
                        receipts={receiptsByLine[line.id] || []}
                        urls={receiptUrls}
                        editable={lineEditable}
                        uploading={uploadingKey === line.id}
                        busyId={receiptBusyId}
                        feedback={receiptFeedback[line.id]}
                        missing={missingReceipt}
                        needsReceipt={needsReceipt}
                        onPick={(file) => uploadReceipt(line.id, file)}
                        onOpen={openPreview}
                        onDelete={deleteReceipt}
                      />
                    </div>
                  </div>
                );
              })}

              {/* A claim never closes: the claimant may add another line at any
                  status, so this form is gated on can_add_lines alone. */}
              {canAddLines && editingLineId === null && (
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
                  note={
                    isDraft
                      ? null
                      : "This claim has already been submitted — a new line goes to the approvers on its own, and the lines already decided are untouched."
                  }
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
              Each line is then decided on its own, and a line locks the moment it is approved or
              rejected. The claim itself stays open — you can keep adding lines to it afterwards.
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

      {/* APPROVE EVERY PENDING LINE THAT CAN BE APPROVED */}
      {showApproveAllConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 w-full max-w-lg">
            <h2 className="text-xl font-bold">
              Approve {approvableCount} {approvableCount === 1 ? "line" : "lines"} at once?
            </h2>
            <p className="text-sm text-gray-500 mt-2">
              <span className="font-semibold text-gray-800">{claim.title}</span> ·{" "}
              {formatMoney(approvableTotal, currency)} across {approvableCount} pending{" "}
              {approvableCount === 1 ? "line" : "lines"} with a receipt attached.
            </p>
            <p className="text-sm text-gray-500 mt-3">
              Each line is still decided on its own — its own signature, verification code and
              document. An approved line then locks, so this cannot be undone here.
            </p>

            {rollup.Pending > approvableCount && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5 mt-4">
                {rollup.Pending - approvableCount} other pending{" "}
                {rollup.Pending - approvableCount === 1 ? "line has" : "lines have"} no receipt
                and will not be touched.
              </p>
            )}

            <div className="flex flex-col sm:flex-row gap-3 mt-6">
              <button
                onClick={approveAll}
                disabled={busyAction === "approve-all"}
                className="inline-flex items-center justify-center flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold text-sm px-5 py-3 rounded-xl transition"
              >
                {busyAction === "approve-all" ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={16} />
                )}
                Approve all ({approvableCount})
              </button>
              <button
                onClick={() => setShowApproveAllConfirm(false)}
                disabled={busyAction === "approve-all"}
                className={`${btnGhostCls} justify-center flex-1`}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECT A LINE */}
      {rejectingLine && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 w-full max-w-lg">
            <h2 className="text-xl font-bold text-[#9b2423]">Reject this line</h2>
            <p className="text-sm text-gray-500 mt-2">
              <span className="font-semibold text-gray-800">{rejectingLine.category}</span>
              {rejectingLine.description ? ` · ${rejectingLine.description}` : ""} ·{" "}
              {formatMoney(
                (Number(rejectingLine.amount) || 0) + (Number(rejectingLine.tax_amount) || 0),
                currency
              )}{" "}
              on {fmtDate(rejectingLine.expense_date)}.
            </p>
            <p className="text-sm text-gray-500 mt-3">
              Only this line is rejected — the other lines on the claim are unaffected. Say what
              is wrong with it; the claimant only sees this reason.
            </p>

            <textarea
              value={rejectReason}
              onChange={(e) => {
                setRejectReason(e.target.value);
                if (rejectError) setRejectError("");
              }}
              placeholder="e.g., This taxi receipt is illegible — please re-upload a clearer photo."
              autoFocus
              className={`mt-4 w-full h-32 border rounded-xl px-4 py-3 text-sm bg-gray-50 outline-none focus:ring-2 focus:ring-[#9b2423]/40 ${
                rejectError ? "border-red-300 bg-red-50/60" : "border-gray-200"
              }`}
            />
            {rejectError && (
              <p className="text-xs text-red-600 mt-1.5">
                {rejectError}
                {signatureRequired && (
                  <>
                    {" "}
                    <Link to="/settings/signature" className="font-semibold underline">
                      Upload your signature
                    </Link>{" "}
                    and then try again.
                  </>
                )}
              </p>
            )}

            <div className="flex flex-col sm:flex-row gap-3 mt-5">
              <button
                onClick={rejectLine}
                disabled={Boolean(lineBusy)}
                className={`${btnPrimaryCls} justify-center flex-1`}
              >
                {lineBusy === `reject:${rejectingLine.id}` ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <XCircle size={16} />
                )}
                Reject Line
              </button>
              <button
                onClick={closeRejectLine}
                disabled={Boolean(lineBusy)}
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
