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
import MomentumChart from "../components/GoogleAds1/charts/MomentumChart";
import TemporalHeatmap from "../components/GoogleAds1/charts/TemporalHeatmap";

import OpportunityTable from "../components/GoogleAds1/tables/OpportunityTable";
import CampaignIntelligenceTable from "../components/GoogleAds1/tables/CampaignIntelligenceTable";

import RecommendationPanel from "../components/GoogleAds1/insights/RecommendationPanel";
import NarrativeSummary from "../components/GoogleAds1/insights/NarrativeSummary";

// ─────────────────────────────────────────────────────────────────────────────
// FORMATTING HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const fmt = {
  currency: (v) =>
    v >= 1_000_000
      ? `$${(v / 1_000_000).toFixed(2)}M`
      : v >= 1_000
      ? `$${(v / 1_000).toFixed(1)}K`
      : `$${v.toFixed(2)}`,
  pct: (v) => `${v.toFixed(2)}%`,
  num: (v) =>
    v >= 1_000_000
      ? `${(v / 1_000_000).toFixed(1)}M`
      : v >= 1_000
      ? `${(v / 1_000).toFixed(1)}K`
      : Number(v).toLocaleString(),
};

// ─────────────────────────────────────────────────────────────────────────────
// DIRECTOR KPI CARD  (self-contained, no external dep)
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

