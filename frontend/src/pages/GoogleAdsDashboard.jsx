import { useState, useMemo } from "react";
import MainLayout from "../layouts/MainLayout";
import useGoogleAdsData from "../hooks/useGoogleAdsData";
import useExecutiveMetrics from "../hooks/useExecutiveMetrics";
import ExecutiveFilters from "../components/GoogleAds1/filters/ExecutiveFilters";
import KPIGrid from "../components/GoogleAds1/kpis/KPIGrid";
import ExecutiveScoreCard from "../components/GoogleAds1/kpis/ExecutiveScoreCard";
import CampaignEfficiencyMatrix from "../components/GoogleAds1/charts/CampaignEfficiencyMatrix";
import MatchTypeAnalytics from "../components/GoogleAds1/charts/MatchTypeAnalytics";
import SpendTrendChart from "../components/GoogleAds1/charts/SpendTrendChart";
import WasteSpendTrend from "../components/GoogleAds1/charts/WasteSpendTrend";
import ForecastChart from "../components/GoogleAds1/charts/ForecastChart";
import CampaignRankingTable from "../components/GoogleAds1/tables/CampaignRankingTable";
import OpportunityTable from "../components/GoogleAds1/tables/OpportunityTable";
import CampaignIntelligenceTable from "../components/GoogleAds1/tables/CampaignIntelligenceTable";
import RecommendationPanel from "../components/GoogleAds1/insights/RecommendationPanel";
import NarrativeSummary from "../components/GoogleAds1/insights/NarrativeSummary";

// ─────────────────────────────────────────────────────────────────────────────
// FORMATTING HELPERS (USD → INR) 
// ─────────────────────────────────────────────────────────────────────────────
const USD_TO_INR = 1;

const fmt = {
  currency: (v) => {
    const inr = v * USD_TO_INR;
    if (inr >= 10_000_000) return `₹${(inr / 10_000_000).toFixed(2)}Cr`;
    if (inr >= 100_000) return `₹${(inr / 100_000).toFixed(2)}L`;
    if (inr >= 1_000) return `₹${(inr / 1_000).toFixed(1)}K`;
    return `₹${inr.toFixed(2)}`;
  },
  pct: (v) => `${v.toFixed(2)}%`,
  num: (v) =>
    v >= 1_000_000
      ? `${(v / 1_000_000).toFixed(1)}M`
      : v >= 1_000
      ? `${(v / 1_000).toFixed(1)}K`
      : Number(v).toLocaleString(),
};

