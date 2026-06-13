import { useState } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  Cell,
} from "recharts";

const CTR_THRESHOLD = 2;
const CVR_THRESHOLD = 5;

const QUADRANTS = [
  {
    id: "star",
    label: "Stars",
    color: "#10B981",
    condition: (d) => d.ctr >= CTR_THRESHOLD && d.cvr >= CVR_THRESHOLD,
    action: "Scale budget — high traffic AND high conversion.",
    icon: "★",
  },
  {
    id: "landing",
    label: "Fix Landing Page",
    color: "#F59E0B",
    condition: (d) => d.ctr >= CTR_THRESHOLD && d.cvr < CVR_THRESHOLD,
    action: "Good click rate but visitors don't convert. Fix landing page or offer.",
    icon: "↻",
  },
  {
    id: "traffic",
    label: "Increase Traffic",
    color: "#38BDF8",
    condition: (d) => d.ctr < CTR_THRESHOLD && d.cvr >= CVR_THRESHOLD,
    action: "Ad converts well when clicked — widen audience or raise bids.",
    icon: "↑",
  },
  {
    id: "pause",
    label: "Pause / Review",
    color: "#9B2423",
    condition: (d) => d.ctr < CTR_THRESHOLD && d.cvr < CVR_THRESHOLD,
    action: "Low clicks and low conversions. Pause or completely rework.",
    icon: "⏸",
  },
];

function getQuadrant(d) {
  return QUADRANTS.find((q) => q.condition(d)) || QUADRANTS[3];
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const q = getQuadrant(d);

  return (
    <div
      className="rounded-xl p-3 text-xs shadow-2xl min-w-[200px]"
      style={{ background: "#111", border: `1px solid ${q.color}55`, color: "#CCC", lineHeight: 1.6 }}
    >
      <div className="font-bold mb-2 truncate" style={{ color: "#F3ECE0", maxWidth: 200 }}>
        {d.campaign}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-2">
        <span style={{ color: "#666" }}>CTR</span>
        <span style={{ color: "#F3ECE0", fontWeight: 700 }}>{d.ctr?.toFixed(2)}%</span>
        <span style={{ color: "#666" }}>CVR</span>
        <span style={{ color: "#F3ECE0", fontWeight: 700 }}>{d.cvr?.toFixed(2)}%</span>
        {d.cost != null && (
          <>
            <span style={{ color: "#666" }}>Spend</span>
            <span style={{ color: "#F3ECE0", fontWeight: 700 }}>₹{Number(d.cost).toLocaleString()}</span>
          </>
        )}
        {d.conversions != null && (
          <>
            <span style={{ color: "#666" }}>Conv.</span>
            <span style={{ color: "#F3ECE0", fontWeight: 700 }}>{d.conversions}</span>
          </>
        )}
      </div>
      <div
        className="rounded-lg px-2 py-1.5 mt-1"
        style={{ background: `${q.color}18`, border: `1px solid ${q.color}44` }}
      >
        <div className="font-black text-[10px] mb-0.5" style={{ color: q.color }}>
          {q.icon} {q.label}
        </div>
        <div style={{ color: "#888", fontSize: 10 }}>{q.action}</div>
      </div>
    </div>
  );
}