function DirectorKPI({ label, value, subValue, accent = "blue", delta }) {
  const a = ACCENT[accent];
  return (
    <div className={`relative bg-[#0c1425] border border-slate-800/80 rounded-2xl p-4 ring-1 ${a.ring} overflow-hidden flex flex-col gap-1`}>
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
// MINI SPEND BAR (CSS)
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
// DIRECTOR FILTER STRIP
// ─────────────────────────────────────────────────────────────────────────────
function DirectorFilterStrip({ filters, setFilters, onClear, hasActiveFilters }) {
  const sel =
    "bg-transparent text-xs text-white border-none outline-none cursor-pointer appearance-none";
  const inp =
    "bg-transparent text-xs text-white border-none outline-none w-16 placeholder:text-slate-700";
  const pill =
    "flex items-center gap-2 bg-[#0c1425] border border-slate-700/60 rounded-xl px-3 py-2";

  return (
    <div className="flex flex-wrap items-center gap-2 mb-5">
      <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mr-1">Director Filters</span>

      {/* Sort By */}
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

      {/* Campaign Status */}
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

      {/* Metric Focus */}
      <div className={pill}>
        <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wide whitespace-nowrap">Focus</span>
        <select value={filters.metricFocus} onChange={(e) => setFilters((f) => ({ ...f, metricFocus: e.target.value }))} className={sel}>
          <option value="All">All Metrics</option>
          <option value="Spend">Spend-Based</option>
          <option value="Conversion">Conversion-Based</option>
          <option value="Efficiency">Efficiency Only</option>
        </select>
      </div>

      {/* Min Spend */}
      <div className={pill}>
        <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wide whitespace-nowrap">Min $</span>
        <input
          type="number"
          min={0}
          placeholder="0"
          value={filters.minSpend}
          onChange={(e) => setFilters((f) => ({ ...f, minSpend: e.target.value }))}
          className={inp}
        />
      </div>

      {/* Min Conversions */}
      <div className={pill}>
        <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wide whitespace-nowrap">Min Conv</span>
        <input
          type="number"
          min={0}
          placeholder="0"
          value={filters.conversionMin}
          onChange={(e) => setFilters((f) => ({ ...f, conversionMin: e.target.value }))}
          className={inp}
        />
      </div>

      {/* Max CPA */}
      <div className={pill}>
        <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wide whitespace-nowrap">Max CPA $</span>
        <input
          type="number"
          min={0}
          placeholder="∞"
          value={filters.cpaMax}
          onChange={(e) => setFilters((f) => ({ ...f, cpaMax: e.target.value }))}
          className={inp}
        />
      </div>

      {/* Min CTR */}
      <div className={pill}>
        <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wide whitespace-nowrap">Min CTR %</span>
        <input
          type="number"
          min={0}
          step={0.1}
          placeholder="0"
          value={filters.ctrMin}
          onChange={(e) => setFilters((f) => ({ ...f, ctrMin: e.target.value }))}
          className={inp}
        />
      </div>

      {/* Min Impressions */}
      <div className={pill}>
        <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wide whitespace-nowrap">Min Impr</span>
        <input
          type="number"
          min={0}
          placeholder="0"
          value={filters.impressionMin}
          onChange={(e) => setFilters((f) => ({ ...f, impressionMin: e.target.value }))}
          className={inp}
        />
      </div>

      {hasActiveFilters && (
        <button
          onClick={onClear}
          className="text-[11px] text-red-400 border border-red-800/50 bg-red-950/30 px-3 py-2 rounded-xl hover:bg-red-950/60 transition-colors"
        >
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

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA (raw rows from backend – unchanged hooks)
  // ═══════════════════════════════════════════════════════════════════════════
  const {
    campaigns: rawCampaigns,
    keywords,
    trends: rawTrends,
    loading,
  } = useGoogleAdsData();

  console.log("Raw Campaign Rows", rawCampaigns?.length || 0);

  // ═══════════════════════════════════════════════════════════════════════════
  // FILTERS STATE  (superset: original + director additions)
  // ═══════════════════════════════════════════════════════════════════════════
  const DEFAULT_FILTERS = {
    // ── original ──
    campaign:        "All",
    dateRange:       "all",
    matchType:       "All",
    performanceTier: "All",
    keywordSearch:   "",
    // ── director additions ──
    sortBy:          "cost",     // cost | clicks | conversions | impressions | ctr | cpa | efficiency
    minSpend:        "",
    conversionMin:   "",
    cpaMax:          "",
    ctrMin:          "",
    impressionMin:   "",
    campaignStatus:  "All",      // All | Active | Top Performer | Underperforming | Efficient | No Conversions
    metricFocus:     "All",      // All | Spend | Conversion | Efficiency
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
  // DATE FILTERING
  // ═══════════════════════════════════════════════════════════════════════════
  const { dateFilteredRows, cutoffDate } = useMemo(() => {
    if (filters.dateRange === "all")
      return { dateFilteredRows: rawCampaigns, cutoffDate: null };

    const latestDate = new Date(
      Math.max(...rawCampaigns.map((r) => new Date(r.report_date).getTime()))
    );
    const days = filters.dateRange === "7d" ? 7 : filters.dateRange === "30d" ? 30 : 90;
    const cutoff = new Date(latestDate);
    cutoff.setDate(cutoff.getDate() - days);

    return {
      dateFilteredRows: rawCampaigns.filter(
        (r) => r.report_date && new Date(r.report_date) >= cutoff
      ),
      cutoffDate: cutoff,
    };
  }, [rawCampaigns, filters.dateRange]);

  console.log("Date Filtered Rows", dateFilteredRows.length);

  // ═══════════════════════════════════════════════════════════════════════════
  // CAMPAIGN FILTERING
  // ═══════════════════════════════════════════════════════════════════════════
  const campaignFilteredRows = useMemo(() => {
    if (filters.campaign === "All") return dateFilteredRows;
    return dateFilteredRows.filter((r) => r.campaign === filters.campaign);
  }, [dateFilteredRows, filters.campaign]);

  console.log("Campaign Filtered Rows", campaignFilteredRows.length);

  // ═══════════════════════════════════════════════════════════════════════════
  // AGGREGATION (group by campaign → summed metrics)
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
    return Array.from(map.values());
  }, [campaignFilteredRows]);

  console.log("Aggregated Campaigns", aggregatedCampaigns.length);

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
  // FILTERED TRENDS
  // ═══════════════════════════════════════════════════════════════════════════
  const filteredTrends = useMemo(() => {
    if (!rawTrends) return [];
    if (!cutoffDate) return rawTrends;
    return rawTrends.filter(
      (t) => t.report_date && new Date(t.report_date) >= cutoffDate
    );
  }, [rawTrends, cutoffDate]);

  console.log("Filtered Trends", filteredTrends.length);

  // ═══════════════════════════════════════════════════════════════════════════
  // EXECUTIVE METRICS (unchanged hook)
  // ═══════════════════════════════════════════════════════════════════════════
  const { wasteSpend, performanceScore, recommendations } = useExecutiveMetrics({
    overview: dashboardOverview,
    campaigns: aggregatedCampaigns,
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // KEYWORD FILTERING (unchanged)
  // ═══════════════════════════════════════════════════════════════════════════
  const filteredKeywords = useMemo(() => {
    return keywords.filter((kw) => {
      if (filters.matchType !== "All" && kw.match_type !== filters.matchType) return false;
      if (filters.keywordSearch && !kw.keyword?.toLowerCase().includes(filters.keywordSearch.toLowerCase())) return false;
      return true;
    });
  }, [keywords, filters.matchType, filters.keywordSearch]);

  // ═══════════════════════════════════════════════════════════════════════════
  // ADVANCED DIRECTOR METRICS  (derived, no new hooks)
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

    const topSpendShare = totalSpend > 0 && highestSpend ? (highestSpend.cost / totalSpend) * 100 : 0;

    // Avg CPA across campaigns that convert
    const convCampaigns = aggregatedCampaigns.filter((c) => c.conversions > 0);
    const avgCampaignCPA = convCampaigns.length > 0
      ? convCampaigns.reduce((s, c) => s + c.cost / c.conversions, 0) / convCampaigns.length
      : 0;

    return {
      ctr, cpc, cpa, cvr, efficiencyIndex,
      activeCampaigns, totalCampaigns,
      elite, strong, average, weak, noConv,
      topCampaign, highestSpend,
      topSpendShare, avgCampaignCPA,
    };
  }, [dashboardOverview, aggregatedCampaigns]);

  // ═══════════════════════════════════════════════════════════════════════════
  // DIRECTOR CAMPAIGNS (new filters applied + sorted)
  // ═══════════════════════════════════════════════════════════════════════════
  const directorCampaigns = useMemo(() => {
    let result = [...aggregatedCampaigns];

    // Numeric threshold filters
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

    // Campaign status filter
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

    // Metric focus
    if (filters.metricFocus === "Spend") {
      result = result.filter((c) => c.cost > 0);
    } else if (filters.metricFocus === "Conversion") {
      result = result.filter((c) => c.conversions > 0);
    } else if (filters.metricFocus === "Efficiency") {
      result = result.filter((c) => c.clicks > 0 && c.conversions / c.clicks >= 0.03);
    }

    // Sort
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
        default: return b.cost - a.cost; // cost
      }
    });
  }, [aggregatedCampaigns, filters, adv.cpa]);

  // ═══════════════════════════════════════════════════════════════════════════
  // LOADING
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

  const maxCost = Math.max(...directorCampaigns.map((c) => c.cost), 1);
  const totalCampaigns = adv.totalCampaigns;

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <MainLayout>
      <div className="min-h-screen bg-[#020617] px-6 py-5">

        {/* ──────────────────────────────────────────────────────────────────
            DIRECTOR COMMAND HEADER
        ────────────────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-emerald-400 text-[11px] font-bold tracking-widest uppercase">
                Live Marketing Intelligence
              </span>
              <span className="text-slate-700 text-xs">|</span>
              <span className="text-slate-500 text-xs">{adv.activeCampaigns} active / {adv.totalCampaigns} total campaigns</span>
            </div>
            <h1 className="text-4xl font-black tracking-tight text-white leading-none">
              Google Ads Command
            </h1>
            <p className="text-slate-500 mt-1.5 text-sm">
              Director-level marketing intelligence & optimization platform
            </p>
          </div>

          {/* Header KPI badges */}
          <div className="flex items-stretch gap-3">
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

        {/* ──────────────────────────────────────────────────────────────────
            DIRECTOR ALERT BAR
        ────────────────────────────────────────────────────────────────── */}
        {(adv.noConv > 0 || adv.elite > 0 || adv.topSpendShare > 60 || adv.cvr > 5) && (
          <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-0.5">
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

        {/* ──────────────────────────────────────────────────────────────────
            DIRECTOR 8-KPI STRIP
        ────────────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3 mb-5">
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
            label="Click-Through Rate"
            value={fmt.pct(adv.ctr)}
            subValue={adv.ctr >= 2 ? "Above 2% target" : "Below 2% target"}
            accent={adv.ctr >= 2 ? "emerald" : "red"}
          />
          <DirectorKPI
            label="Efficiency Index"
            value={adv.efficiencyIndex.toFixed(3)}
            subValue="conversions per $1K"
            accent="rose"
          />
        </div>

        {/* ──────────────────────────────────────────────────────────────────
            ORIGINAL EXECUTIVE FILTERS
        ────────────────────────────────────────────────────────────────── */}
        <ExecutiveFilters
          filters={filters}
          setFilters={setFilters}
          clearFilters={clearFilters}
          campaigns={uniqueCampaignsForFilter}
        />

        {/* ──────────────────────────────────────────────────────────────────
            DIRECTOR FILTER STRIP  (new filters)
        ────────────────────────────────────────────────────────────────── */}
        <DirectorFilterStrip
          filters={filters}
          setFilters={setFilters}
          onClear={clearFilters}
          hasActiveFilters={hasActiveDirectorFilters}
        />

        {/* ──────────────────────────────────────────────────────────────────
            ORIGINAL KPI GRID
        ────────────────────────────────────────────────────────────────── */}
        <KPIGrid overview={dashboardOverview} wasteSpend={wasteSpend} />

        {/* ──────────────────────────────────────────────────────────────────
            DIRECTOR INSIGHTS ROW  (4 panels)
        ────────────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 mb-4">

          {/* Campaign Health Tier Panel */}
          <div className="bg-[#0c1425] border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white">Campaign Health</h3>
              <span className="text-[11px] text-slate-600">{totalCampaigns} total</span>
            </div>
            <div className="space-y-3 mb-4">
              <TierRow label="Elite  (≥ 8% CVR)"  count={adv.elite}   total={totalCampaigns} dotColor="bg-emerald-500" />
              <TierRow label="Strong (5 – 8% CVR)" count={adv.strong}  total={totalCampaigns} dotColor="bg-blue-500"    />
              <TierRow label="Average (2 – 5% CVR)"count={adv.average} total={totalCampaigns} dotColor="bg-amber-400"   />
              <TierRow label="Weak   (< 2% CVR)"   count={adv.weak}    total={totalCampaigns} dotColor="bg-orange-500"  />
              <TierRow label="No Conversions"       count={adv.noConv}  total={totalCampaigns} dotColor="bg-red-500"     />
            </div>
            {/* Stacked tier bar */}
            <div className="flex h-2 rounded-full overflow-hidden gap-px">
              {adv.elite   > 0 && <div className="bg-emerald-500 transition-all" style={{ flex: adv.elite }}   />}
              {adv.strong  > 0 && <div className="bg-blue-500 transition-all"    style={{ flex: adv.strong }}  />}
              {adv.average > 0 && <div className="bg-amber-400 transition-all"   style={{ flex: adv.average }} />}
              {adv.weak    > 0 && <div className="bg-orange-500 transition-all"  style={{ flex: adv.weak }}    />}
              {adv.noConv  > 0 && <div className="bg-red-500 transition-all"     style={{ flex: adv.noConv }}  />}
            </div>
          </div>

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

        {/* ──────────────────────────────────────────────────────────────────
            DIRECTOR CAMPAIGN PERFORMANCE MATRIX  (inline table, full metrics)
        ────────────────────────────────────────────────────────────────── */}
        <div className="bg-[#0c1425] border border-slate-800 rounded-2xl mb-4 overflow-hidden">
          {/* Table header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-white">Campaign Performance Matrix</h3>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Sorted by <span className="text-slate-400">{filters.sortBy}</span> · {directorCampaigns.length} of {totalCampaigns} campaigns
              </p>
            </div>
            {/* Legend */}
            <div className="hidden sm:flex items-center gap-3 text-[10px] text-slate-500">
              {[["bg-emerald-500","Elite"],["bg-blue-500","Strong"],["bg-amber-400","Avg"],["bg-orange-500","Weak"],["bg-red-500","No Conv"]].map(([dot, lbl]) => (
                <span key={lbl} className="flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${dot}`} />
                  {lbl}
                </span>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
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
                      <tr
                        key={c.campaign}
                        className="border-b border-slate-800/30 hover:bg-slate-800/20 transition-colors"
                      >
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

        {/* ──────────────────────────────────────────────────────────────────
            HERO SECTION – Efficiency Matrix + Score Card
        ────────────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
          <div className="xl:col-span-2">
            <CampaignEfficiencyMatrix campaigns={directorCampaigns} />
          </div>
          <ExecutiveScoreCard score={performanceScore} />
        </div>

        {/* Match Type + Waste Spend */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
          <MatchTypeAnalytics keywords={filteredKeywords} />
          <WasteSpendTrend trends={filteredTrends} />
        </div>

        {/* Spend Trend + Forecast */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
          <SpendTrendChart trends={filteredTrends} />
          <ForecastChart trends={filteredTrends} />
        </div>

        {/* Momentum + Opportunity */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
          <MomentumChart campaigns={directorCampaigns} />
          <OpportunityTable campaigns={directorCampaigns} />
        </div>

        {/* Temporal Heatmap */}
        <div className="mb-4">
          <TemporalHeatmap trends={filteredTrends} />
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