// ─────────────────────────────────────────────────────────────────────────────
// NORMALIZATION & VALIDATION
// ─────────────────────────────────────────────────────────────────────────────
const normalizeCampaign = (raw) => {
  const cost = Number(raw.cost) || 0;
  const clicks = Number(raw.clicks) || 0;
  const impressions = Number(raw.impressions) || 0;
  const conversions = Number(raw.conversions) || 0;

  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const conversion_rate = clicks > 0 ? (conversions / clicks) * 100 : 0;
  const avg_cpc = clicks > 0 ? cost / clicks : 0;
  const cpa = conversions > 0 ? cost / conversions : 0;
  const efficiency = (ctr * conversion_rate) / Math.max(avg_cpc, 1);

  return {
    campaign: raw.campaign || raw.campaign_name || raw.campaignName || "Unknown",
    cost,
    clicks,
    impressions,
    conversions,
    ctr,
    conversion_rate,
    avg_cpc,
    cpa,
    efficiency,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// EXECUTIVE SCORE (new weighted formula)
// ─────────────────────────────────────────────────────────────────────────────
const computeExecutiveScore = (ctr, cvr, cpa, wasteSpend, totalSpend) => {
  const ctrScore = Math.min(100, (ctr / 5) * 100);      // target 5% CTR
  const cvrScore = Math.min(100, (cvr / 10) * 100);     // target 10% CVR
  const cpaScore = Math.max(0, 100 - (cpa / 1000) * 10); // lower CPA better
  const wasteScore = totalSpend > 0 
    ? Math.max(0, 100 - (wasteSpend / totalSpend) * 100)
    : 100;

  return Math.round(
    ctrScore * 0.25 + cvrScore * 0.35 + cpaScore * 0.25 + wasteScore * 0.15
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// DATE RANGE FILTER
// ─────────────────────────────────────────────────────────────────────────────
const DateRangeFilter = ({ value, onChange }) => {
  const ranges = [
    { label: "Last 7 days", days: 7 },
    { label: "Last 30 days", days: 30 },
    { label: "Last 90 days", days: 90 },
  ];
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const handleRange = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    onChange({ start, end, label: ranges.find(r => r.days === days)?.label });
  };

  const handleCustom = () => {
    if (customStart && customEnd) {
      onChange({ start: new Date(customStart), end: new Date(customEnd), label: "Custom" });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 bg-[#0c1425] border border-slate-800/60 rounded-xl p-3">
      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Date Range</span>
      {ranges.map(({ label, days }) => (
        <button
          key={label}
          onClick={() => handleRange(days)}
          className={`px-3 py-1.5 rounded-lg text-xs transition ${
            value?.label === label
              ? "bg-blue-600 text-white"
              : "bg-slate-800 text-slate-300 hover:bg-slate-700"
          }`}
        >
          {label}
        </button>
      ))}
      <div className="flex items-center gap-1">
        <input
          type="date"
          value={customStart}
          onChange={(e) => setCustomStart(e.target.value)}
          className="bg-slate-800 text-white text-xs rounded-lg px-2 py-1.5 border border-slate-700"
        />
        <span className="text-slate-500">to</span>
        <input
          type="date"
          value={customEnd}
          onChange={(e) => setCustomEnd(e.target.value)}
          className="bg-slate-800 text-white text-xs rounded-lg px-2 py-1.5 border border-slate-700"
        />
        <button
          onClick={handleCustom}
          className="bg-slate-700 text-white text-xs px-3 py-1.5 rounded-lg"
        >
          Apply
        </button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// EXECUTIVE SUMMARY CARD
// ─────────────────────────────────────────────────────────────────────────────
const ExecutiveSummaryCard = ({ spend, conversions, cpa, bestCampaign, wasteSpend, recommendedAction }) => (
  <div className="bg-gradient-to-r from-[#0c1425] to-[#0f172a] border border-slate-800 rounded-2xl p-5 mb-5">
    <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
      Executive Summary
    </h2>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      <div>
        <div className="text-[10px] text-slate-500 uppercase">Total Spend</div>
        <div className="text-2xl font-black text-white">{fmt.currency(spend)}</div>
      </div>
      <div>
        <div className="text-[10px] text-slate-500 uppercase">Conversions</div>
        <div className="text-2xl font-black text-white">{fmt.num(conversions)}</div>
      </div>
      <div>
        <div className="text-[10px] text-slate-500 uppercase">Avg CPA</div>
        <div className="text-2xl font-black text-white">{fmt.currency(cpa)}</div>
      </div>
      <div>
        <div className="text-[10px] text-slate-500 uppercase">Best Campaign</div>
        <div className="text-sm font-semibold text-emerald-400 truncate">{bestCampaign}</div>
      </div>
      <div>
        <div className="text-[10px] text-slate-500 uppercase">Waste Spend</div>
        <div className="text-sm font-semibold text-red-400">{fmt.currency(wasteSpend)}</div>
      </div>
    </div>
    <div className="mt-4 pt-3 border-t border-slate-800/50 text-xs">
      <span className="text-slate-500">📌 Recommended Action: </span>
      <span className="text-white">{recommendedAction}</span>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// AI INSIGHTS PANEL (dynamic, campaign-specific)
// ─────────────────────────────────────────────────────────────────────────────
const AIInsightsPanel = ({ campaigns, topCampaign, worstCampaign, highestCPA, wasteSpend }) => {
  const insights = [];

  if (topCampaign) {
    insights.push({
      priority: "High",
      text: `Scale "${topCampaign.campaign}" — ${topCampaign.conversions} conversions at ${fmt.currency(topCampaign.cpa)} CPA`,
    });
  }
  if (worstCampaign && worstCampaign.conversions === 0) {
    insights.push({
      priority: "High",
      text: `Pause "${worstCampaign.campaign}" — spent ${fmt.currency(worstCampaign.cost)} with zero conversions`,
    });
  }
  if (highestCPA && highestCPA.cpa > 5000) {
    insights.push({
      priority: "Medium",
      text: `Reduce CPC on "${highestCPA.campaign}" — CPA at ${fmt.currency(highestCPA.cpa)} is above target`,
    });
  }
  const underperforming = campaigns.filter(c => c.conversion_rate > 0 && c.conversion_rate < 2).slice(0, 2);
  underperforming.forEach(c => {
    insights.push({
      priority: "Low",
      text: `Review ad copy for "${c.campaign}" — CVR only ${c.conversion_rate.toFixed(1)}%`,
    });
  });

  if (insights.length === 0) {
    insights.push({ priority: "Info", text: "All campaigns are performing within acceptable ranges." });
  }

  return (
    <div className="bg-[#0c1425] border border-slate-800 rounded-2xl p-5 mb-5">
      <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
        AI-Powered Insights
      </h3>
      <div className="space-y-2">
        {insights.map((insight, idx) => (
          <div key={idx} className="flex items-start gap-2 text-xs">
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
              insight.priority === "High" ? "bg-red-950 text-red-400" :
              insight.priority === "Medium" ? "bg-amber-950 text-amber-400" :
              "bg-blue-950 text-blue-400"
            }`}>
              {insight.priority}
            </span>
            <span className="text-slate-300">{insight.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// LOADING SKELETONS
// ─────────────────────────────────────────────────────────────────────────────
const SkeletonCard = () => (
  <div className="bg-[#0c1425] border border-slate-800 rounded-2xl p-5 animate-pulse">
    <div className="h-4 bg-slate-800 rounded w-1/3 mb-3" />
    <div className="h-8 bg-slate-800 rounded w-2/3 mb-2" />
    <div className="h-3 bg-slate-800 rounded w-full" />
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// DIRECTOR KPI CARD (unchanged)
// ─────────────────────────────────────────────────────────────────────────────
const ACCENT = {
  blue:   { ring: "ring-blue-500/20",   text: "text-blue-400",   glow: "from-blue-900/30",   dot: "bg-blue-500"   },
  violet: { ring: "ring-violet-500/20", text: "text-violet-400", glow: "from-violet-900/30", dot: "bg-violet-500" },
  indigo: { ring: "ring-indigo-500/20", text: "text-indigo-400", glow: "from-indigo-900/30", dot: "bg-indigo-500" },
  emerald:{ ring: "ring-emerald-500/20",text: "text-emerald-400",glow: "from-emerald-900/30",dot: "bg-emerald-500"},
  cyan:   { ring: "ring-cyan-500/20",   text: "text-cyan-400",   glow: "from-cyan-900/30",   dot: "bg-cyan-500"   },
  amber:  { ring: "ring-amber-500/20",  text: "text-amber-400",  glow: "from-amber-900/30",  dot: "bg-amber-500"  },
  red:    { ring: "ring-red-500/20",    text: "text-red-400",    glow: "from-red-900/30",    dot: "bg-red-500"    },
  rose:   { ring: "ring-rose-500/20",   text: "text-rose-400",   glow: "from-rose-900/30",   dot: "bg-rose-500"   },
};

function DirectorKPI({ label, value, subValue, accent = "blue", delta, className = "" }) {
  const a = ACCENT[accent];
  return (
    <div className={`relative bg-[#0c1425] border border-slate-800/80 rounded-2xl p-4 ring-1 ${a.ring} overflow-hidden flex flex-col gap-1 ${className}`}>
      <div className={`absolute inset-0 bg-gradient-to-br ${a.glow} to-transparent opacity-60 pointer-events-none`} />
      <span className="relative text-[10px] font-semibold text-slate-500 uppercase tracking-widest leading-none">{label}</span>
      <span className={`relative text-2xl font-black leading-tight ${a.text}`}>{value}</span>
      <div className="relative flex items-center justify-between mt-0.5">
        {subValue && <span className="text-[11px] text-slate-600">{subValue}</span>}
        {delta !== undefined && (
          <span className={`text-[11px] font-semibold ${delta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HEALTH BADGE (updated thresholds)
// ─────────────────────────────────────────────────────────────────────────────
function HealthBadge({ cvr, spend }) {
  if (!spend) return <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-600">Inactive</span>;
  if (cvr >= 0.08) return <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-950/80 text-emerald-400 ring-1 ring-emerald-600/40">Elite</span>;
  if (cvr >= 0.05) return <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-950/80 text-blue-400 ring-1 ring-blue-600/40">Strong</span>;
  if (cvr >= 0.02) return <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-950/80 text-amber-400 ring-1 ring-amber-600/40">Average</span>;
  if (cvr > 0)     return <span className="px-2 py-0.5 rounded-full text-[10px] bg-orange-950/80 text-orange-400 ring-1 ring-orange-600/40">Weak</span>;
  return              <span className="px-2 py-0.5 rounded-full text-[10px] bg-red-950/80 text-red-400 ring-1 ring-red-600/40">No Conv</span>;
}

// ─────────────────────────────────────────────────────────────────────────────
// MINI SPEND BAR
// ─────────────────────────────────────────────────────────────────────────────
function MiniBar({ value, max, color = "emerald" }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const bg = { emerald: "bg-emerald-500", blue: "bg-blue-500", amber: "bg-amber-400", red: "bg-red-500", violet: "bg-violet-500" };
  return (
    <div className="h-1.5 w-24 bg-slate-800 rounded-full overflow-hidden">
      <div className={`h-full ${bg[color] || "bg-blue-500"} rounded-full`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TIER ROW
// ─────────────────────────────────────────────────────────────────────────────
function TierRow({ label, count, total, dotColor }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
      <span className="text-xs text-slate-400 flex-1 leading-none">{label}</span>
      <span className="text-xs font-bold text-white w-6 text-right">{count}</span>
      <span className="text-[10px] text-slate-600 w-8 text-right">{pct}%</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DONUT CHART
// ─────────────────────────────────────────────────────────────────────────────
function HealthDonut({ elite, strong, average, weak, noConv, total }) {
  const elitePct = total > 0 ? (elite / total) * 100 : 0;
  const strongPct = total > 0 ? (strong / total) * 100 : 0;
  const avgPct = total > 0 ? (average / total) * 100 : 0;
  const weakPct = total > 0 ? (weak / total) * 100 : 0;
  const noConvPct = total > 0 ? (noConv / total) * 100 : 0;

  const conicGradient = `conic-gradient(
    from 0deg,
    #10b981 0deg ${elitePct * 3.6}deg,
    #3b82f6 ${elitePct * 3.6}deg ${(elitePct + strongPct) * 3.6}deg,
    #fbbf24 ${(elitePct + strongPct) * 3.6}deg ${(elitePct + strongPct + avgPct) * 3.6}deg,
    #f97316 ${(elitePct + strongPct + avgPct) * 3.6}deg ${(elitePct + strongPct + avgPct + weakPct) * 3.6}deg,
    #ef4444 ${(elitePct + strongPct + avgPct + weakPct) * 3.6}deg 360deg
  )`;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-32 h-32 rounded-full" style={{ background: conicGradient }}>
        <div className="absolute inset-[25%] bg-[#0c1425] rounded-full flex items-center justify-center">
          <span className="text-xl font-black text-white">{total}</span>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[10px]">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"/> Elite</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"/> Strong</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400"/> Avg</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500"/> Weak</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"/> No Conv</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DIRECTOR FILTER STRIP (unchanged)
// ─────────────────────────────────────────────────────────────────────────────
function DirectorFilterStrip({ filters, setFilters, onClear, hasActiveFilters }) {
  const sel = "bg-transparent text-xs text-white border-none outline-none cursor-pointer appearance-none";
  const inp = "bg-transparent text-xs text-white border-none outline-none w-16 placeholder:text-slate-700";
  const pill = "flex items-center gap-2 bg-[#0c1425] border border-slate-700/60 rounded-xl px-3 py-2";

  return (
    <div className="flex flex-wrap items-center gap-2 mb-5">
      <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mr-1">Director Filters</span>

      <div className={pill}>
        <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wide whitespace-nowrap">Sort</span>
        <select value={filters.sortBy} onChange={(e) => setFilters((f) => ({ ...f, sortBy: e.target.value }))} className={sel}>
          <option value="cost">Spend ↓</option>
          <option value="clicks">Clicks ↓</option>
          <option value="conversions">Conversions ↓</option>
          <option value="impressions">Impressions ↓</option>
          <option value="ctr">CTR ↓</option>
          <option value="cpa">CPA ↑ (best first)</option>
          <option value="efficiency">Efficiency ↓</option>
        </select>
      </div>

      <div className={pill}>
        <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wide whitespace-nowrap">Status</span>
        <select value={filters.campaignStatus} onChange={(e) => setFilters((f) => ({ ...f, campaignStatus: e.target.value }))} className={sel}>
          <option value="All">All</option>
          <option value="Active">Active</option>
          <option value="Top Performer">Top Performers</option>
          <option value="Underperforming">Underperforming</option>
          <option value="Efficient">Below Avg CPA</option>
          <option value="No Conversions">Zero Conversions</option>
        </select>
      </div>

      <div className={pill}>
        <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wide whitespace-nowrap">Focus</span>
        <select value={filters.metricFocus} onChange={(e) => setFilters((f) => ({ ...f, metricFocus: e.target.value }))} className={sel}>
          <option value="All">All Metrics</option>
          <option value="Spend">Spend-Based</option>
          <option value="Conversion">Conversion-Based</option>
          <option value="Efficiency">Efficiency Only</option>
        </select>
      </div>

      <div className={pill}>
        <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wide whitespace-nowrap">Min ₹</span>
        <input type="number" min={0} placeholder="0" value={filters.minSpend} onChange={(e) => setFilters((f) => ({ ...f, minSpend: e.target.value }))} className={inp} />
      </div>

      <div className={pill}>
        <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wide whitespace-nowrap">Min Conv</span>
        <input type="number" min={0} placeholder="0" value={filters.conversionMin} onChange={(e) => setFilters((f) => ({ ...f, conversionMin: e.target.value }))} className={inp} />
      </div>

      <div className={pill}>
        <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wide whitespace-nowrap">Max CPA ₹</span>
        <input type="number" min={0} placeholder="∞" value={filters.cpaMax} onChange={(e) => setFilters((f) => ({ ...f, cpaMax: e.target.value }))} className={inp} />
      </div>

      <div className={pill}>
        <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wide whitespace-nowrap">Min CTR %</span>
        <input type="number" min={0} step={0.1} placeholder="0" value={filters.ctrMin} onChange={(e) => setFilters((f) => ({ ...f, ctrMin: e.target.value }))} className={inp} />
      </div>

      <div className={pill}>
        <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wide whitespace-nowrap">Min Impr</span>
        <input type="number" min={0} placeholder="0" value={filters.impressionMin} onChange={(e) => setFilters((f) => ({ ...f, impressionMin: e.target.value }))} className={inp} />
      </div>

      {hasActiveFilters && (
        <button onClick={onClear} className="text-[11px] text-red-400 border border-red-800/50 bg-red-950/30 px-3 py-2 rounded-xl hover:bg-red-950/60 transition-colors">
          ✕ Clear All
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
export default function GoogleAdsDashboard() {
  // Data from hooks
  const { campaigns: rawCampaigns, keywords, trends: rawTrends, loading } = useGoogleAdsData();
  const { wasteSpend, zeroConversionDays, recommendations: hookRecommendations } = useExecutiveMetrics({}); // we'll override

  // ───────────────────────────────────────────────────────────────────────────
  // FILTERS STATE (includes date range)
  // ───────────────────────────────────────────────────────────────────────────
  const DEFAULT_FILTERS = {
    sortBy: "cost",
    minSpend: "",
    conversionMin: "",
    cpaMax: "",
    ctrMin: "",
    impressionMin: "",
    campaignStatus: "All",
    metricFocus: "All",
    dateRange: { label: "Last 30 days", start: new Date(Date.now() - 30 * 86400000), end: new Date() },
  };
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const clearFilters = () => setFilters(DEFAULT_FILTERS);
  const hasActiveDirectorFilters = Object.keys(DEFAULT_FILTERS).some(
    key => key !== "dateRange" && filters[key] !== DEFAULT_FILTERS[key]
  );

  // ───────────────────────────────────────────────────────────────────────────
  // 1. NORMALIZE RAW CAMPAIGNS (single source)
  // ───────────────────────────────────────────────────────────────────────────
  const allNormalizedCampaigns = useMemo(() => {
    const campaignMap = new Map();
    rawCampaigns.forEach(row => {
      const name = row.campaign || row.campaign_name || row.campaignName;
      if (!name) return;
      if (!campaignMap.has(name)) {
        campaignMap.set(name, { campaign: name, cost: 0, clicks: 0, impressions: 0, conversions: 0 });
      }
      const agg = campaignMap.get(name);
      agg.cost += Number(row.cost) || 0;
      agg.clicks += Number(row.clicks) || 0;
      agg.impressions += Number(row.impressions) || 0;
      agg.conversions += Number(row.conversions) || 0;
    });
    return Array.from(campaignMap.values()).map(normalizeCampaign);
  }, [rawCampaigns]);

  // ───────────────────────────────────────────────────────────────────────────
  // 2. APPLY DATE RANGE + DIRECTOR FILTERS (single source of truth)
  // ───────────────────────────────────────────────────────────────────────────
  const filteredCampaigns = useMemo(() => {
    let result = [...allNormalizedCampaigns];

    // Date range filtering (if trends data available, but we filter aggregated campaigns by spend date? 
    // Since aggregated campaigns lose daily granularity, we apply date filter at row level before aggregation.
    // We'll re-aggregate with date filter.
    // To keep it correct, we need to filter raw rows by date, then re-aggregate.
    // Let's do that:
    const { start, end } = filters.dateRange;
    let dateFilteredRows = rawCampaigns;
    if (start && end) {
      dateFilteredRows = rawCampaigns.filter(row => {
        const d = new Date(row.report_date);
        return d >= start && d <= end;
      });
    }
    // Re-aggregate after date filter
    const dateAggMap = new Map();
    dateFilteredRows.forEach(row => {
      const name = row.campaign;
      if (!name) return;
      if (!dateAggMap.has(name)) {
        dateAggMap.set(name, { campaign: name, cost: 0, clicks: 0, impressions: 0, conversions: 0 });
      }
      const agg = dateAggMap.get(name);
      agg.cost += Number(row.cost) || 0;
      agg.clicks += Number(row.clicks) || 0;
      agg.impressions += Number(row.impressions) || 0;
      agg.conversions += Number(row.conversions) || 0;
    });
    result = Array.from(dateAggMap.values()).map(normalizeCampaign);

    // Apply director numeric filters
    const minSpendVal = parseFloat(filters.minSpend) || 0;
    const convMinVal = parseFloat(filters.conversionMin) || 0;
    const cpaMaxVal = parseFloat(filters.cpaMax) || 0;
    const ctrMinVal = parseFloat(filters.ctrMin) || 0;
    const imprMinVal = parseFloat(filters.impressionMin) || 0;

    if (minSpendVal) result = result.filter(c => c.cost >= minSpendVal);
    if (convMinVal) result = result.filter(c => c.conversions >= convMinVal);
    if (imprMinVal) result = result.filter(c => c.impressions >= imprMinVal);
    if (cpaMaxVal) result = result.filter(c => c.conversions > 0 && c.cpa <= cpaMaxVal);
    if (ctrMinVal) result = result.filter(c => c.ctr >= ctrMinVal);

    // Status filters
    if (filters.campaignStatus === "Active") {
      result = result.filter(c => c.cost > 0);
    } else if (filters.campaignStatus === "Top Performer") {
      result = result.filter(c => c.conversion_rate >= 5);
    } else if (filters.campaignStatus === "Underperforming") {
      result = result.filter(c => c.cost > 0 && (c.conversions === 0 || c.conversion_rate < 1));
    } else if (filters.campaignStatus === "Efficient") {
      const avgCPA = result.filter(c => c.conversions > 0).reduce((s, c) => s + c.cpa, 0) / (result.filter(c => c.conversions > 0).length || 1);
      result = result.filter(c => c.conversions > 0 && c.cpa <= avgCPA);
    } else if (filters.campaignStatus === "No Conversions") {
      result = result.filter(c => c.cost > 0 && c.conversions === 0);
    }

    // Metric focus
    if (filters.metricFocus === "Spend") {
      result = result.filter(c => c.cost > 0);
    } else if (filters.metricFocus === "Conversion") {
      result = result.filter(c => c.conversions > 0);
    } else if (filters.metricFocus === "Efficiency") {
      result = result.filter(c => c.conversion_rate >= 3);
    }

    // Sorting
    result.sort((a, b) => {
      switch (filters.sortBy) {
        case "clicks": return b.clicks - a.clicks;
        case "conversions": return b.conversions - a.conversions;
        case "impressions": return b.impressions - a.impressions;
        case "ctr": return b.ctr - a.ctr;
        case "cpa": return (a.cpa || Infinity) - (b.cpa || Infinity);
        case "efficiency": return b.efficiency - a.efficiency;
        default: return b.cost - a.cost;
      }
    });

    return result;
  }, [allNormalizedCampaigns, rawCampaigns, filters]);

  // ───────────────────────────────────────────────────────────────────────────
  // 3. DERIVED METRICS (all based on filteredCampaigns)
  // ───────────────────────────────────────────────────────────────────────────
  const overview = useMemo(() => {
    let totalSpend = 0, totalClicks = 0, totalImpressions = 0, totalConversions = 0;
    filteredCampaigns.forEach(c => {
      totalSpend += c.cost;
      totalClicks += c.clicks;
      totalImpressions += c.impressions;
      totalConversions += c.conversions;
    });
    return { totalSpend, totalClicks, totalImpressions, totalConversions };
  }, [filteredCampaigns]);

  const advMetrics = useMemo(() => {
    const ctr = overview.totalImpressions > 0 ? (overview.totalClicks / overview.totalImpressions) * 100 : 0;
    const cpc = overview.totalClicks > 0 ? overview.totalSpend / overview.totalClicks : 0;
    const cpa = overview.totalConversions > 0 ? overview.totalSpend / overview.totalConversions : 0;
    const cvr = overview.totalClicks > 0 ? (overview.totalConversions / overview.totalClicks) * 100 : 0;
    const efficiencyIndex = overview.totalSpend > 0 ? (overview.totalConversions / overview.totalSpend) * 1000 : 0;

    const activeCampaigns = filteredCampaigns.filter(c => c.cost > 0).length;
    const totalCampaigns = filteredCampaigns.length;

    const elite = filteredCampaigns.filter(c => c.conversion_rate >= 8).length;
    const strong = filteredCampaigns.filter(c => c.conversion_rate >= 5 && c.conversion_rate < 8).length;
    const average = filteredCampaigns.filter(c => c.conversion_rate >= 2 && c.conversion_rate < 5).length;
    const weak = filteredCampaigns.filter(c => c.conversion_rate > 0 && c.conversion_rate < 2).length;
    const noConv = filteredCampaigns.filter(c => c.cost > 0 && c.conversions === 0).length;

    const topCampaign = [...filteredCampaigns].sort((a, b) => b.conversions - a.conversions)[0];
    const highestSpend = [...filteredCampaigns].sort((a, b) => b.cost - a.cost)[0];
    const worstCampaign = filteredCampaigns.filter(c => c.cost > 0 && c.conversions === 0).sort((a, b) => b.cost - a.cost)[0] ||
                         [...filteredCampaigns].filter(c => c.conversions > 0).sort((a, b) => a.cpa - b.cpa)[0];
    const highestCPA = [...filteredCampaigns].filter(c => c.conversions > 0).sort((a, b) => b.cpa - a.cpa)[0];

    return { ctr, cpc, cpa, cvr, efficiencyIndex, activeCampaigns, totalCampaigns, elite, strong, average, weak, noConv, topCampaign, highestSpend, worstCampaign, highestCPA };
  }, [filteredCampaigns, overview]);

  // Executive score using new weights
  const executiveScore = useMemo(() => {
    return computeExecutiveScore(advMetrics.ctr, advMetrics.cvr, advMetrics.cpa, wasteSpend, overview.totalSpend);
  }, [advMetrics, wasteSpend, overview.totalSpend]);

  // Filtered trends (for charts)
  const filteredTrends = useMemo(() => {
    let trends = [...(rawTrends || [])];
    const { start, end } = filters.dateRange;
    if (start && end) {
      trends = trends.filter(t => {
        const d = new Date(t.report_date);
        return d >= start && d <= end;
      });
    }
    return trends;
  }, [rawTrends, filters.dateRange]);

  // Filtered keywords (for match type)
  const filteredKeywords = useMemo(() => {
    // For simplicity, return all keywords. In a real app apply date/campaign filters.
    return keywords;
  }, [keywords]);

  // Recommendations (combine hook + derived)
  const recommendations = useMemo(() => {
    const recs = [...hookRecommendations];
    if (advMetrics.topCampaign && advMetrics.topCampaign.conversion_rate > 8) {
      recs.push({ text: `Scale "${advMetrics.topCampaign.campaign}" by 20%`, priority: "High" });
    }
    if (advMetrics.worstCampaign && advMetrics.worstCampaign.conversions === 0) {
      recs.push({ text: `Pause "${advMetrics.worstCampaign.campaign}" – zero conversions`, priority: "High" });
    }
    return recs.slice(0, 5);
  }, [hookRecommendations, advMetrics]);

  // Executive summary props
  const executiveSummary = useMemo(() => {
    const bestCampaign = advMetrics.topCampaign?.campaign || "N/A";
    let recommendedAction = "No immediate action needed.";
    if (advMetrics.topCampaign && advMetrics.topCampaign.conversion_rate > 8) {
      recommendedAction = `Scale "${advMetrics.topCampaign.campaign}" by 20%`;
    } else if (advMetrics.worstCampaign && advMetrics.worstCampaign.conversions === 0) {
      recommendedAction = `Pause "${advMetrics.worstCampaign.campaign}"`;
    } else if (advMetrics.highestCPA && advMetrics.highestCPA.cpa > 5000) {
      recommendedAction = `Reduce CPC on "${advMetrics.highestCPA.campaign}"`;
    }
    return {
      spend: overview.totalSpend,
      conversions: overview.totalConversions,
      cpa: advMetrics.cpa,
      bestCampaign,
      wasteSpend,
      recommendedAction,
    };
  }, [overview, advMetrics, wasteSpend]);

  // ───────────────────────────────────────────────────────────────────────────
  // LOADING SKELETONS
  // ───────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <MainLayout>
        <div className="min-h-screen bg-[#020617] px-4 py-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            {[...Array(8)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </MainLayout>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // RENDER
  // ───────────────────────────────────────────────────────────────────────────
  return (
    <MainLayout>
      <div className="min-h-screen bg-[#020617] px-4 py-3 sm:px-6 sm:py-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-5">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-emerald-400 text-[11px] font-bold tracking-widest uppercase">
                Live Marketing Intelligence
              </span>
              <span className="text-slate-700 text-xs">|</span>
              <span className="text-slate-500 text-xs">{advMetrics.activeCampaigns} active / {advMetrics.totalCampaigns} total campaigns</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white leading-tight sm:leading-none">
              Google Ads Command
            </h1>
            <p className="text-slate-500 mt-1 text-xs sm:text-sm">
              Director-level marketing intelligence & optimization platform
            </p>
          </div>
          <div className="flex flex-wrap items-stretch gap-3">
            {wasteSpend > 0 && (
              <div className="bg-red-950/50 border border-red-800/50 rounded-2xl px-4 py-3 text-right">
                <div className="text-[10px] text-red-400 font-bold uppercase tracking-widest">⚠ Waste Spend</div>
                <div className="text-red-300 font-black text-xl mt-0.5">{fmt.currency(wasteSpend)}</div>
              </div>
            )}
            <div className="bg-[#0c1425] border border-slate-800 rounded-2xl px-4 py-3 text-right">
              <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Perf. Score</div>
              <div className={`font-black text-xl mt-0.5 ${executiveScore >= 70 ? "text-emerald-400" : executiveScore >= 40 ? "text-amber-400" : "text-red-400"}`}>
                {executiveScore}<span className="text-sm text-slate-600">/100</span>
              </div>
            </div>
          </div>
        </div>

        {/* Date Range Filter */}
        <DateRangeFilter value={filters.dateRange} onChange={(range) => setFilters(f => ({ ...f, dateRange: range }))} />

        {/* Director Filter Strip */}
        <DirectorFilterStrip
          filters={filters}
          setFilters={setFilters}
          onClear={clearFilters}
          hasActiveFilters={hasActiveDirectorFilters}
        />

        {/* Row 1: Executive KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3 mb-5">
          <DirectorKPI label="Total Spend" value={fmt.currency(overview.totalSpend)} subValue={`${advMetrics.activeCampaigns} active`} accent="blue" />
          <DirectorKPI label="Total Clicks" value={fmt.num(overview.totalClicks)} subValue={`CTR ${advMetrics.ctr.toFixed(2)}%`} accent="violet" />
          <DirectorKPI label="Impressions" value={fmt.num(overview.totalImpressions)} subValue={`${advMetrics.totalCampaigns} campaigns`} accent="indigo" />
          <DirectorKPI label="Conversions" value={fmt.num(overview.totalConversions)} subValue={`CVR ${advMetrics.cvr.toFixed(2)}%`} accent="emerald" />
          <DirectorKPI label="Avg CPC" value={fmt.currency(advMetrics.cpc)} subValue="cost per click" accent="cyan" />
          <DirectorKPI label="Avg CPA" value={fmt.currency(advMetrics.cpa)} subValue="cost per acquisition" accent="amber" />
          <DirectorKPI label="CTR" value={fmt.pct(advMetrics.ctr)} subValue={advMetrics.ctr >= 2 ? "Above 2% target" : "Below 2% target"} accent={advMetrics.ctr >= 2 ? "emerald" : "red"} />
          <DirectorKPI label="Efficiency Index" value={advMetrics.efficiencyIndex.toFixed(3)} subValue="conv per ₹1K" accent="rose" />
        </div>

        {/* Row 2: Executive Summary Card */}
        <ExecutiveSummaryCard {...executiveSummary} />

        {/* Row 3: Spend vs Conversion Trend */}
        <div className="mb-5">
          <SpendTrendChart trends={filteredTrends} />
        </div>

        {/* Row 4: Campaign Efficiency Matrix (fixed with caps) */}
        <div className="mb-5">
          <CampaignEfficiencyMatrix campaigns={filteredCampaigns} />
        </div>

        {/* Row 5: Campaign Health */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
          <div className="bg-[#0c1425] border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white">Campaign Health</h3>
              <span className="text-[11px] text-slate-600">{advMetrics.totalCampaigns} total</span>
            </div>
            <div className="flex flex-col sm:flex-row gap-6 items-center">
              <div className="flex-1 space-y-3">
                <TierRow label="Elite  (≥ 8% CVR)" count={advMetrics.elite} total={advMetrics.totalCampaigns} dotColor="bg-emerald-500" />
                <TierRow label="Strong (5 – 8% CVR)" count={advMetrics.strong} total={advMetrics.totalCampaigns} dotColor="bg-blue-500" />
                <TierRow label="Average (2 – 5% CVR)" count={advMetrics.average} total={advMetrics.totalCampaigns} dotColor="bg-amber-400" />
                <TierRow label="Weak   (< 2% CVR)" count={advMetrics.weak} total={advMetrics.totalCampaigns} dotColor="bg-orange-500" />
                <TierRow label="No Conversions" count={advMetrics.noConv} total={advMetrics.totalCampaigns} dotColor="bg-red-500" />
                <div className="flex h-2 rounded-full overflow-hidden gap-px mt-2">
                  {advMetrics.elite > 0 && <div className="bg-emerald-500 transition-all" style={{ flex: advMetrics.elite }} />}
                  {advMetrics.strong > 0 && <div className="bg-blue-500 transition-all" style={{ flex: advMetrics.strong }} />}
                  {advMetrics.average > 0 && <div className="bg-amber-400 transition-all" style={{ flex: advMetrics.average }} />}
                  {advMetrics.weak > 0 && <div className="bg-orange-500 transition-all" style={{ flex: advMetrics.weak }} />}
                  {advMetrics.noConv > 0 && <div className="bg-red-500 transition-all" style={{ flex: advMetrics.noConv }} />}
                </div>
              </div>
              <HealthDonut elite={advMetrics.elite} strong={advMetrics.strong} average={advMetrics.average} weak={advMetrics.weak} noConv={advMetrics.noConv} total={advMetrics.totalCampaigns} />
            </div>
          </div>
          <ExecutiveScoreCard score={executiveScore} efficiencyIndex={advMetrics.efficiencyIndex.toFixed(1)} activeRate={((advMetrics.activeCampaigns / advMetrics.totalCampaigns) * 100).toFixed(0)} wasteSpend={wasteSpend} />
        </div>

        {/* Row 6: Opportunity Intelligence (Match Type + Waste Spend) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
          <MatchTypeAnalytics keywords={filteredKeywords} />
          <WasteSpendTrend trends={filteredTrends} />
        </div>

        {/* Row 7: Campaign Ranking Table */}
        <div className="mb-5">
          <CampaignRankingTable campaigns={filteredCampaigns} />
        </div>

        {/* Row 8: Recommendations Panel */}
        <div className="mb-5">
          <RecommendationPanel recommendations={recommendations} />
        </div>

        {/* AI Insights Panel (dynamic) */}
        <AIInsightsPanel
          campaigns={filteredCampaigns}
          topCampaign={advMetrics.topCampaign}
          worstCampaign={advMetrics.worstCampaign}
          highestCPA={advMetrics.highestCPA}
          wasteSpend={wasteSpend}
        />

        {/* Additional tables (optional) */}
        <div className="mb-5">
          <CampaignIntelligenceTable campaigns={filteredCampaigns} />
        </div>

        <NarrativeSummary overview={overview} campaigns={filteredCampaigns} wasteSpend={wasteSpend} performanceScore={executiveScore} />
      </div>
    </MainLayout>
  );
}