function InfoTooltip({ content }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
        className="w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center border ml-1.5"
        style={{ background: "#1A1A1A", borderColor: "#333", color: "#888" }}
        aria-label="Info"
      >
        i
      </button>
      {open && (
        <div
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 rounded-xl p-3 text-xs shadow-2xl"
          style={{ background: "#111", border: "1px solid #2A2A2A", color: "#CCC", lineHeight: 1.55 }}
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

export default function CTRCVRQuadrant({ campaigns = [] }) {
  const data = campaigns.map((c) => ({
    campaign: c.campaign,
    ctr: Number(c.ctr) || 0,
    cvr: Number(c.conversion_rate) || 0,
    cost: c.cost,
    conversions: c.conversions,
  }));

  const quadrantCounts = QUADRANTS.map((q) => ({
    ...q,
    count: data.filter(q.condition).length,
  }));

  const chartTooltip = (
    <span>
      <strong style={{ color: "#F3ECE0" }}>CTR vs CVR Quadrant</strong>
      <br /><br />
      Plots each campaign by two efficiency dimensions:
      <br /><br />
      <strong style={{ color: "#AAA" }}>X-axis — CTR (Click-Through Rate)</strong>
      <br />
      Clicks ÷ Impressions × 100. Benchmark: <em>{CTR_THRESHOLD}%</em>
      <br /><br />
      <strong style={{ color: "#AAA" }}>Y-axis — CVR (Conversion Rate)</strong>
      <br />
      Conversions ÷ Clicks × 100. Benchmark: <em>{CVR_THRESHOLD}%</em>
      <br /><br />
      Dashed lines divide the chart into 4 action zones. Hover any dot for campaign details and the recommended action.
    </span>
  );

  return (
    <div
      className="rounded-2xl p-5 border"
      style={{ background: "#111111", borderColor: "#1E1E1E" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <div className="flex items-center gap-1">
          <span
            className="text-[10px] font-black uppercase tracking-[0.2em]"
            style={{ color: "#9B2423" }}
          >
            CTR vs CVR Quadrant
          </span>
          <InfoTooltip content={chartTooltip} />
        </div>
        {/* quadrant counts */}
        <div className="flex items-center gap-2 flex-wrap">
          {quadrantCounts.map((q) => (
            <div
              key={q.id}
              className="flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full"
              style={{ background: `${q.color}18`, border: `1px solid ${q.color}44`, color: q.color }}
            >
              {q.icon} <span>{q.count}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[10px] mb-4" style={{ color: "#444" }}>
        Benchmarks: CTR ≥ {CTR_THRESHOLD}% · CVR ≥ {CVR_THRESHOLD}%
      </p>

      <div className="h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
            <CartesianGrid stroke="#1A1A1A" strokeDasharray="3 3" />
            <XAxis
              dataKey="ctr"
              name="CTR"
              unit="%"
              stroke="#333"
              tick={{ fill: "#555", fontSize: 10 }}
              label={{ value: "CTR (%)", position: "insideBottom", offset: -4, fill: "#555", fontSize: 10 }}
            />
            <YAxis
              dataKey="cvr"
              name="CVR"
              unit="%"
              stroke="#333"
              tick={{ fill: "#555", fontSize: 10 }}
              label={{ value: "CVR (%)", angle: -90, position: "insideLeft", offset: 10, fill: "#555", fontSize: 10 }}
            />
            <ReferenceLine
              x={CTR_THRESHOLD}
              stroke="#2A2A2A"
              strokeDasharray="4 4"
              label={{ value: `CTR ${CTR_THRESHOLD}%`, position: "top", fill: "#444", fontSize: 9 }}
            />
            <ReferenceLine
              y={CVR_THRESHOLD}
              stroke="#2A2A2A"
              strokeDasharray="4 4"
              label={{ value: `CVR ${CVR_THRESHOLD}%`, position: "right", fill: "#444", fontSize: 9 }}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#333" }} />
            <Scatter data={data}>
              {data.map((d, i) => {
                const q = getQuadrant(d);
                return <Cell key={i} fill={q.color} fillOpacity={0.85} />;
              })}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Quadrant legend */}
      <div className="grid grid-cols-2 gap-2 mt-4">
        {QUADRANTS.map((q) => (
          <div
            key={q.id}
            className="rounded-lg px-3 py-2 flex items-start gap-2"
            style={{ background: `${q.color}10`, border: `1px solid ${q.color}30` }}
          >
            <span className="text-sm mt-0.5" style={{ color: q.color }}>{q.icon}</span>
            <div>
              <div className="text-[10px] font-bold" style={{ color: q.color }}>
                {q.label}
              </div>
              <div className="text-[10px] mt-0.5" style={{ color: "#555" }}>
                {q.action}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
