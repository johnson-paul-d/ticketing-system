// The reviewer's score card for one task: the automatic parts worked out from
// the ticket's history (each one correctable), two star ratings, remarks, and
// the live total. mode "approve" also approves the completion request, so
// rating happens at the moment the work is accepted; mode "rate" only saves.
import { useEffect, useMemo, useState } from "react";
import { X, Loader2, CheckCircle2, Clock, RotateCcw, AlertTriangle, History, Timer, Undo2 } from "lucide-react";
import api from "../../services/api";
import { ScoreRing, StarPicker, GradePill, gradeOf, fmtScore, fmtDay } from "./ScoreBits";

// Same rules as the server (services/scorecard.js), for the live preview.
const onTimeScore = (late) => (late <= 0 ? 100 : late <= 2 ? 75 : late <= 5 ? 50 : 0);
const firstPassScore = (n) => (n === 0 ? 100 : n === 1 ? 50 : 0);
const withinTimeScore = (spent, allotted) => {
  const r = spent / allotted;
  return r <= 1 ? 100 : r <= 1.25 ? 75 : r <= 1.5 ? 50 : 0;
};
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const today = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);

const hours = (min) => (min ? Math.round((min / 60) * 100) / 100 : "");
const fmtHours = (min) => {
  if (!min) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return [h ? `${h}h` : "", m ? `${m}m` : ""].filter(Boolean).join(" ");
};

// The corrections the reviewer can make, and where each one's value lives.
const FIELDS = [
  { key: "submittedOn", save: "submitted_on" },
  { key: "corrections", save: "corrections" },
  { key: "spent", save: "spent_minutes" },
  { key: "allotted", save: "allotted_minutes" },
];

function Edited({ shown, was, onReset }) {
  if (!shown) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-sky-700 bg-sky-50 rounded-full px-2 py-0.5">
      corrected · was {was}
      <button type="button" onClick={onReset} className="hover:text-sky-900" title="Use the automatic value">
        <Undo2 size={11} />
      </button>
    </span>
  );
}

const inputCls =
  "bg-[#faf6f0] border border-transparent focus:border-[#9b2423]/30 rounded-lg px-2 py-1 text-xs outline-none text-gray-800 disabled:opacity-50";

