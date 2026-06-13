import { useMemo, useState } from "react";

const MATCH_COLORS = {
  EXACT:   { color: "#10B981", bg: "rgba(16,185,129,0.1)"  },
  PHRASE:  { color: "#A78BFA", bg: "rgba(167,139,250,0.1)" },
  BROAD:   { color: "#F59E0B", bg: "rgba(245,158,11,0.1)"  },
  UNKNOWN: { color: "#555",    bg: "rgba(80,80,80,0.1)"    },
};

export default function KeywordWasteAnalyzer({ keywords = [] }) {
  const [sortBy, setSortBy] = useState("cost");
  const [showTop, setShowTop] = useState(15);

  const wasteKeywords = useMemo(() => {
    const map = new Map();
    keywords.forEach((k) => {
      const key = `${k.keyword}||${k.match_type}||${k.campaign}`;
      if (!map.has(key)) map.set(key, { ...k, cost: 0, clicks: 0, impressions: 0, conversions: 0 });
      const agg = map.get(key);
      agg.cost        += Number(k.cost || 0);
      agg.clicks      += Number(k.clicks || 0);
      agg.impressions += Number(k.impressions || 0);
      agg.conversions += Number(k.conversions || 0);
    });

    return Array.from(map.values())
      .filter((k) => k.cost > 0 && k.conversions === 0)
      .map((k) => ({
        ...k,
        ctr: k.impressions > 0 ? (k.clicks / k.impressions) * 100 : 0,
      }))
      .sort((a, b) => Number(b[sortBy]) - Number(a[sortBy]))
      .slice(0, showTop);
  }, [keywords, sortBy, showTop]);

  const totalWaste = useMemo(() => {
    const map = new Map();
    keywords.forEach((k) => {
      const key = `${k.keyword}||${k.match_type}||${k.campaign}`;
      if (!map.has(key)) map.set(key, { cost: 0, conversions: 0 });
      const agg = map.get(key);
      agg.cost        += Number(k.cost || 0);
      agg.conversions += Number(k.conversions || 0);
    });
    return Array.from(map.values())
      .filter((k) => k.cost > 0 && k.conversions === 0)
      .reduce((s, k) => s + k.cost, 0);
  }, [keywords]);

  return (
    <div
      className="rounded-2xl p-5 border"
      style={{ background: "#111111", borderColor: "#1E1E1E" }}
    >
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: "#9B2423" }}>
              Keyword Waste Analyzer
            </span>
            <span
              className="text-[9px] font-black px-2 py-0.5 rounded-full"
              style={{ background: "rgba(155,36,35,0.15)", color: "#9B2423", border: "1px solid rgba(155,36,35,0.3)" }}
            >
              ⚠ {wasteKeywords.length} keywords
            </span>
          </div>
          <p className="text-[10px] mt-0.5" style={{ color: "#444" }}>
            Keywords with spend but zero conversions · Total waste:{" "}
            <span style={{ color: "#9B2423", fontWeight: 700 }}>₹{totalWaste.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px]" style={{ color: "#555" }}>Sort by:</span>
          {[
            { key: "cost",   label: "Spend"   },
            { key: "clicks", label: "Clicks"  },
            { key: "ctr",    label: "CTR"     },
          ].map((s) => (
            <button
              key={s.key}
              onClick={() => setSortBy(s.key)}
              className="text-[10px] font-semibold px-2.5 py-1 rounded-lg border transition-all"
              style={
                sortBy === s.key
                  ? { background: "#9B2423", color: "#F3ECE0", borderColor: "#9B2423" }
                  : { background: "transparent", color: "#555", borderColor: "#2A2A2A" }
              }
            >
              {s.label}
            </button>
          ))}
          <select
            value={showTop}
            onChange={(e) => setShowTop(Number(e.target.value))}
            className="text-[10px] rounded-lg px-2 py-1 outline-none border"
            style={{ background: "#1A1A1A", color: "#F3ECE0", borderColor: "#2A2A2A" }}
          >
            {[10, 15, 20, 30].map((n) => <option key={n} value={n}>Top {n}</option>)}
          </select>
        </div>
      </div>

      {wasteKeywords.length === 0 ? (
        <div
          className="rounded-xl p-6 text-center text-xs"
          style={{ background: "#0D0D0D", color: "#555", border: "1px solid #1A1A1A" }}
        >
          No wasted keyword spend detected in the selected period.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr style={{ borderBottom: "1px solid #1E1E1E" }}>
                {["#", "Keyword", "Match", "Campaign", "Clicks", "CTR", "Spend", "Action"].map((h) => (
                  <th
                    key={h}
                    className="text-left py-2 px-2 font-black uppercase tracking-widest"
                    style={{ color: "#555", fontSize: 9 }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {wasteKeywords.map((k, i) => {
                const mc = MATCH_COLORS[k.match_type?.toUpperCase()] || MATCH_COLORS.UNKNOWN;
                return (
                  <tr
                    key={i}
                    className="transition-colors"
                    style={{ borderBottom: "1px solid #141414" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "#0D0D0D"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  >
                    <td className="py-2 px-2" style={{ color: "#444" }}>{i + 1}</td>
                    <td className="py-2 px-2 font-semibold max-w-[160px]" style={{ color: "#F3ECE0" }}>
                      <span title={k.keyword}>
                        {k.keyword?.length > 22 ? `${k.keyword.slice(0, 22)}…` : k.keyword}
                      </span>
                    </td>
                    <td className="py-2 px-2">
                      <span
                        className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                        style={{ background: mc.bg, color: mc.color }}
                      >
                        {k.match_type}
                      </span>
                    </td>
                    <td className="py-2 px-2 max-w-[140px]" style={{ color: "#666" }}>
                      <span title={k.campaign}>
                        {k.campaign?.length > 18 ? `${k.campaign.slice(0, 18)}…` : k.campaign}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right" style={{ color: "#AAA" }}>
                      {Number(k.clicks).toLocaleString()}
                    </td>
                    <td className="py-2 px-2 text-right" style={{ color: "#A78BFA" }}>
                      {k.ctr.toFixed(2)}%
                    </td>
                    <td className="py-2 px-2 text-right font-bold" style={{ color: "#9B2423" }}>
                      ₹{Number(k.cost).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td className="py-2 px-2">
                      <span
                        className="text-[9px] font-bold px-2 py-0.5 rounded"
                        style={{ background: "rgba(155,36,35,0.15)", color: "#9B2423" }}
                      >
                        Pause / Negative
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
