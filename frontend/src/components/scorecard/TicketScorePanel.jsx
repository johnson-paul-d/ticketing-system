// The quality score on a completed ticket's page — shown to the reviewer only.
import { useCallback, useEffect, useState } from "react";
import { Award, Star } from "lucide-react";
import api from "../../services/api";
import RatingDialog from "./RatingDialog";
import { ScoreRing, GradePill, StarsShown, fmtScore, useScorecardAccess } from "./ScoreBits";

export default function TicketScorePanel({ ticketId, status }) {
  const reviewer = useScorecardAccess();
  const [card, setCard] = useState(null);
  const [rating, setRating] = useState(false);
  const done = status === "Completed" || status === "Closed";

  const load = useCallback(() => {
    api
      .get(`/scorecard/tasks/${ticketId}`)
      .then((r) => setCard(r.data))
      .catch(() => setCard(null));
  }, [ticketId]);

  useEffect(() => {
    if (reviewer && done) load();
  }, [reviewer, done, load]);

  if (!reviewer || !done || !card) return null;
  const t = card.task;
  // Work completed before rating began is never rated.
  if (!t.rateable) return null;

  return (
    <div className="mt-8 bg-white rounded-3xl shadow-sm p-6 flex items-center gap-5 flex-wrap">
      <ScoreRing score={t.state === "final" ? t.score : null} size={84} stroke={8} caption={t.state === "final" ? "score" : t.state === "excluded" ? "left out" : "pending"} />
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Award size={18} className="text-[#9b2423]" /> Quality score
          {t.state === "final" && <GradePill grade={t.grade} />}
        </h2>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
          {card.parts.map(({ key, label }) => (
            <span key={key}>
              {label}: <b className="text-gray-800">{fmtScore(t.parts[key])}</b>
            </span>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1">Accuracy <StarsShown value={t.stars.accuracy} /></span>
          <span className="flex items-center gap-1">Quality <StarsShown value={t.stars.quality} /></span>
        </div>
        {t.state === "pending" && <p className="text-xs text-amber-700 mt-2">Pending: {t.pending.join(" · ")}</p>}
        {t.remarks && <p className="text-xs text-gray-600 italic mt-2">"{t.remarks}"</p>}
      </div>
      <button
        onClick={() => setRating(true)}
        className="px-4 py-2.5 rounded-2xl text-sm font-bold text-white bg-[#9b2423] hover:bg-[#7f1d1c] flex items-center gap-2"
      >
        <Star size={15} /> {t.stars.accuracy ? "Edit rating" : "Rate"}
      </button>
      {rating && <RatingDialog ticketId={ticketId} mode="rate" onClose={() => setRating(false)} onDone={load} />}
    </div>
  );
}
