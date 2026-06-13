import { useState } from "react";
import { RadialBarChart, RadialBar, ResponsiveContainer } from "recharts";

const SCORE_FACTORS = [
  {
    key: "ctr",
    label: "CTR Score",
    weight: "25%",
    color: "#9B2423",
    formula: "min(100, CTR / 5 × 100)",
    explanation:
      "Measures click-through rate against a 5% benchmark. A CTR of 5% or above earns full marks. Rewards ads that attract attention.",
  },
  {
    key: "cvr",
    label: "CVR Score",
    weight: "35%",
    color: "#F3ECE0",
    formula: "min(100, CVR / 10 × 100)",
    explanation:
      "Measures conversion rate against a 10% benchmark. Highest weight because turning clicks into conversions is the ultimate goal.",
  },
  {
    key: "cpa",
    label: "CPA Score",
    weight: "25%",
    color: "#9B2423",
    formula: "max(0, 100 − CPA / 1000 × 10)",
    explanation:
      "Penalises high cost-per-acquisition. Every ₹1,000 CPA costs 10 points. Keeps spend efficiency in check.",
  },
  {
    key: "waste",
    label: "Waste Score",
    weight: "15%",
    color: "#F3ECE0",
    formula: "max(0, 100 − (WasteSpend / TotalSpend × 100))",
    explanation:
      "Penalises budget wasted on zero-conversion campaigns. 100% waste = 0 points; 0% waste = 100 points.",
  },
];

function InfoTooltip({ content }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
        className="w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center border ml-1.5 align-middle"
        style={{ background: "#1A1A1A", borderColor: "#333", color: "#888" }}
        aria-label="Info"
      >
        i
      </button>
      {open && (
        <div
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 rounded-xl p-3 text-xs shadow-2xl"
          style={{
            background: "#111",
            border: "1px solid #2A2A2A",
            color: "#CCC",
            lineHeight: "1.5",
          }}
        >
          {content}
          <div
            className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent"
            style={{ borderTopColor: "#2A2A2A" }}
          />
        </div>
      )}
    </span>
  );
}

