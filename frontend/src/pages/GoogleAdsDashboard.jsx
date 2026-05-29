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

export default function GoogleAdsDashboard() {
  // =====================================================
  // DATA (raw rows from backend)
  // =====================================================
  const {
    campaigns: rawCampaigns,   // raw rows with report_date, campaign, cost, ...
    keywords,
    trends: rawTrends,         // raw trend data (daily)
    loading,
  } = useGoogleAdsData();

  // =====================================================
  // FILTERS
  // =====================================================
  const [filters, setFilters] = useState({
    campaign: "All",
    dateRange: "30d",   // "7d", "30d", "90d"
    matchType: "All",
    performanceTier: "All",
    keywordSearch: "",
  });

  // =====================================================
  // UNIQUE CAMPAIGNS FOR FILTER DROPDOWN (from raw data)
  // =====================================================
  const uniqueCampaignsForFilter = useMemo(() => {
    const campaignNames = new Set();
    rawCampaigns.forEach((row) => {
      if (row.campaign) campaignNames.add(row.campaign);
    });
    return Array.from(campaignNames).map((name) => ({ campaign: name }));
  }, [rawCampaigns]);

  // =====================================================
  // 1. DATE FILTERING (relative to LATEST date in dataset)
  // =====================================================
  const { dateFilteredRows, cutoffDate } = useMemo(() => {
    // Find the latest report_date in rawCampaigns
    const latestDate = new Date(
      Math.max(
        ...rawCampaigns.map((r) => new Date(r.report_date).getTime())
      )
    );

    // Determine number of days based on filter
    const days =
      filters.dateRange === "7d"
        ? 7
        : filters.dateRange === "30d"
        ? 30
        : 90;

    const cutoff = new Date(latestDate);
    cutoff.setDate(cutoff.getDate() - days);

    // Filter rows where report_date >= cutoff
    const filtered = rawCampaigns.filter((row) => {
      if (!row.report_date) return false;
      const reportDate = new Date(row.report_date);
      return reportDate >= cutoff;
    });

    return { dateFilteredRows: filtered, cutoffDate: cutoff };
  }, [rawCampaigns, filters.dateRange]);

  // =====================================================
  // 2. CAMPAIGN FILTERING (applied on date-filtered rows)
  // =====================================================
  const campaignFilteredRows = useMemo(() => {
    if (filters.campaign === "All") {
      return dateFilteredRows;
    }
    return dateFilteredRows.filter(
      (row) => row.campaign === filters.campaign
    );
  }, [dateFilteredRows, filters.campaign]);

  // =====================================================
  // 3. AGGREGATION (group by campaign → summed metrics)
  // =====================================================
  const aggregatedCampaigns = useMemo(() => {
    const campaignMap = new Map();

    campaignFilteredRows.forEach((row) => {
      const name = row.campaign;
      if (!name) return;

      if (!campaignMap.has(name)) {
        campaignMap.set(name, {
          campaign: name,
          cost: 0,
          clicks: 0,
          impressions: 0,
          conversions: 0,
        });
      }

      const agg = campaignMap.get(name);
      agg.cost += Number(row.cost) || 0;
      agg.clicks += Number(row.clicks) || 0;
      agg.impressions += Number(row.impressions) || 0;
      agg.conversions += Number(row.conversions) || 0;
    });

    return Array.from(campaignMap.values());
  }, [campaignFilteredRows]);

  // =====================================================
  // 4. DASHBOARD KPIs (sum of all filtered rows)
  // =====================================================
  const dashboardOverview = useMemo(() => {
    let totalSpend = 0;
    let totalClicks = 0;
    let totalImpressions = 0;
    let totalConversions = 0;

    campaignFilteredRows.forEach((row) => {
      totalSpend += Number(row.cost) || 0;
      totalClicks += Number(row.clicks) || 0;
      totalImpressions += Number(row.impressions) || 0;
      totalConversions += Number(row.conversions) || 0;
    });

    return {
      totalSpend,
      totalClicks,
      totalImpressions,
      totalConversions,
    };
  }, [campaignFilteredRows]);

  // =====================================================
  // 5. FILTERED TRENDS (using same cutoffDate)
  // =====================================================
  const filteredTrends = useMemo(() => {
    if (!rawTrends) return [];
    return rawTrends.filter((t) => {
      if (!t.report_date) return false;
      const trendDate = new Date(t.report_date);
      return trendDate >= cutoffDate;
    });
  }, [rawTrends, cutoffDate]);

  // =====================================================
  // 6. EXECUTIVE METRICS (uses aggregated campaigns & overview)
  // =====================================================
  const { wasteSpend, performanceScore, recommendations } =
    useExecutiveMetrics({
      overview: dashboardOverview,
      campaigns: aggregatedCampaigns,
    });

  // =====================================================
  // KEYWORD FILTERING (independent of date)
  // =====================================================
  const filteredKeywords = useMemo(() => {
    return keywords.filter((keyword) => {
      if (filters.matchType !== "All" && keyword.match_type !== filters.matchType) {
        return false;
      }
      if (
        filters.keywordSearch &&
        !keyword.keyword?.toLowerCase().includes(filters.keywordSearch.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [keywords, filters.matchType, filters.keywordSearch]);

  // =====================================================
  // DEBUGGING (optional)
  // =====================================================
  console.log("Dashboard KPI", dashboardOverview);
  console.log("Aggregated campaigns", aggregatedCampaigns.length);
  console.log("Filtered trends length", filteredTrends.length);
  console.log("Keyword Count", filteredKeywords.length);

  // =====================================================
  // LOADING
  // =====================================================
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

  // =====================================================
  // MAIN PAGE
  // =====================================================
  return (
    <MainLayout>
      <div className="min-h-screen bg-[#020617] px-6 py-5">
        {/* EXECUTIVE HEADER */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-emerald-400 text-sm font-medium">
                LIVE MARKETING INTELLIGENCE
              </span>
            </div>
            <h1 className="text-4xl font-black tracking-tight text-white">
              Google Ads Intelligence
            </h1>
            <p className="text-slate-400 mt-1 text-sm">
              Executive marketing analytics & optimization platform
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3">
              <div className="text-xs text-slate-400">Last Updated</div>
              <div className="text-white font-semibold mt-1">Real-Time</div>
            </div>
          </div>
        </div>

        {/* FILTERS – using unique campaigns from raw data */}
        <ExecutiveFilters
          filters={filters}
          setFilters={setFilters}
          campaigns={uniqueCampaignsForFilter}
        />

        {/* KPI GRID */}
        <KPIGrid overview={dashboardOverview} wasteSpend={wasteSpend} />

        {/* HERO SECTION – aggregated campaigns */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
          <div className="xl:col-span-2">
            <CampaignEfficiencyMatrix campaigns={aggregatedCampaigns} />
          </div>
          <ExecutiveScoreCard score={performanceScore} />
        </div>

        {/* MATCH TYPE + WASTE ANALYTICS (keywords + filtered trends) */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
          <MatchTypeAnalytics keywords={filteredKeywords} />
          <WasteSpendTrend trends={filteredTrends} />
        </div>

        {/* SPEND + FORECAST (filtered trends) */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
          <SpendTrendChart trends={filteredTrends} />
          <ForecastChart trends={filteredTrends} />
        </div>

        {/* MOMENTUM + OPPORTUNITY (aggregated campaigns) */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
          <MomentumChart campaigns={aggregatedCampaigns} />
          <OpportunityTable campaigns={aggregatedCampaigns} />
        </div>

        {/* TEMPORAL HEATMAP (filtered trends) */}
        <div className="mb-4">
          <TemporalHeatmap trends={filteredTrends} />
        </div>

        {/* RECOMMENDATIONS */}
        <div className="mb-4">
          <RecommendationPanel recommendations={recommendations} />
        </div>

        {/* CAMPAIGN INTELLIGENCE TABLE (aggregated campaigns) */}
        <div className="mb-4">
          <CampaignIntelligenceTable campaigns={aggregatedCampaigns} />
        </div>

        {/* EXECUTIVE NARRATIVE */}
        <NarrativeSummary
          overview={dashboardOverview}
          campaigns={aggregatedCampaigns}
          wasteSpend={wasteSpend}
          performanceScore={performanceScore}
        />
      </div>
    </MainLayout>
  );
}