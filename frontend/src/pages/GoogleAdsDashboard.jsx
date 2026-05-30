import { useState, useMemo } from "react";
import MainLayout from "../layouts/MainLayout";
import useGoogleAdsData from "../hooks/useGoogleAdsData";
import useExecutiveMetrics from "../hooks/useExecutiveMetrics";
import ExecutiveScoreCard from "../components/GoogleAds1/kpis/ExecutiveScoreCard";
import CampaignEfficiencyMatrix from "../components/GoogleAds1/charts/CampaignEfficiencyMatrix";
import MatchTypeAnalytics from "../components/GoogleAds1/charts/MatchTypeAnalytics";
import SpendTrendChart from "../components/GoogleAds1/charts/SpendTrendChart";
import ConversionFunnel from "../components/GoogleAds1/charts/ConversionFunnel";
import SpendVsConversionShare from "../components/GoogleAds1/charts/SpendVsConversionShare";
import CTRCVRQuadrant from "../components/GoogleAds1/charts/CTRCVRQuadrant";
import MonthlyComparisonChart from "../components/GoogleAds1/charts/MonthlyComparisonChart";
import CPATrendChart from "../components/GoogleAds1/charts/CPATrendChart";
import ParetoChart from "../components/GoogleAds1/charts/ParetoChart";
import CampaignHealthTreemap from "../components/GoogleAds1/charts/CampaignHealthTreemap";
import CampaignRankingTable from "../components/GoogleAds1/tables/CampaignRankingTable";
import CampaignIntelligenceTable from "../components/GoogleAds1/tables/CampaignIntelligenceTable";
import RecommendationPanel from "../components/GoogleAds1/insights/RecommendationPanel";
import NarrativeSummary from "../components/GoogleAds1/insights/NarrativeSummary";
import {fmt,normalizeCampaign,computeExecutiveScore,} from "../utils/googleAdsMetrics";

import SkeletonCard from "../components/GoogleAds1/Dashboard/SkeletonCard";
import ExecutiveSummaryCard from "../components/GoogleAds1/Dashboard/ExecutiveSummaryCard";
import AIInsightPanel from "../components/GoogleAds1/Dashboard/AIInsightPanel";
import DirectorKPI from "../components/GoogleAds1/Dashboard/DirectorKPI";
import DirectorFilterStrip from "../components/GoogleAds1/Dashboard/DirectorFilterStrip";