export default function ExecutiveScoreCard({
  score,
  efficiencyIndex = 0,
  activeRate = 0,
  wasteSpend = 0,
  ctr = 0,
  cvr = 0,
  cpa = 0,
  totalSpend = 0,
}) {
  const [showBreakdown, setShowBreakdown] = useState(false);

  const ctrScore = Math.min(100, (ctr / 5) * 100);
  const cvrScore = Math.min(100, (cvr / 10) * 100);
  const cpaScore = Math.max(0, 100 - (cpa / 1000) * 10);
  const wasteScore =
    totalSpend > 0 ? Math.max(0, 100 - (wasteSpend / totalSpend) * 100) : 100;

  const factorScores = {
    ctr: ctrScore,
    cvr: cvrScore,
    cpa: cpaScore,
    waste: wasteScore,
  };

  const getLabel = () => {
    if (score >= 80) return { text: "Excellent", color: "#10B981" };
    if (score >= 60) return { text: "Good", color: "#F3ECE0" };
    if (score >= 40) return { text: "Average", color: "#F59E0B" };
    return { text: "Needs Optimisation", color: "#9B2423" };
  };

  const label = getLabel();

  const gaugeData = [{ name: "Score", value: score, fill: label.color }];

  const overallTooltip = (
    <span>
      <strong style={{ color: "#F3ECE0" }}>How the score is calculated:</strong>
      <br />
      <br />
      Weighted average of 4 factors:
      <br />
      • CTR Score × 25%
      <br />
      • CVR Score × 35%
      <br />
      • CPA Score × 25%
      <br />
      • Waste Score × 15%
      <br />
      <br />
      Each factor is normalised to 0–100 before weighting. Click{" "}
      <em>Show Breakdown</em> for details.
    </span>
  );

  return (
    <div
      className="rounded-2xl p-5 border"
      style={{ background: "#111111", borderColor: "#1E1E1E" }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] font-black uppercase tracking-[0.2em]"
            style={{ color: "#9B2423" }}
          >
            Performance Score
          </span>
          <InfoTooltip content={overallTooltip} />
        </div>
        <button
          onClick={() => setShowBreakdown((v) => !v)}
          className="text-[10px] font-semibold px-3 py-1 rounded-lg border transition-colors"
          style={{
            borderColor: "#2A2A2A",
            color: showBreakdown ? "#F3ECE0" : "#666",
            background: showBreakdown ? "#1A1A1A" : "transparent",
          }}
        >
          {showBreakdown ? "Hide Breakdown" : "Show Breakdown"}
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-center">
        {/* Gauge */}
        <div className="relative flex-shrink-0" style={{ width: 220, height: 140 }}>
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart
              innerRadius="70%"
              outerRadius="100%"
              data={gaugeData}
              startAngle={180}
              endAngle={0}
            >
              <RadialBar background={{ fill: "#1A1A1A" }} dataKey="value" />
            </RadialBarChart>
          </ResponsiveContainer>
          <div
            className="absolute inset-x-0 bottom-0 flex flex-col items-center"
            style={{ bottom: 8 }}
          >
            <span className="text-4xl font-black" style={{ color: label.color }}>
              {score}
            </span>
            <span className="text-[10px] font-semibold mt-0.5" style={{ color: label.color }}>
              {label.text}
            </span>
          </div>
        </div>

        {/* KPI strip */}
        <div className="flex-1 grid grid-cols-3 gap-3">
          {[
            {
              label: "Efficiency Index",
              value:
                typeof efficiencyIndex === "number"
                  ? efficiencyIndex.toFixed(2)
                  : efficiencyIndex,
              sub: "conv per ₹1K",
              tip: "Conversions ÷ Total Spend × 1000. Higher = more conversions per rupee spent.",
            },
            {
              label: "Active Rate",
              value:
                typeof activeRate === "number"
                  ? `${activeRate}%`
                  : `${activeRate}%`,
              sub: "campaigns spending",
              tip: "Active campaigns (cost > ₹0) ÷ total campaigns × 100. A low rate means budget is sitting idle.",
            },
            {
              label: "Waste Spend",
              value: `₹${Number(wasteSpend).toLocaleString()}`,
              sub: "zero conversions",
              tip: "Total spend on campaigns that recorded zero conversions. This directly drags down your Waste Score.",
            },
          ].map(({ label, value, sub, tip }) => (
            <div
              key={label}
              className="rounded-xl p-3 border"
              style={{ background: "#0D0D0D", borderColor: "#1E1E1E" }}
            >
              <div className="flex items-center gap-1">
                <span
                  className="text-[9px] font-black uppercase tracking-widest"
                  style={{ color: "#555" }}
                >
                  {label}
                </span>
                <InfoTooltip content={tip} />
              </div>
              <div
                className="text-lg font-black mt-1"
                style={{ color: "#F3ECE0" }}
              >
                {value}
              </div>
              <div className="text-[10px] mt-0.5" style={{ color: "#444" }}>
                {sub}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Score Breakdown */}
      {showBreakdown && (
        <div
          className="mt-5 rounded-xl p-4 border"
          style={{ background: "#0D0D0D", borderColor: "#1E1E1E" }}
        >
          <p
            className="text-[9px] font-black uppercase tracking-[0.2em] mb-4"
            style={{ color: "#555" }}
          >
            Score Breakdown
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {SCORE_FACTORS.map((f) => {
              const val = factorScores[f.key];
              return (
                <div key={f.key} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <span
                        className="text-[10px] font-semibold"
                        style={{ color: "#AAA" }}
                      >
                        {f.label}
                      </span>
                      <InfoTooltip
                        content={
                          <span>
                            <strong style={{ color: "#F3ECE0" }}>
                              {f.label}
                            </strong>{" "}
                            — Weight: {f.weight}
                            <br />
                            <br />
                            <em style={{ color: "#9B2423" }}>{f.formula}</em>
                            <br />
                            <br />
                            {f.explanation}
                          </span>
                        }
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[10px] font-black"
                        style={{ color: "#F3ECE0" }}
                      >
                        {val.toFixed(1)}
                      </span>
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded"
                        style={{ background: "#1A1A1A", color: "#555" }}
                      >
                        ×{f.weight}
                      </span>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div
                    className="w-full h-1.5 rounded-full overflow-hidden"
                    style={{ background: "#1A1A1A" }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${val}%`,
                        background:
                          val >= 70 ? "#10B981" : val >= 40 ? "#F59E0B" : "#9B2423",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Formula summary */}
          <div
            className="mt-4 rounded-lg px-3 py-2 text-[10px]"
            style={{ background: "#111", color: "#555", borderTop: "1px solid #1E1E1E" }}
          >
            Final Score = (CTR×0.25) + (CVR×0.35) + (CPA×0.25) + (Waste×0.15) ={" "}
            <span style={{ color: "#F3ECE0" }}>
              {(
                ctrScore * 0.25 +
                cvrScore * 0.35 +
                cpaScore * 0.25 +
                wasteScore * 0.15
              ).toFixed(1)}
            </span>
            {" "}→ rounded to{" "}
            <span style={{ color: "#9B2423", fontWeight: 700 }}>{score}</span>
          </div>
        </div>
      )}
    </div>
  );
}
