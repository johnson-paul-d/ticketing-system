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
// DIRECTOR KPI CARD
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
// HEALTH BADGE
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
// DIRECTOR FILTER STRIP
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
// AI INSIGHT CARD
// ─────────────────────────────────────────────────────────────────────────────
function AIInsightCard({ title, value, subtitle, icon, accent = "blue" }) {
  const a = ACCENT[accent];
  return (
    <div className={`bg-[#0c1425] border border-slate-800 rounded-xl p-3 ring-1 ${a.ring}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">{title}</div>
          <div className={`text-lg font-bold ${a.text} mt-1`}>{value}</div>
          {subtitle && <div className="text-[10px] text-slate-600 mt-0.5">{subtitle}</div>}
        </div>
        <div className={`text-xl ${a.text}`}>{icon}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EXECUTIVE WATERFALL
// ─────────────────────────────────────────────────────────────────────────────
function ExecutiveWaterfall({ totalSpend, wasteSpend, totalConversions }) {
  const effectiveSpend = totalSpend - wasteSpend;
  return (
    <div className="bg-[#0c1425] border border-slate-800 rounded-2xl p-5">
      <h3 className="text-sm font-bold text-white mb-4">Executive Waterfall</h3>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex-1 min-w-[120px] text-center">
          <div className="text-[10px] text-slate-500 uppercase">Total Spend</div>
          <div className="text-xl font-bold text-white">{fmt.currency(totalSpend)}</div>
        </div>
        <div className="text-slate-600 text-xl">↓</div>
        <div className="flex-1 min-w-[120px] text-center">
          <div className="text-[10px] text-slate-500 uppercase">Waste Spend</div>
          <div className="text-xl font-bold text-red-400">{fmt.currency(wasteSpend)}</div>
        </div>
        <div className="text-slate-600 text-xl">↓</div>
        <div className="flex-1 min-w-[120px] text-center">
          <div className="text-[10px] text-slate-500 uppercase">Effective Spend</div>
          <div className="text-xl font-bold text-emerald-400">{fmt.currency(effectiveSpend)}</div>
        </div>
        <div className="text-slate-600 text-xl">→</div>
        <div className="flex-1 min-w-[120px] text-center">
          <div className="text-[10px] text-slate-500 uppercase">Conversions</div>
          <div className="text-xl font-bold text-emerald-400">{fmt.num(totalConversions)}</div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
export default function GoogleAdsDashboard() {

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA (raw rows from backend)
  // ═══════════════════════════════════════════════════════════════════════════
  const {
    campaigns: rawCampaigns,
    keywords,
    trends: rawTrends,
    loading,
  } = useGoogleAdsData();

  // ═══════════════════════════════════════════════════════════════════════════
  // FILTERS STATE
  // ═══════════════════════════════════════════════════════════════════════════
  const DEFAULT_FILTERS = {
    campaign:        "All",
    year:            "All",
    month:           "All",
    matchType:       "All",
    performanceTier: "All",
    keywordSearch:   "",
    sortBy:          "cost",
    minSpend:        "",
    conversionMin:   "",
    cpaMax:          "",
    ctrMin:          "",
    impressionMin:   "",
    campaignStatus:  "All",
    metricFocus:     "All",
  };

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const clearFilters = () => setFilters(DEFAULT_FILTERS);
  const hasActiveDirectorFilters =
    filters.sortBy !== "cost" ||
    filters.minSpend ||
    filters.conversionMin ||
    filters.cpaMax ||
    filters.ctrMin ||
    filters.impressionMin ||
    filters.campaignStatus !== "All" ||
    filters.metricFocus !== "All";

  // ═══════════════════════════════════════════════════════════════════════════
  // UNIQUE CAMPAIGNS FOR DROPDOWN
  // ═══════════════════════════════════════════════════════════════════════════
  const uniqueCampaignsForFilter = useMemo(() => {
    const s = new Set();
    rawCampaigns.forEach((r) => { if (r.campaign) s.add(r.campaign); });
    return Array.from(s).map((name) => ({ campaign: name }));
  }, [rawCampaigns]);

  // ═══════════════════════════════════════════════════════════════════════════
  // AVAILABLE YEARS
  // ═══════════════════════════════════════════════════════════════════════════
  const availableYears = useMemo(() => {
    const years = new Set();
    rawCampaigns.forEach(row => {
      if (!row.report_date) return;
      years.add(new Date(row.report_date).getFullYear());
    });
    return [...years].sort();
  }, [rawCampaigns]);

  // ═══════════════════════════════════════════════════════════════════════════
  // MONTHS CONSTANT
  // ═══════════════════════════════════════════════════════════════════════════
  const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  // DATE FILTERING (year + month)
  // ═══════════════════════════════════════════════════════════════════════════
  const dateFilteredRows = useMemo(() => {
    let rows = [...rawCampaigns];

    if (filters.year !== "All") {
      rows = rows.filter(row => {
        return new Date(row.report_date).getFullYear().toString() === filters.year;
      });
    }

    if (filters.month !== "All") {
      rows = rows.filter(row => {
        return new Date(row.report_date).getMonth() === Number(filters.month);
      });
    }

    return rows;
  }, [rawCampaigns, filters.year, filters.month]);

  // ═══════════════════════════════════════════════════════════════════════════
  // CAMPAIGN FILTERING (NORMALIZED)
  // ═══════════════════════════════════════════════════════════════════════════
  const campaignFilteredRows = useMemo(() => {
    if (filters.campaign === "All") {
      return dateFilteredRows;
    }

    const normalizedFilterCampaign = String(filters.campaign || "")
      .trim()
      .toLowerCase();

    return dateFilteredRows.filter(
      r =>
        String(r.campaign || "")
          .trim()
          .toLowerCase() === normalizedFilterCampaign
    );
  }, [dateFilteredRows, filters.campaign]);

  // ═══════════════════════════════════════════════════════════════════════════
  // AGGREGATION (group by campaign)
  // ═══════════════════════════════════════════════════════════════════════════
  const aggregatedCampaigns = useMemo(() => {
    const map = new Map();
    campaignFilteredRows.forEach((row) => {
      const name = row.campaign;
      if (!name) return;
      if (!map.has(name))
        map.set(name, { campaign: name, cost: 0, clicks: 0, impressions: 0, conversions: 0 });
      const a = map.get(name);
      a.cost        += Number(row.cost)        || 0;
      a.clicks      += Number(row.clicks)      || 0;
      a.impressions += Number(row.impressions) || 0;
      a.conversions += Number(row.conversions) || 0;
    });
    return Array.from(map.values()).map((c) => {
      const ctr = c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0;
      const conversion_rate = c.clicks > 0 ? (c.conversions / c.clicks) * 100 : 0;
      const avg_cpc = c.clicks > 0 ? c.cost / c.clicks : 0;
      const cpa = c.conversions > 0 ? c.cost / c.conversions : 0;
      const efficiency = (ctr * conversion_rate) / Math.max(avg_cpc, 1);
      return { ...c, ctr, conversion_rate, avg_cpc, cpa, efficiency };
    });
  }, [campaignFilteredRows]);

  // ═══════════════════════════════════════════════════════════════════════════
  // DASHBOARD KPIs
  // ═══════════════════════════════════════════════════════════════════════════
  const dashboardOverview = useMemo(() => {
    let totalSpend = 0, totalClicks = 0, totalImpressions = 0, totalConversions = 0;
    campaignFilteredRows.forEach((r) => {
      totalSpend       += Number(r.cost)        || 0;
      totalClicks      += Number(r.clicks)      || 0;
      totalImpressions += Number(r.impressions) || 0;
      totalConversions += Number(r.conversions) || 0;
    });
    return { totalSpend, totalClicks, totalImpressions, totalConversions };
  }, [campaignFilteredRows]);

  // ═══════════════════════════════════════════════════════════════════════════
  // FILTERED TRENDS (normalized + year/month)
  // ═══════════════════════════════════════════════════════════════════════════
  const filteredTrends = useMemo(() => {
    console.log("Selected Campaign:", filters.campaign);
    console.log("First Trend Row:", rawTrends?.[0]);

    let rows = [...(rawTrends || [])];

    if (filters.campaign !== "All") {
      const before = rows.length;
      rows = rows.filter(
        r =>
          String(r.campaign || "")
            .trim()
            .toLowerCase() ===
          String(filters.campaign || "")
            .trim()
            .toLowerCase()
      );
      console.log("Trend rows before campaign filter:", before, "after:", rows.length);
    }

    if (filters.year !== "All") {
      rows = rows.filter(
        r => new Date(r.report_date).getFullYear().toString() === filters.year
      );
    }

    if (filters.month !== "All") {
      rows = rows.filter(
        r => new Date(r.report_date).getMonth() === Number(filters.month)
      );
    }

    console.log("Final filteredTrends length:", rows.length);
    return rows;
  }, [rawTrends, filters.campaign, filters.year, filters.month]);

  // ═══════════════════════════════════════════════════════════════════════════
  // EXECUTIVE METRICS
  // ═══════════════════════════════════════════════════════════════════════════
  const {
    wasteSpend,
    zeroConversionDays,
    performanceScore,
    recommendations,
  } = useExecutiveMetrics({
    overview: dashboardOverview,
    campaigns: aggregatedCampaigns,
    rows: campaignFilteredRows,
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // KEYWORD FILTERING (normalized campaign matching)
  // ═══════════════════════════════════════════════════════════════════════════
  const filteredKeywords = useMemo(() => {
    let filtered = [...keywords];
    if (filters.matchType !== "All") {
      filtered = filtered.filter(kw => kw.match_type === filters.matchType);
    }
    if (filters.keywordSearch) {
      filtered = filtered.filter(kw => kw.keyword?.toLowerCase().includes(filters.keywordSearch.toLowerCase()));
    }
    if (filters.campaign !== "All") {
      filtered = filtered.filter(
        kw =>
          String(kw.campaign || "")
            .trim()
            .toLowerCase() ===
          String(filters.campaign || "")
            .trim()
            .toLowerCase()
      );
    }
    return filtered;
  }, [keywords, filters.matchType, filters.keywordSearch, filters.campaign]);

  // ═══════════════════════════════════════════════════════════════════════════
  // ADVANCED DIRECTOR METRICS
  // ═══════════════════════════════════════════════════════════════════════════
  const adv = useMemo(() => {
    const { totalSpend, totalClicks, totalImpressions, totalConversions } = dashboardOverview;

    const ctr = totalImpressions > 0 ? (totalClicks  / totalImpressions) * 100 : 0;
    const cpc = totalClicks      > 0 ? totalSpend    / totalClicks             : 0;
    const cpa = totalConversions > 0 ? totalSpend    / totalConversions        : 0;
    const cvr = totalClicks      > 0 ? (totalConversions / totalClicks)  * 100 : 0;
    const efficiencyIndex = totalSpend > 0 ? (totalConversions / totalSpend) * 1000 : 0;

    const activeCampaigns = aggregatedCampaigns.filter((c) => c.cost > 0).length;
    const totalCampaigns  = aggregatedCampaigns.length;

    // Tier classification
    const elite   = aggregatedCampaigns.filter((c) => c.clicks > 0 && c.conversions / c.clicks >= 0.08).length;
    const strong  = aggregatedCampaigns.filter((c) => { const r = c.clicks > 0 ? c.conversions / c.clicks : 0; return r >= 0.05 && r < 0.08; }).length;
    const average = aggregatedCampaigns.filter((c) => { const r = c.clicks > 0 ? c.conversions / c.clicks : 0; return r >= 0.02 && r < 0.05; }).length;
    const weak    = aggregatedCampaigns.filter((c) => c.cost > 0 && c.conversions > 0 && c.clicks > 0 && c.conversions / c.clicks < 0.02).length;
    const noConv  = aggregatedCampaigns.filter((c) => c.cost > 0 && c.conversions === 0).length;

    const sorted       = [...aggregatedCampaigns];
    const topCampaign  = [...sorted].sort((a, b) => b.conversions - a.conversions)[0];
    const highestSpend = [...sorted].sort((a, b) => b.cost - a.cost)[0];
    const worstCampaign = [...sorted].filter(c => c.cost > 0 && c.conversions === 0).sort((a, b) => b.cost - a.cost)[0] ||
                          [...sorted].filter(c => c.conversions > 0).sort((a, b) => (a.cost / a.conversions) - (b.cost / b.conversions))[0];
    const highestCPA = [...sorted].filter(c => c.conversions > 0).sort((a, b) => (b.cost / b.conversions) - (a.cost / a.conversions))[0];

    const topSpendShare = totalSpend > 0 && highestSpend ? (highestSpend.cost / totalSpend) * 100 : 0;

    const convCampaigns = aggregatedCampaigns.filter((c) => c.conversions > 0);
    const avgCampaignCPA = convCampaigns.length > 0
      ? convCampaigns.reduce((s, c) => s + c.cost / c.conversions, 0) / convCampaigns.length
      : 0;

    return {
      ctr, cpc, cpa, cvr, efficiencyIndex,
      activeCampaigns, totalCampaigns,
      elite, strong, average, weak, noConv,
      topCampaign, highestSpend, worstCampaign, highestCPA,
      topSpendShare, avgCampaignCPA,
    };
  }, [dashboardOverview, aggregatedCampaigns]);

  // ═══════════════════════════════════════════════════════════════════════════
  // DIRECTOR CAMPAIGNS (filtered + sorted)
  // ═══════════════════════════════════════════════════════════════════════════
  const directorCampaigns = useMemo(() => {
    let result = [...aggregatedCampaigns];

    const minSpendVal   = parseFloat(filters.minSpend)     || 0;
    const convMinVal    = parseFloat(filters.conversionMin) || 0;
    const cpaMaxVal     = parseFloat(filters.cpaMax)        || 0;
    const ctrMinVal     = parseFloat(filters.ctrMin)        || 0;
    const imprMinVal    = parseFloat(filters.impressionMin) || 0;

    if (minSpendVal  > 0) result = result.filter((c) => c.cost >= minSpendVal);
    if (convMinVal   > 0) result = result.filter((c) => c.conversions >= convMinVal);
    if (imprMinVal   > 0) result = result.filter((c) => c.impressions >= imprMinVal);
    if (cpaMaxVal    > 0) result = result.filter((c) => c.conversions > 0 && (c.cost / c.conversions) <= cpaMaxVal);
    if (ctrMinVal    > 0) result = result.filter((c) => c.impressions > 0 && (c.clicks / c.impressions) * 100 >= ctrMinVal);

    if (filters.campaignStatus === "Active") {
      result = result.filter((c) => c.cost > 0);
    } else if (filters.campaignStatus === "Top Performer") {
      result = result.filter((c) => c.clicks > 0 && c.conversions / c.clicks >= 0.05);
    } else if (filters.campaignStatus === "Underperforming") {
      result = result.filter((c) => c.cost > 0 && (c.conversions === 0 || (c.clicks > 0 && c.conversions / c.clicks < 0.01)));
    } else if (filters.campaignStatus === "Efficient") {
      result = result.filter((c) => c.conversions > 0 && c.cost / c.conversions < adv.cpa);
    } else if (filters.campaignStatus === "No Conversions") {
      result = result.filter((c) => c.cost > 0 && c.conversions === 0);
    }

    if (filters.metricFocus === "Spend") {
      result = result.filter((c) => c.cost > 0);
    } else if (filters.metricFocus === "Conversion") {
      result = result.filter((c) => c.conversions > 0);
    } else if (filters.metricFocus === "Efficiency") {
      result = result.filter((c) => c.clicks > 0 && c.conversions / c.clicks >= 0.03);
    }

    return result.sort((a, b) => {
      switch (filters.sortBy) {
        case "clicks":      return b.clicks - a.clicks;
        case "conversions": return b.conversions - a.conversions;
        case "impressions": return b.impressions - a.impressions;
        case "ctr": {
          const ctrA = a.impressions > 0 ? a.clicks / a.impressions : 0;
          const ctrB = b.impressions > 0 ? b.clicks / b.impressions : 0;
          return ctrB - ctrA;
        }
        case "cpa": {
          const cpaA = a.conversions > 0 ? a.cost / a.conversions : Infinity;
          const cpaB = b.conversions > 0 ? b.cost / b.conversions : Infinity;
          return cpaA - cpaB;
        }
        case "efficiency": {
          const eA = a.cost > 0 ? a.conversions / a.cost : 0;
          const eB = b.cost > 0 ? b.conversions / b.cost : 0;
          return eB - eA;
        }
        default: return b.cost - a.cost;
      }
    });
  }, [aggregatedCampaigns, filters, adv.cpa]);

  // ═══════════════════════════════════════════════════════════════════════════
  // MOVED HOOKS & DERIVED VALUES
  // ═══════════════════════════════════════════════════════════════════════════
  const maxCost = Math.max(
    ...(directorCampaigns || []).map((c) => Number(c.cost || 0)),
    1
  );
  const totalCampaigns = adv.totalCampaigns;

  const budgetAllocationData = useMemo(() => {
    const totalSpend = dashboardOverview.totalSpend;
    const totalConversions = dashboardOverview.totalConversions;
    return aggregatedCampaigns.map(c => ({
      ...c,
      spendShare: totalSpend > 0 ? (c.cost / totalSpend) * 100 : 0,
      convShare: totalConversions > 0 ? (c.conversions / totalConversions) * 100 : 0,
    })).sort((a, b) => b.spendShare - a.spendShare);
  }, [aggregatedCampaigns, dashboardOverview]);

  const scaleOpportunity = adv.topCampaign ? Math.round(adv.topCampaign.conversions * 0.23) : 0;

  const topSpendCampaigns = [...aggregatedCampaigns].sort((a, b) => b.cost - a.cost).slice(0, 10);

  // ═══════════════════════════════════════════════════════════════════════════
  // LOADING EARLY RETURN
  // ═══════════════════════════════════════════════════════════════════════════
  if (loading) {
    return (
      <MainLayout>
        <div className="min-h-screen bg-[#020617] flex items-center justify-center">
          <div className="text-center">
            <div className="w-14 h-14 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-5" />
            <h2 className="text-white text-2xl font-bold">Loading Intelligence</h2>
            <p className="text-slate-400 mt-2">Processing executive analytics...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER (fully responsive)
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <MainLayout>
      <div className="min-h-screen bg-[#020617] px-4 py-3 sm:px-6 sm:py-5">

        {/* Director Command Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-5">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-emerald-400 text-[11px] font-bold tracking-widest uppercase">
                Live Marketing Intelligence
              </span>
              <span className="text-slate-700 text-xs">|</span>
              <span className="text-slate-500 text-xs">{adv.activeCampaigns} active / {adv.totalCampaigns} total campaigns</span>
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
              <div className={`font-black text-xl mt-0.5 ${performanceScore >= 70 ? "text-emerald-400" : performanceScore >= 40 ? "text-amber-400" : "text-red-400"}`}>
                {performanceScore ?? "—"}<span className="text-sm text-slate-600">/100</span>
              </div>
            </div>
            <div className="bg-[#0c1425] border border-slate-800 rounded-2xl px-4 py-3">
              <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Last Updated</div>
              <div className="text-white font-semibold mt-0.5">Real-Time</div>
            </div>
          </div>
        </div>

        {/* Director Alert Bar - responsive wrap */}
        {(adv.noConv > 0 || adv.elite > 0 || adv.topSpendShare > 60 || adv.cvr > 5) && (
          <div className="flex flex-wrap items-center gap-2 mb-5">
            {adv.noConv > 0 && (
              <div className="flex items-center gap-2 bg-red-950/40 border border-red-800/40 rounded-xl px-3.5 py-2 text-xs text-red-300 whitespace-nowrap shrink-0">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                <strong>{adv.noConv}</strong> campaigns with zero conversions — review budget allocation
              </div>
            )}
            {adv.elite > 0 && (
              <div className="flex items-center gap-2 bg-emerald-950/40 border border-emerald-800/40 rounded-xl px-3.5 py-2 text-xs text-emerald-300 whitespace-nowrap shrink-0">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                <strong>{adv.elite}</strong> elite-tier campaigns — consider scaling budget
              </div>
            )}
            {adv.topSpendShare > 60 && (
              <div className="flex items-center gap-2 bg-amber-950/40 border border-amber-800/40 rounded-xl px-3.5 py-2 text-xs text-amber-300 whitespace-nowrap shrink-0">
                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                Budget concentration: top campaign holds <strong>{adv.topSpendShare.toFixed(0)}%</strong> of total spend
              </div>
            )}
            {adv.cvr > 5 && (
              <div className="flex items-center gap-2 bg-blue-950/40 border border-blue-800/40 rounded-xl px-3.5 py-2 text-xs text-blue-300 whitespace-nowrap shrink-0">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                Conversion rate <strong>{adv.cvr.toFixed(1)}%</strong> — above industry benchmark
              </div>
            )}
            {adv.ctr < 1 && dashboardOverview.totalImpressions > 0 && (
              <div className="flex items-center gap-2 bg-orange-950/40 border border-orange-800/40 rounded-xl px-3.5 py-2 text-xs text-orange-300 whitespace-nowrap shrink-0">
                <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse" />
                CTR <strong>{adv.ctr.toFixed(2)}%</strong> is below 1% — ad copy review recommended
              </div>
            )}
          </div>
        )}

        {/* ───────────────────────────────────────────────────────────────────── */}
        {/* Director 12‑KPI Strip – New Executive Layout                          */}
        {/* Row1: Spend | Clicks | Impressions | Conversions                      */}
        {/* Row2: Avg CPC | Avg CPA | CTR | Efficiency Index                      */}
        {/* Row3: Campaign Health (wide) | Waste Spend (wide) | Zero Conv | Top   */}
        {/* ───────────────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3 mb-5">
          {/* ROW 1 */}
          <DirectorKPI
            label="Total Spend"
            value={fmt.currency(dashboardOverview.totalSpend)}
            subValue={`${adv.activeCampaigns} active campaigns`}
            accent="blue"
          />
          <DirectorKPI
            label="Total Clicks"
            value={fmt.num(dashboardOverview.totalClicks)}
            subValue={`CTR ${adv.ctr.toFixed(2)}%`}
            accent="violet"
          />
          <DirectorKPI
            label="Impressions"
            value={fmt.num(dashboardOverview.totalImpressions)}
            subValue={`${adv.totalCampaigns} campaigns`}
            accent="indigo"
          />
          <DirectorKPI
            label="Conversions"
            value={fmt.num(dashboardOverview.totalConversions)}
            subValue={`CVR ${adv.cvr.toFixed(2)}%`}
            accent="emerald"
          />

          {/* ROW 2 */}
          <DirectorKPI
            label="Avg CPC"
            value={fmt.currency(adv.cpc)}
            subValue="cost per click"
            accent="cyan"
          />
          <DirectorKPI
            label="Avg CPA"
            value={fmt.currency(adv.cpa)}
            subValue="cost per acquisition"
            accent="amber"
          />
          <DirectorKPI
            label="CTR"
            value={fmt.pct(adv.ctr)}
            subValue={adv.ctr >= 2 ? "Above 2% target" : "Below 2% target"}
            accent={adv.ctr >= 2 ? "emerald" : "red"}
          />
          <DirectorKPI
            label="Efficiency Index"
            value={adv.efficiencyIndex.toFixed(3)}
            subValue="conversions per ₹1K"
            accent="rose"
          />

          {/* ROW 3 – wide cards for Campaign Health & Waste Spend */}
          <DirectorKPI
            className="xl:col-span-2"
            label="Campaign Health"
            value={`${performanceScore}/100`}
            accent="emerald"
          />
          <DirectorKPI
            className="xl:col-span-2"
            label="Waste Spend"
            value={fmt.currency(wasteSpend)}
            accent="red"
          />

          {/* Custom Zero Conv Days card */}
          <div className="relative bg-[#0c1425] border border-slate-800/80 rounded-2xl p-4 ring-1 ring-red-500/20 overflow-hidden flex flex-col gap-1">
            <div className="absolute inset-0 bg-gradient-to-br from-red-900/30 to-transparent opacity-60 pointer-events-none" />
            <span className="relative text-[10px] font-semibold text-slate-500 uppercase tracking-widest leading-none">
              Zero Conv Days
            </span>
            <span className="relative text-2xl font-black leading-tight text-red-400">
              {zeroConversionDays}
            </span>
            <div className="relative flex items-center justify-between mt-0.5">
              <span className="text-[11px] text-slate-600">
                days with spend but no conversions
              </span>
            </div>
          </div>

          <DirectorKPI
            label="Top Campaign"
            value={adv.topCampaign?.conversions || 0}
            subValue="conversions"
            accent="cyan"
          />
        </div>

        {/* Original Executive Filters (dateRange removed from logic but component still receives it – no effect) */}
        <ExecutiveFilters
          filters={filters}
          setFilters={setFilters}
          clearFilters={clearFilters}
          campaigns={uniqueCampaignsForFilter}
        />

        {/* NEW: Year + Month Filters (Step 4 - UI addition) */}
        <div className="flex flex-wrap items-center gap-3 mb-5 bg-[#0c1425] border border-slate-800/60 rounded-xl p-3">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Time Period</span>
          <select
            value={filters.year}
            onChange={(e) => setFilters(f => ({ ...f, year: e.target.value }))}
            className="bg-transparent text-xs text-white border border-slate-700 rounded-lg px-3 py-2 outline-none"
          >
            <option value="All">All Years</option>
            {availableYears.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
          <select
            value={filters.month}
            onChange={(e) => setFilters(f => ({ ...f, month: e.target.value }))}
            className="bg-transparent text-xs text-white border border-slate-700 rounded-lg px-3 py-2 outline-none"
          >
            <option value="All">All Months</option>
            {MONTHS.map((month, idx) => (
              <option key={month} value={idx}>{month}</option>
            ))}
          </select>
        </div>

        {/* Director Filter Strip */}
        <DirectorFilterStrip
          filters={filters}
          setFilters={setFilters}
          onClear={clearFilters}
          hasActiveFilters={hasActiveDirectorFilters}
        />

        {/* Original KPI Grid */}
        <KPIGrid overview={dashboardOverview} wasteSpend={wasteSpend} zeroConversionDays={zeroConversionDays} />

        {/* Director Insights Row - responsive grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          {/* Top Converter Spotlight */}
          <div className="bg-[#0c1425] border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white">Top Converter</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-950/80 text-emerald-400 ring-1 ring-emerald-600/40">Best</span>
            </div>
            {adv.topCampaign ? (
              <>
                <div className="text-sm font-semibold text-white mb-3 truncate" title={adv.topCampaign.campaign}>
                  {adv.topCampaign.campaign}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { lbl: "Conversions", val: adv.topCampaign.conversions.toLocaleString(), color: "text-emerald-400" },
                    { lbl: "CVR",         val: adv.topCampaign.clicks > 0 ? fmt.pct((adv.topCampaign.conversions / adv.topCampaign.clicks) * 100) : "0%", color: "text-emerald-400" },
                    { lbl: "Spend",       val: fmt.currency(adv.topCampaign.cost), color: "text-slate-300" },
                    { lbl: "CPA",         val: adv.topCampaign.conversions > 0 ? fmt.currency(adv.topCampaign.cost / adv.topCampaign.conversions) : "—", color: "text-slate-300" },
                  ].map(({ lbl, val, color }) => (
                    <div key={lbl} className="bg-slate-800/40 rounded-xl p-2.5">
                      <div className="text-[10px] text-slate-500 mb-1">{lbl}</div>
                      <div className={`text-sm font-bold ${color}`}>{val}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-slate-600 text-sm">No data</p>
            )}
          </div>

          {/* Highest Spend Spotlight */}
          <div className="bg-[#0c1425] border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white">Highest Spend</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-950/80 text-amber-400 ring-1 ring-amber-600/40">Budget</span>
            </div>
            {adv.highestSpend ? (
              <>
                <div className="text-sm font-semibold text-white mb-3 truncate" title={adv.highestSpend.campaign}>
                  {adv.highestSpend.campaign}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { lbl: "Spend",       val: fmt.currency(adv.highestSpend.cost), color: "text-amber-400" },
                    { lbl: "% of Total",  val: `${adv.topSpendShare.toFixed(0)}%`, color: "text-amber-400" },
                    { lbl: "Conversions", val: adv.highestSpend.conversions.toLocaleString(), color: "text-slate-300" },
                    { lbl: "CPA",         val: adv.highestSpend.conversions > 0 ? fmt.currency(adv.highestSpend.cost / adv.highestSpend.conversions) : "No Conv", color: "text-slate-300" },
                  ].map(({ lbl, val, color }) => (
                    <div key={lbl} className="bg-slate-800/40 rounded-xl p-2.5">
                      <div className="text-[10px] text-slate-500 mb-1">{lbl}</div>
                      <div className={`text-sm font-bold ${color}`}>{val}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-slate-600 text-sm">No data</p>
            )}
          </div>

          {/* Key Ratios Panel */}
          <div className="bg-[#0c1425] border border-slate-800 rounded-2xl p-5">
            <h3 className="text-sm font-bold text-white mb-4">Key Ratios</h3>
            <div className="space-y-3">
              {[
                { label: "CTR",            value: fmt.pct(adv.ctr),               bench: "≥ 2%",  ok: adv.ctr >= 2    },
                { label: "CVR",            value: fmt.pct(adv.cvr),               bench: "≥ 3%",  ok: adv.cvr >= 3    },
                { label: "CPC",            value: fmt.currency(adv.cpc),          bench: "cost",  ok: true             },
                { label: "CPA",            value: fmt.currency(adv.cpa),          bench: "acq.",  ok: true             },
                { label: "Efficiency Idx", value: adv.efficiencyIndex.toFixed(3), bench: "≥ 1.0", ok: adv.efficiencyIndex >= 1 },
              ].map(({ label, value, bench, ok }) => (
                <div key={label} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs text-slate-400 leading-none">{label}</div>
                    <div className="text-[10px] text-slate-700 mt-0.5">{bench}</div>
                  </div>
                  <span className={`text-sm font-bold shrink-0 ${ok ? "text-white" : "text-amber-400"}`}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Campaign Performance Matrix Table - responsive overflow */}
        <div className="bg-[#0c1425] border border-slate-800 rounded-2xl mb-4 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-4 border-b border-slate-800 gap-2">
            <div>
              <h3 className="text-sm font-bold text-white">Campaign Performance Matrix</h3>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Sorted by <span className="text-slate-400">{filters.sortBy}</span> · {directorCampaigns.length} of {totalCampaigns} campaigns
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
              {[["bg-emerald-500","Elite"],["bg-blue-500","Strong"],["bg-amber-400","Avg"],["bg-orange-500","Weak"],["bg-red-500","No Conv"]].map(([dot, lbl]) => (
                <span key={lbl} className="flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${dot}`} />
                  {lbl}
                </span>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[800px]">
              <thead>
                <tr className="text-slate-600 text-[10px] uppercase tracking-wide border-b border-slate-800/50">
                  <th className="text-left px-5 py-3 font-semibold">Campaign</th>
                  <th className="text-right px-4 py-3 font-semibold">Spend</th>
                  <th className="text-right px-4 py-3 font-semibold">Clicks</th>
                  <th className="text-right px-4 py-3 font-semibold">Impr.</th>
                  <th className="text-right px-4 py-3 font-semibold">CTR</th>
                  <th className="text-right px-4 py-3 font-semibold">Conv.</th>
                  <th className="text-right px-4 py-3 font-semibold">CVR</th>
                  <th className="text-right px-4 py-3 font-semibold">CPA</th>
                  <th className="text-right px-4 py-3 font-semibold">CPC</th>
                  <th className="px-5 py-3 font-semibold">Spend</th>
                  <th className="text-center px-4 py-3 font-semibold">Health</th>
                </tr>
              </thead>
              <tbody>
                {directorCampaigns.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="text-center py-10 text-slate-600 text-sm">
                      No campaigns match the current filters
                    </td>
                  </tr>
                ) : (
                  directorCampaigns.map((c) => {
                    const ctr = c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0;
                    const cvr = c.clicks      > 0 ? (c.conversions / c.clicks)  * 100 : 0;
                    const cpa = c.conversions > 0 ? c.cost / c.conversions : null;
                    const cpc = c.clicks      > 0 ? c.cost / c.clicks      : null;
                    const barColor = cvr >= 5 ? "emerald" : cvr >= 2 ? "blue" : cvr >= 1 ? "amber" : "red";

                    return (
                      <tr key={c.campaign} className="border-b border-slate-800/30 hover:bg-slate-800/20 transition-colors">
                        <td className="px-5 py-3 text-white font-medium max-w-[220px] truncate" title={c.campaign}>
                          {c.campaign}
                        </td>
                        <td className="text-right px-4 py-3 text-slate-300 font-mono">{fmt.currency(c.cost)}</td>
                        <td className="text-right px-4 py-3 text-slate-300">{fmt.num(c.clicks)}</td>
                        <td className="text-right px-4 py-3 text-slate-500">{fmt.num(c.impressions)}</td>
                        <td className={`text-right px-4 py-3 font-semibold ${ctr >= 2 ? "text-emerald-400" : ctr >= 1 ? "text-amber-400" : "text-red-400"}`}>
                          {ctr.toFixed(2)}%
                        </td>
                        <td className="text-right px-4 py-3 text-slate-300">{c.conversions.toLocaleString()}</td>
                        <td className={`text-right px-4 py-3 font-semibold ${cvr >= 5 ? "text-emerald-400" : cvr >= 2 ? "text-blue-400" : cvr >= 1 ? "text-amber-400" : "text-red-400"}`}>
                          {cvr.toFixed(2)}%
                        </td>
                        <td className="text-right px-4 py-3 text-slate-300 font-mono">
                          {cpa !== null ? fmt.currency(cpa) : <span className="text-slate-700">—</span>}
                        </td>
                        <td className="text-right px-4 py-3 text-slate-500 font-mono">
                          {cpc !== null ? fmt.currency(cpc) : <span className="text-slate-700">—</span>}
                        </td>
                        <td className="px-5 py-3">
                          <MiniBar value={c.cost} max={maxCost} color={barColor} />
                        </td>
                        <td className="text-center px-4 py-3">
                          <HealthBadge cvr={cvr / 100} spend={c.cost} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Budget Allocation Matrix */}
        <div className="bg-[#0c1425] border border-slate-800 rounded-2xl mb-4 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800">
            <h3 className="text-sm font-bold text-white">Budget Allocation Matrix</h3>
            <p className="text-[11px] text-slate-600 mt-0.5">Spend Share vs Conversion Share — identify over/under-performing investments</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[600px]">
              <thead>
                <tr className="text-slate-600 text-[10px] uppercase tracking-wide border-b border-slate-800/50">
                  <th className="text-left px-5 py-3 font-semibold">Campaign</th>
                  <th className="text-right px-4 py-3 font-semibold">Spend Share</th>
                  <th className="text-right px-4 py-3 font-semibold">Conv Share</th>
                  <th className="px-5 py-3 font-semibold">Efficiency Gap</th>
                \).
              </thead>
              <tbody>
                {budgetAllocationData.slice(0, 10).map((c) => {
                  const gap = c.convShare - c.spendShare;
                  const isEfficient = gap > 0;
                  return (
                    <tr key={c.campaign} className="border-b border-slate-800/30 hover:bg-slate-800/20 transition-colors">
                      <td className="px-5 py-3 text-white font-medium max-w-[220px] truncate" title={c.campaign}>
                        {c.campaign}
                      </td>
                      <td className="text-right px-4 py-3 font-mono">
                        <span className="text-slate-300">{c.spendShare.toFixed(1)}%</span>
                        <div className="w-24 h-1.5 bg-slate-800 rounded-full mt-1 ml-auto">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(c.spendShare, 100)}%` }} />
                        </div>
                      </td>
                      <td className="text-right px-4 py-3 font-mono">
                        <span className="text-slate-300">{c.convShare.toFixed(1)}%</span>
                        <div className="w-24 h-1.5 bg-slate-800 rounded-full mt-1 ml-auto">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(c.convShare, 100)}%` }} />
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-[11px] font-semibold ${isEfficient ? "text-emerald-400" : "text-red-400"}`}>
                          {isEfficient ? `▲ +${gap.toFixed(1)}%` : `▼ ${gap.toFixed(1)}%`}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Campaign Health Donut + Executive Score Card - responsive */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <div className="bg-[#0c1425] border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white">Campaign Health</h3>
              <span className="text-[11px] text-slate-600">{adv.totalCampaigns} total</span>
            </div>
            <div className="flex flex-col sm:flex-row gap-6 items-center">
              <div className="flex-1 space-y-3">
                <TierRow label="Elite  (≥ 8% CVR)"  count={adv.elite}   total={adv.totalCampaigns} dotColor="bg-emerald-500" />
                <TierRow label="Strong (5 – 8% CVR)" count={adv.strong}  total={adv.totalCampaigns} dotColor="bg-blue-500"    />
                <TierRow label="Average (2 – 5% CVR)"count={adv.average} total={adv.totalCampaigns} dotColor="bg-amber-400"   />
                <TierRow label="Weak   (< 2% CVR)"   count={adv.weak}    total={adv.totalCampaigns} dotColor="bg-orange-500"  />
                <TierRow label="No Conversions"       count={adv.noConv}  total={adv.totalCampaigns} dotColor="bg-red-500"     />
                <div className="flex h-2 rounded-full overflow-hidden gap-px mt-2">
                  {adv.elite   > 0 && <div className="bg-emerald-500 transition-all" style={{ flex: adv.elite }}   />}
                  {adv.strong  > 0 && <div className="bg-blue-500 transition-all"    style={{ flex: adv.strong }}  />}
                  {adv.average > 0 && <div className="bg-amber-400 transition-all"   style={{ flex: adv.average }} />}
                  {adv.weak    > 0 && <div className="bg-orange-500 transition-all"  style={{ flex: adv.weak }}    />}
                  {adv.noConv  > 0 && <div className="bg-red-500 transition-all"     style={{ flex: adv.noConv }}  />}
                </div>
              </div>
              <HealthDonut
                elite={adv.elite}
                strong={adv.strong}
                average={adv.average}
                weak={adv.weak}
                noConv={adv.noConv}
                total={adv.totalCampaigns}
              />
            </div>
          </div>
          <ExecutiveScoreCard score={performanceScore} />
        </div>

        {/* Campaign Efficiency Matrix */}
        <div className="mb-4">
          <CampaignEfficiencyMatrix campaigns={directorCampaigns} />
        </div>

        {/* Match Type + Waste Spend - responsive */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <MatchTypeAnalytics keywords={filteredKeywords} />
          <WasteSpendTrend trends={filteredTrends} />
        </div>

        {/* Spend Trend + Forecast - responsive */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <SpendTrendChart trends={filteredTrends} />
          <ForecastChart trends={filteredTrends} />
        </div>

        {/* Executive Waterfall */}
        <div className="mb-4">
          <ExecutiveWaterfall
            totalSpend={dashboardOverview.totalSpend}
            wasteSpend={wasteSpend}
            totalConversions={dashboardOverview.totalConversions}
          />
        </div>

        {/* Campaign Ranking + Opportunity Table - responsive */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <CampaignRankingTable campaigns={directorCampaigns} />
          <OpportunityTable campaigns={directorCampaigns} />
        </div>

        {/* Campaign Spend Distribution */}
        <div className="bg-[#0c1425] border border-slate-800 rounded-2xl mb-4 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800">
            <h3 className="text-sm font-bold text-white">Campaign Spend Distribution</h3>
            <p className="text-[11px] text-slate-600 mt-0.5">Top 10 campaigns by spend — identifies budget concentration</p>
          </div>
          <div className="p-5">
            {topSpendCampaigns.map((campaign, idx) => {
              const pct = (campaign.cost / dashboardOverview.totalSpend) * 100;
              return (
                <div key={campaign.campaign} className="mb-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs mb-1 gap-1">
                    <span className="text-slate-400 truncate max-w-[200px]">{campaign.campaign}</span>
                    <span className="text-slate-500 font-mono">{fmt.currency(campaign.cost)} ({pct.toFixed(1)}%)</span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-500 to-violet-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* AI Insights Row - responsive */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
          <AIInsightCard title="Best Campaign" value={adv.topCampaign?.campaign?.split(' ').slice(0,2).join(' ') || "—"} subtitle={`${adv.topCampaign?.conversions || 0} conversions`} icon="🏆" accent="emerald" />
          <AIInsightCard title="Search Campaign" value="Brand + Non-Brand" subtitle="Split 65% / 35%" icon="🔍" accent="blue" />
          <AIInsightCard title="Worst Campaign" value={adv.worstCampaign?.campaign?.split(' ').slice(0,2).join(' ') || "—"} subtitle={`${fmt.currency(adv.worstCampaign?.cost || 0)} spent, 0 conv`} icon="⚠️" accent="red" />
          <AIInsightCard title="Brand Campaign" value="Protect share" subtitle="CTR 8.2% vs 3.1%" icon="🛡️" accent="indigo" />
          <AIInsightCard title="Highest CPA" value={adv.highestCPA ? fmt.currency(adv.highestCPA.cost / adv.highestCPA.conversions) : "—"} subtitle={adv.highestCPA?.campaign?.split(' ').slice(0,2).join(' ') || ""} icon="💰" accent="amber" />
          <AIInsightCard title="Scale Opportunity" value={`+${scaleOpportunity}`} subtitle="conversions possible" icon="📈" accent="cyan" />
        </div>

        {/* Recommendations */}
        <div className="mb-4">
          <RecommendationPanel recommendations={recommendations} />
        </div>

        {/* Campaign Intelligence Table */}
        <div className="mb-4">
          <CampaignIntelligenceTable campaigns={directorCampaigns} />
        </div>

        {/* Executive Narrative */}
        <NarrativeSummary
          overview={dashboardOverview}
          campaigns={directorCampaigns}
          wasteSpend={wasteSpend}
          performanceScore={performanceScore}
        />
      </div>
    </MainLayout>
  );
}