// -----------------------------------------------------------------------------
// MAIN DASHBOARD
// -----------------------------------------------------------------------------
export default function GoogleAdsDashboard() {
  // Data from hooks
  const { campaigns: rawCampaigns, keywords: rawKeywords, trends: rawTrends, loading } = useGoogleAdsData();
  const { wasteSpend, recommendations: hookRecommendations } = useExecutiveMetrics({});

  // ---------------------------------------------------------------------------
  // FILTERS STATE (includes date range and campaign dropdown)
  // ---------------------------------------------------------------------------
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
  const [selectedCampaign, setSelectedCampaign] = useState("All");
  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setSelectedCampaign("All");
  };
  const hasActiveDirectorFilters =
    filters.sortBy !== "cost" ||
    filters.minSpend ||
    filters.conversionMin ||
    filters.cpaMax ||
    filters.ctrMin ||
    filters.impressionMin ||
    filters.campaignStatus !== "All" ||
    filters.metricFocus !== "All";

  // ---------------------------------------------------------------------------
  // 1. NORMALIZE ALL CAMPAIGNS (single source)
  // ---------------------------------------------------------------------------
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

  // Unique campaigns for dropdown
  const uniqueCampaigns = useMemo(() => 
    allNormalizedCampaigns.map(c => ({ campaign: c.campaign })), 
    [allNormalizedCampaigns]
  );

  // ---------------------------------------------------------------------------
  // 2. APPLY DATE RANGE + CAMPAIGN + DIRECTOR FILTERS (single source of truth)
  // ---------------------------------------------------------------------------
  const filteredCampaigns = useMemo(() => {
    // Step 1: Date filtering (re‑aggregate raw rows by date)
    const { start, end } = filters.dateRange;
    let dateFilteredRows = rawCampaigns;
    if (start && end) {
      dateFilteredRows = rawCampaigns.filter(row => {
        const d = new Date(row.report_date);
        return d >= start && d <= end;
      });
    }

    // Step 2: Aggregate after date filter
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
    let result = Array.from(dateAggMap.values()).map(normalizeCampaign);

    // Step 3: Campaign filter (dropdown)
    if (selectedCampaign !== "All") {
      result = result.filter(c => c.campaign === selectedCampaign);
    }

    // Step 4: Director numeric filters
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

    // Step 5: Status filters
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

    // Step 6: Metric focus
    if (filters.metricFocus === "Spend") {
      result = result.filter(c => c.cost > 0);
    } else if (filters.metricFocus === "Conversion") {
      result = result.filter(c => c.conversions > 0);
    } else if (filters.metricFocus === "Efficiency") {
      result = result.filter(c => c.conversion_rate >= 3);
    }

    // Step 7: Sorting
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
  }, [rawCampaigns, filters, selectedCampaign]);

  // ---------------------------------------------------------------------------
  // 3. DERIVED METRICS (all based on filteredCampaigns)
  // ---------------------------------------------------------------------------
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
    const worstCampaign = filteredCampaigns.filter(c => c.cost > 0 && c.conversions === 0).sort((a, b) => b.cost - a.cost)[0] ||
                         [...filteredCampaigns].filter(c => c.conversions > 0).sort((a, b) => a.cpa - b.cpa)[0];
    const highestCPA = [...filteredCampaigns].filter(c => c.conversions > 0).sort((a, b) => b.cpa - a.cpa)[0];

    return { ctr, cpc, cpa, cvr, efficiencyIndex, activeCampaigns, totalCampaigns,
             elite, strong, average, weak, noConv, topCampaign, worstCampaign, highestCPA };
  }, [filteredCampaigns, overview]);

  // Executive score using new weights (Phase 3)
  const executiveScore = useMemo(() => {
    return computeExecutiveScore(advMetrics.ctr, advMetrics.cvr, advMetrics.cpa, wasteSpend, overview.totalSpend);
  }, [advMetrics, wasteSpend, overview.totalSpend]);

  // Filtered trends for charts (same date range)
  const filteredTrends = useMemo(() => {
    let trends = [...(rawTrends || [])];
    const { start, end } = filters.dateRange;
    if (start && end) {
      trends = trends.filter(t => {
        const d = new Date(t.report_date);
        return d >= start && d <= end;
      });
    }
    // Also filter by selected campaign if needed (trends have campaign field)
    if (selectedCampaign !== "All") {
      trends = trends.filter(t => t.campaign === selectedCampaign);
    }
    return trends;
  }, [rawTrends, filters.dateRange, selectedCampaign]);

  // Filtered keywords – respect date range AND selected campaign
  const filteredKeywords = useMemo(() => {
    let keywords = [...(rawKeywords || [])];
    const { start, end } = filters.dateRange;
    if (start && end) {
      keywords = keywords.filter(k => {
        const d = new Date(k.report_date);
        return d >= start && d <= end;
      });
    }
    if (selectedCampaign !== "All") {
      keywords = keywords.filter(k => k.campaign === selectedCampaign);
    }
    return keywords;
  }, [rawKeywords, filters.dateRange, selectedCampaign]);

  // Combine recommendations
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

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------
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

        {/* Time & Campaign Filter (Phase 5 – restored campaign dropdown) */}
        <div className="flex flex-wrap items-center gap-3 mb-5 bg-[#0c1425] border border-slate-800/60 rounded-xl p-3">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Time & Campaign</span>

          {/* Date range buttons */}
          {[
            { label: "Last 7 days", days: 7 },
            { label: "Last 30 days", days: 30 },
            { label: "Last 90 days", days: 90 },
          ].map(({ label, days }) => (
            <button
              key={label}
              onClick={() => {
                const end = new Date();
                const start = new Date();
                start.setDate(end.getDate() - days);
                setFilters(f => ({ ...f, dateRange: { start, end, label } }));
              }}
              className={`px-3 py-1.5 rounded-lg text-xs transition ${
                filters.dateRange?.label === label
                  ? "bg-blue-600 text-white"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {label}
            </button>
          ))}

          {/* Custom date inputs */}
          <div className="flex items-center gap-1">
            <input
              type="date"
              id="customStart"
              className="bg-slate-800 text-white text-xs rounded-lg px-2 py-1.5 border border-slate-700"
              onChange={(e) => {
                const start = e.target.value ? new Date(e.target.value) : null;
                const end = filters.dateRange?.end;
                if (start && end) {
                  setFilters(f => ({ ...f, dateRange: { start, end, label: "Custom" } }));
                }
              }}
            />
            <span className="text-slate-500">to</span>
            <input
              type="date"
              id="customEnd"
              className="bg-slate-800 text-white text-xs rounded-lg px-2 py-1.5 border border-slate-700"
              onChange={(e) => {
                const end = e.target.value ? new Date(e.target.value) : null;
                const start = filters.dateRange?.start;
                if (start && end) {
                  setFilters(f => ({ ...f, dateRange: { start, end, label: "Custom" } }));
                }
              }}
            />
          </div>

          {/* Campaign dropdown (restored) */}
          <select
            value={selectedCampaign}
            onChange={(e) => setSelectedCampaign(e.target.value)}
            className="bg-slate-800 text-white text-xs rounded-lg px-3 py-2 outline-none border border-slate-700 min-w-[200px]"
          >
            <option value="All">All Campaigns</option>
            {uniqueCampaigns.map((c) => (
              <option key={c.campaign} value={c.campaign}>{c.campaign}</option>
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

        {/* Row 4: Monthly Comparison + Conversion Funnel */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
          <MonthlyComparisonChart trends={filteredTrends} />
          <ConversionFunnel overview={overview} />
        </div>

        {/* Row 5: Campaign Efficiency Matrix */}
        <div className="mb-5">
          <CampaignEfficiencyMatrix campaigns={filteredCampaigns} />
        </div>

        {/* Row 6: Pareto Chart */}
        <div className="mb-5">
          <ParetoChart campaigns={filteredCampaigns} />
        </div>

        {/* Row 7: Spend vs Conversion Share */}
        <div className="mb-5">
          <SpendVsConversionShare campaigns={filteredCampaigns} />
        </div>

        {/* Row 8: CTR CVR Quadrant */}
        <div className="mb-5">
          <CTRCVRQuadrant campaigns={filteredCampaigns} />
        </div>

        {/* Row 9: CPA Trend Chart */}
        <div className="mb-5">
          <CPATrendChart trends={filteredTrends} />
        </div>

        {/* Row 10: Campaign Health Treemap (replaces old HealthDonut card) */}
        <div className="mb-5">
          <CampaignHealthTreemap campaigns={filteredCampaigns} />
        </div>

        {/* Row 11: Executive Score Card (moved down, but keep alongside? Actually we keep it but adjust layout) */}
        {/* To preserve two-column layout, we can put ExecutiveScoreCard next to something else, but original had HealthDonut + ExecutiveScoreCard.
            Now we have Treemap full width. We can place ExecutiveScoreCard below or next to Treemap? Let's keep below as a single card. */}
        <div className="mb-5">
          <ExecutiveScoreCard score={executiveScore} efficiencyIndex={advMetrics.efficiencyIndex.toFixed(1)} activeRate={((advMetrics.activeCampaigns / advMetrics.totalCampaigns) * 100).toFixed(0)} wasteSpend={wasteSpend} />
        </div>

        {/* Row 12: Match Type Analytics (now respects filters) */}
        <div className="mb-5">
          <MatchTypeAnalytics keywords={filteredKeywords} />
        </div>

        {/* Row 13: Campaign Ranking Table */}
        <div className="mb-5">
          <CampaignRankingTable campaigns={filteredCampaigns} />
        </div>

        {/* Row 14: Recommendations Panel */}
        <div className="mb-5">
          <RecommendationPanel recommendations={recommendations} />
        </div>

        {/* AI Insights Panel */}
        <AIInsightPanel
          campaigns={filteredCampaigns}
          topCampaign={advMetrics.topCampaign}
          worstCampaign={advMetrics.worstCampaign}
          highestCPA={advMetrics.highestCPA}
          wasteSpend={wasteSpend}
        />

        {/* Additional tables */}
        <div className="mb-5">
          <CampaignIntelligenceTable campaigns={filteredCampaigns} />
        </div>

        <NarrativeSummary overview={overview} campaigns={filteredCampaigns} wasteSpend={wasteSpend} performanceScore={executiveScore} />
      </div>
    </MainLayout>
  );
}