export default function RatingDialog({ ticketId, mode = "rate", onClose, onDone }) {
  const [card, setCard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [accuracy, setAccuracy] = useState(null);
  const [quality, setQuality] = useState(null);
  const [remarks, setRemarks] = useState("");
  const [excluded, setExcluded] = useState(null);
  // null = the automatic value; anything else is the reviewer's correction
  const [fix, setFix] = useState({ submittedOn: null, corrections: null, spent: null, allotted: null });
  const [initial, setInitial] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  // The automatic parts need nothing from the reviewer; their correction
  // boxes open on "Correct", or by themselves once a value is corrected.
  const [correcting, setCorrecting] = useState({});
  const showFix = (r) => correcting[r.key] || r.fields.some((k) => fix[k] != null);

  useEffect(() => {
    api
      .get(`/scorecard/tasks/${ticketId}`)
      .then((r) => {
        const t = r.data.task;
        const f = Object.fromEntries(FIELDS.map(({ key }) => [key, t.edited?.[key] ? t[key] : null]));
        setCard(r.data);
        setAccuracy(t.stars.accuracy);
        setQuality(t.stars.quality);
        setRemarks(t.remarks || "");
        setExcluded(t.excluded);
        setFix(f);
        setInitial({ accuracy: t.stars.accuracy, quality: t.stars.quality, remarks: t.remarks || "", excluded: t.excluded, fix: f });
      })
      // Not the reviewer's to rate (their own work, another team): approving
      // still works, there is just no score card.
      .catch(() => setMissing(true))
      .finally(() => setLoading(false));
  }, [ticketId]);

  const t = card?.task;
  const W = card?.weights;
  const value = (k) => (fix[k] != null ? fix[k] : t?.auto?.[k]);
  const setField = (k, v) => setFix((f) => ({ ...f, [k]: v === "" || v == null || v === t.auto[k] ? null : v }));

  const preview = useMemo(() => {
    if (!t) return null;
    const submittedOn = value("submittedOn");
    const late = submittedOn && t.finalDue ? daysBetween(t.finalDue, submittedOn) : null;
    const spent = value("spent");
    const allotted = value("allotted");
    const parts = {
      onTime: late == null ? null : onTimeScore(late),
      firstPass: t.parts.firstPass == null ? null : firstPassScore(value("corrections")),
      accuracy: accuracy ? (accuracy / 5) * 100 : null,
      quality: quality ? (quality / 5) * 100 : null,
      // no time allowed or none logged cannot be over time: full marks
      withinTime: allotted > 0 && spent > 0 ? withinTimeScore(spent, allotted) : 100,
    };
    const contributions = Object.fromEntries(
      Object.entries(parts).map(([k, v]) => [k, v == null ? null : Math.round(((v * W[k]) / 100) * 10) / 10])
    );
    const complete = Object.values(parts).every((v) => v != null);
    const score = complete ? Math.round(Object.values(contributions).reduce((s, v) => s + v, 0) * 10) / 10 : null;
    return { parts, contributions, score, late };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, W, accuracy, quality, fix]);

  const changed =
    initial &&
    (accuracy !== initial.accuracy ||
      quality !== initial.quality ||
      remarks !== initial.remarks ||
      excluded !== initial.excluded ||
      FIELDS.some(({ key }) => fix[key] !== initial.fix[key]));

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      if (mode === "approve") await api.put(`/tickets/${ticketId}/approve`);
      if (t && changed && !card.setupNeeded) {
        await api.put(`/scorecard/tasks/${ticketId}`, {
          accuracy,
          quality,
          remarks,
          // Untouched switch keeps whatever was there, "automatic" included.
          excluded: excluded === t.excluded ? t.excludedChoice : excluded,
          ...Object.fromEntries(FIELDS.map(({ key, save }) => [save, fix[key]])),
        });
      }
      onDone?.();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || "Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const locked = card?.setupNeeded || excluded || card?.task?.rateable === false;
  const lateText = () => {
    if (!t.finalDue) return "No due date set";
    if (preview.late == null) return "Not submitted yet";
    return preview.late <= 0 ? `On time · due ${fmtDay(t.finalDue)}` : `${preview.late} day${preview.late > 1 ? "s" : ""} late · due ${fmtDay(t.finalDue)}`;
  };

  const rows = t
    ? [
        {
          key: "onTime",
          label: "On time",
          fields: ["submittedOn"],
          icon: Clock,
          detail: lateText(),
          edit: (
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-xs text-gray-500">Completed on</label>
              <input
                type="date"
                max={today()}
                value={value("submittedOn") || ""}
                disabled={locked}
                onChange={(e) => setField("submittedOn", e.target.value)}
                className={inputCls}
              />
              <Edited shown={fix.submittedOn != null} was={fmtDay(t.auto.submittedOn)} onReset={() => setField("submittedOn", null)} />
            </div>
          ),
        },
        {
          key: "firstPass",
          label: "First-time pass",
          fields: ["corrections"],
          icon: RotateCcw,
          detail:
            t.scopeChanges > 0
              ? `${t.scopeChanges} scope change${t.scopeChanges > 1 ? "s" : ""} not counted`
              : "Accepted first time = 100 · sent back once = 50",
          edit: (
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-xs text-gray-500">Times sent back</label>
              <input
                type="number"
                min={0}
                max={20}
                value={value("corrections") ?? 0}
                disabled={locked || t.parts.firstPass == null}
                onChange={(e) => setField("corrections", e.target.value === "" ? null : Math.max(0, Math.round(Number(e.target.value))))}
                className={`${inputCls} w-16`}
              />
              <Edited shown={fix.corrections != null} was={t.auto.corrections} onReset={() => setField("corrections", null)} />
            </div>
          ),
        },
        { key: "accuracy", label: "Accuracy", detail: "Correct, error-free, follows the brief", stars: [accuracy, setAccuracy] },
        { key: "quality", label: "Quality", detail: "Finish, completeness, ready to use", stars: [quality, setQuality] },
        {
          key: "withinTime",
          label: "Within time allowed",
          fields: ["spent", "allotted"],
          icon: Timer,
          detail: !(value("allotted") > 0)
            ? "No time allowed set — full marks. Enter a time allowed to check it."
            : !(value("spent") > 0)
              ? "No time logged — full marks. Enter the time taken to check it."
              : "Within the time = 100 · up to ¼ over = 75 · up to ½ over = 50",
          edit: (
            <div className="flex items-center gap-x-4 gap-y-2 flex-wrap">
              <span className="flex items-center gap-2">
                <label className="text-xs text-gray-500">Time taken (h)</label>
                <input
                  type="number"
                  min={0}
                  step={0.25}
                  value={hours(value("spent"))}
                  disabled={locked}
                  onChange={(e) => setField("spent", e.target.value === "" ? null : Math.round(Number(e.target.value) * 60))}
                  className={`${inputCls} w-20`}
                />
                <Edited shown={fix.spent != null} was={fmtHours(t.auto.spent)} onReset={() => setField("spent", null)} />
              </span>
              <span className="flex items-center gap-2">
                <label className="text-xs text-gray-500">Time allowed (h)</label>
                <input
                  type="number"
                  min={0}
                  step={0.25}
                  value={hours(value("allotted"))}
                  disabled={locked}
                  onChange={(e) => setField("allotted", e.target.value === "" ? null : Math.round(Number(e.target.value) * 60))}
                  className={`${inputCls} w-20`}
                />
                <Edited shown={fix.allotted != null} was={fmtHours(t.auto.allotted)} onReset={() => setField("allotted", null)} />
              </span>
            </div>
          ),
        },
      ]
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/40 backdrop-blur-[2px]" onClick={onClose}>
      <div className="bg-[#fbf8f3] rounded-3xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="bg-gradient-to-br from-[#9b2423] to-[#6e1716] text-white px-6 py-5 rounded-t-3xl flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-widest text-white/60 font-semibold">
              {mode === "approve" ? "Approve & rate" : "Quality score"}
            </p>
            <h3 className="text-lg font-bold leading-snug mt-1 break-words">{t?.title || "Loading…"}</h3>
            {t && (
              <p className="text-xs text-white/70 mt-1">
                {t.person} · completed {fmtDay(value("submittedOn"))}
                {t.originalDue && t.originalDue !== t.finalDue ? ` · first due ${fmtDay(t.originalDue)}` : ""}
              </p>
            )}
          </div>
          {preview && !excluded && <ScoreRing score={preview.score} size={78} stroke={7} caption="score" dark />}
          <button onClick={onClose} className="text-white/70 hover:text-white p-1 -mr-2 -mt-1" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div className="py-16 flex justify-center text-gray-400 gap-2">
            <Loader2 className="animate-spin" size={18} /> Working out the score…
          </div>
        ) : missing ? (
          <div className="p-6 text-sm text-gray-600">
            {mode === "approve"
              ? "This ticket isn't on your scorecard (your own work, or another team's), so it is approved without a rating."
              : "This ticket isn't on your scorecard."}
          </div>
        ) : (
          <div className="p-5 sm:p-6 space-y-3">
            {!t.rateable && (
              <div className="flex gap-2 items-start text-xs bg-gray-50 text-gray-600 border border-gray-200 rounded-xl px-3 py-2">
                <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
                Raised {fmtDay(t.raisedOn)}, before rating began on {fmtDay(card.ratingFrom)}: shown for reference, not rated.
              </div>
            )}
            {card.setupNeeded && (
              <div className="flex gap-2 items-start text-xs bg-amber-50 text-amber-800 border border-amber-200 rounded-xl px-3 py-2">
                <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
                Ratings can't be saved until the scorecard database step has been run on the server.
              </div>
            )}

            {rows.map((r) => {
              const contrib = preview.contributions[r.key];
              return (
                <div key={r.key} className={`bg-white rounded-2xl p-4 shadow-sm ${excluded ? "opacity-50" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                        {r.label}
                        <span className="text-[10px] font-bold text-[#9b2423] bg-[#9b2423]/10 rounded-full px-2 py-0.5">{W[r.key]}%</span>
                        {!r.stars && <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">auto</span>}
                        {!r.stars && !showFix(r) && !locked && (
                          <button
                            type="button"
                            onClick={() => setCorrecting((c) => ({ ...c, [r.key]: true }))}
                            className="text-[10px] font-semibold text-sky-700 hover:underline"
                          >
                            Correct
                          </button>
                        )}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{r.detail}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-lg font-extrabold text-gray-900 leading-none">{fmtScore(preview.parts[r.key])}</p>
                      <p className="text-[10px] text-gray-400 mt-1">{contrib == null ? "pending" : `+${fmtScore(contrib)} pts`}</p>
                    </div>
                  </div>
                  {r.stars ? (
                    <div className="mt-2.5">
                      <StarPicker value={r.stars[0]} onChange={r.stars[1]} disabled={locked} />
                    </div>
                  ) : (
                    showFix(r) && <div className="mt-2.5">{r.edit}</div>
                  )}
                </div>
              );
            })}

            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              disabled={card.setupNeeded}
              rows={2}
              placeholder="Remarks (optional) — what was good, what to improve, why a value was corrected"
              className="w-full bg-white rounded-2xl shadow-sm px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#9b2423]/20 resize-none"
            />

            <div className="flex items-center justify-between gap-3 flex-wrap text-xs">
              <label className="flex items-center gap-2 text-gray-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={Boolean(excluded)}
                  disabled={card.setupNeeded}
                  onChange={(e) => setExcluded(e.target.checked)}
                  className="accent-[#9b2423]"
                />
                Not a deliverable — leave it off the scorecard
                {t.autoExcluded && t.excludedChoice == null && <span className="text-gray-400">(left out automatically)</span>}
              </label>
              {preview.score != null && !excluded && <GradePill grade={gradeOf(preview.score)} />}
            </div>

            {card.history.length > 0 && (
              <div className="text-xs text-gray-500">
                <button onClick={() => setShowHistory((v) => !v)} className="flex items-center gap-1 hover:text-gray-800">
                  <History size={13} /> Rated by {t.ratedBy} · {card.history.length} change{card.history.length > 1 ? "s" : ""}
                </button>
                {showHistory && (
                  <ul className="mt-2 space-y-1 bg-white rounded-xl p-3 shadow-sm">
                    {[...card.history].reverse().map((h, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-gray-400 w-28 flex-shrink-0">
                          {new Date(h.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <span>
                          {h.by}: accuracy {h.accuracy ?? "—"}, quality {h.quality ?? h.completeness ?? "—"}
                          {h.submitted_on ? `, completed ${fmtDay(h.submitted_on)}` : ""}
                          {h.corrections != null ? `, sent back ${h.corrections}` : ""}
                          {h.spent_minutes != null ? `, took ${fmtHours(h.spent_minutes)}` : ""}
                          {h.allotted_minutes != null ? `, allowed ${fmtHours(h.allotted_minutes)}` : ""}
                          {h.excluded === true ? ", left out" : h.excluded === false ? ", included" : ""}
                          {h.remarks ? ` · "${h.remarks}"` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {error && <p className="px-6 pb-2 text-sm text-red-600">{error}</p>}

        <div className="px-5 sm:px-6 pb-5 flex items-center justify-end gap-2 flex-wrap">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || loading || (mode === "rate" && (!changed || locked))}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-[#9b2423] hover:bg-[#7f1d1c] disabled:opacity-40 flex items-center gap-2 shadow-sm"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            {mode === "approve" ? (accuracy && quality ? "Approve & save rating" : "Approve, rate later") : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
