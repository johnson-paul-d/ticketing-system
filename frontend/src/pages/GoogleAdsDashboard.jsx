import { useState, useMemo, useEffect } from "react";
import MainLayout from "../layouts/MainLayout";
import useGoogleAdsData from "../hooks/useGoogleAdsData";
import useExecutiveMetrics from "../hooks/useExecutiveMetrics";
import { calculateWasteSpend } from "../utils/metrics";
import ExecutiveScoreCard from "../components/GoogleAds1/kpis/ExecutiveScoreCard";
import CampaignEfficiencyMatrix from "../components/GoogleAds1/charts/CampaignEfficiencyMatrix";
import MatchTypeAnalytics from "../components/GoogleAds1/charts/MatchTypeAnalytics";
import KeywordTopPerformers from "../components/GoogleAds1/charts/KeywordTopPerformers";
import KeywordQuadrant from "../components/GoogleAds1/charts/KeywordQuadrant";
import KeywordCPAChart from "../components/GoogleAds1/charts/KeywordCPAChart";
import KeywordWasteAnalyzer from "../components/GoogleAds1/charts/KeywordWasteAnalyzer";
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
import {
  fmt,
  normalizeCampaign,
  computeExecutiveScore,
} from "../utils/googleAdsMetrics";

import SkeletonCard from "../components/GoogleAds1/Dashboard/SkeletonCard";
import ExecutiveSummaryCard from "../components/GoogleAds1/Dashboard/ExecutiveSummaryCard";
import AIInsightPanel from "../components/GoogleAds1/Dashboard/AIInsightPanel";
import DirectorKPI from "../components/GoogleAds1/Dashboard/DirectorKPI";
import DirectorFilterStrip from "../components/GoogleAds1/Dashboard/DirectorFilterStrip";
import SiegerLogo from "../assets/sieger white logo.png";

/* ─────────────────────────────────────────────────────────────
   SIEGER BRAND TOKENS
   Signal Red  #9B2423
   Black       #000000
   Cream       #F3ECE0
───────────────────────────────────────────────────────────── */

// -----------------------------------------------------------------------------
// MAIN DASHBOARD
// -----------------------------------------------------------------------------
export default function GoogleAdsDashboard() {
  // Data from hooks
  const {
    campaigns: rawCampaigns,
    keywords: rawKeywords,
    trends: rawTrends,
    loading,
  } = useGoogleAdsData();
  const { wasteSpend: _wasteSpendUnfiltered, recommendations: hookRecommendations } =
    useExecutiveMetrics({ rows: rawCampaigns });

  // ---------------------------------------------------------------------------
  // FILTERS STATE (includes date range, account and campaign dropdown)
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
    dateRange: {
      label: "Last 30 days",
      start: new Date(Date.now() - 30 * 86400000),
      end: new Date(),
    },
  };
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [selectedCampaign, setSelectedCampaign] = useState("All");
  const [selectedAccount, setSelectedAccount] = useState("All");
  const [selectedStatus, setSelectedStatus] = useState("All");

  // Use the latest date in the dataset so preset buttons don't cut off future-dated rows
  const dataMaxDate = useMemo(() => {
    if (!rawCampaigns?.length) return new Date();
    let max = new Date(0);
    rawCampaigns.forEach((r) => {
      const d = new Date(r.report_date);
      if (!isNaN(d) && d > max) max = d;
    });
    return max > new Date(0) ? max : new Date();
  }, [rawCampaigns]);
  const clearFilters = () => {
    const end = new Date(dataMaxDate);
    const start = new Date(dataMaxDate);
    start.setDate(end.getDate() - 30);
    setFilters({ ...DEFAULT_FILTERS, dateRange: { start, end, label: "Last 30 days" } });
    setSelectedCampaign("All");
    setSelectedAccount("All");
    setSelectedStatus("All");
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
  // 1. UNIQUE ACCOUNTS (using account_id)
  // ---------------------------------------------------------------------------
  const uniqueAccounts = useMemo(() => {
    const seen = new Map();
    rawCampaigns.forEach((r) => {
      if (r.account_id && !seen.has(r.account_id)) {
        seen.set(r.account_id, r.account_name || r.account_id);
      }
    });
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rawCampaigns]);

  // ---------------------------------------------------------------------------
  // 1b. UNIQUE STATUSES — scoped to the active date range + account
  //     so the dropdown only shows statuses that actually exist in the
  //     current view (prevents selecting a status with zero matching rows).
  // ---------------------------------------------------------------------------
  const uniqueStatuses = useMemo(() => {
    const { start, end } = filters.dateRange;
    let rows = rawCampaigns;

    if (start && end) {
      rows = rows.filter((r) => {
        const d = new Date(r.report_date);
        return d >= start && d <= end;
      });
    }

    if (selectedAccount !== "All") {
      rows = rows.filter((r) => r.account_id === selectedAccount);
    }

    return [...new Set(rows.map((r) => r.status).filter(Boolean))].sort();
  }, [rawCampaigns, filters.dateRange, selectedAccount]);

  // ---------------------------------------------------------------------------
  // 2. NORMALIZE ALL CAMPAIGNS (single source)
  // ---------------------------------------------------------------------------
  const allNormalizedCampaigns = useMemo(() => {
    const campaignMap = new Map();
    rawCampaigns.forEach((row) => {
      const name =
        row.campaign || row.campaign_name || row.campaignName;
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
    return Array.from(campaignMap.values()).map(normalizeCampaign);
  }, [rawCampaigns]);

  // ---------------------------------------------------------------------------
  // 3. UNIQUE CAMPAIGNS (cascading: account → status → date)
  // ---------------------------------------------------------------------------
  const uniqueCampaigns = useMemo(() => {
    const { start, end } = filters.dateRange;

    let rows = rawCampaigns;

    if (start && end) {
      rows = rows.filter((r) => {
        const d = new Date(r.report_date);
        return d >= start && d <= end;
      });
    }

    if (selectedAccount !== "All") {
      rows = rows.filter((r) => r.account_id === selectedAccount);
    }

    if (selectedStatus !== "All") {
      rows = rows.filter((r) => r.status === selectedStatus);
    }

    const seen = new Set();
    rows.forEach((row) => {
      const name = row.campaign || row.campaign_name || row.campaignName;
      if (name) seen.add(name);
    });

    return [...seen].sort().map((campaign) => ({ campaign }));
  }, [rawCampaigns, filters.dateRange, selectedAccount, selectedStatus]);

  // Reset selectedCampaign if it's no longer valid after account or status changes
  // Once data loads, shift the default "Last 30 days" end to the dataset's max date
  // so future-dated rows (e.g. July data when today is June) are not cut off
  useEffect(() => {
    if (!rawCampaigns?.length) return;
    setFilters((prev) => {
      if (prev.dateRange?.label !== "Last 30 days") return prev;
      const end = new Date(dataMaxDate);
      const start = new Date(dataMaxDate);
      start.setDate(end.getDate() - 30);
      return { ...prev, dateRange: { start, end, label: "Last 30 days" } };
    });
  }, [dataMaxDate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedCampaign !== "All") {
      const stillAvailable = uniqueCampaigns.some(
        (c) => c.campaign === selectedCampaign
      );
      if (!stillAvailable) {
        setSelectedCampaign("All");
      }
    }
  }, [selectedAccount, selectedStatus, uniqueCampaigns, selectedCampaign]);

  // ---------------------------------------------------------------------------
  // 4. APPLY DATE RANGE + ACCOUNT_ID + CAMPAIGN + DIRECTOR FILTERS
  // ---------------------------------------------------------------------------
  const filteredCampaigns = useMemo(() => {
    const { start, end } = filters.dateRange;
    let dateFilteredRows = rawCampaigns;
    if (start && end) {
      dateFilteredRows = rawCampaigns.filter((row) => {
        const d = new Date(row.report_date);
        return d >= start && d <= end;
      });
    }

    // Apply account filter using account_id
    if (selectedAccount !== "All") {
      dateFilteredRows = dateFilteredRows.filter(
        (row) => row.account_id === selectedAccount
      );
    }

    // Apply status filter
    if (selectedStatus !== "All") {
      dateFilteredRows = dateFilteredRows.filter(
        (row) => row.status === selectedStatus
      );
    }

    const dateAggMap = new Map();
    dateFilteredRows.forEach((row) => {
      const name = row.campaign;
      if (!name) return;
      if (!dateAggMap.has(name)) {
        dateAggMap.set(name, {
          campaign: name,
          cost: 0,
          clicks: 0,
          impressions: 0,
          conversions: 0,
        });
      }
      const agg = dateAggMap.get(name);
      agg.cost += Number(row.cost) || 0;
      agg.clicks += Number(row.clicks) || 0;
      agg.impressions += Number(row.impressions) || 0;
      agg.conversions += Number(row.conversions) || 0;
    });
    let result = Array.from(dateAggMap.values()).map(normalizeCampaign);

    if (selectedCampaign !== "All") {
      result = result.filter((c) => c.campaign === selectedCampaign);
    }

    const minSpendVal = parseFloat(filters.minSpend) || 0;
    const convMinVal = parseFloat(filters.conversionMin) || 0;
    const cpaMaxVal = parseFloat(filters.cpaMax) || 0;
    const ctrMinVal = parseFloat(filters.ctrMin) || 0;
    const imprMinVal = parseFloat(filters.impressionMin) || 0;

    if (minSpendVal) result = result.filter((c) => c.cost >= minSpendVal);
    if (convMinVal) result = result.filter((c) => c.conversions >= convMinVal);
    if (imprMinVal) result = result.filter((c) => c.impressions >= imprMinVal);
    if (cpaMaxVal)
      result = result.filter((c) => c.conversions > 0 && c.cpa <= cpaMaxVal);
    if (ctrMinVal) result = result.filter((c) => c.ctr >= ctrMinVal);

    if (filters.campaignStatus === "Active") {
      result = result.filter((c) => c.cost > 0);
    } else if (filters.campaignStatus === "Top Performer") {
      result = result.filter((c) => c.conversion_rate >= 5);
    } else if (filters.campaignStatus === "Underperforming") {
      result = result.filter(
        (c) => c.cost > 0 && (c.conversions === 0 || c.conversion_rate < 1)
      );
    } else if (filters.campaignStatus === "Efficient") {
      const avgCPA =
        result
          .filter((c) => c.conversions > 0)
          .reduce((s, c) => s + c.cpa, 0) /
        (result.filter((c) => c.conversions > 0).length || 1);
      result = result.filter(
        (c) => c.conversions > 0 && c.cpa <= avgCPA
      );
    } else if (filters.campaignStatus === "No Conversions") {
      result = result.filter((c) => c.cost > 0 && c.conversions === 0);
    }

    if (filters.metricFocus === "Spend") {
      result = result.filter((c) => c.cost > 0);
    } else if (filters.metricFocus === "Conversion") {
      result = result.filter((c) => c.conversions > 0);
    } else if (filters.metricFocus === "Efficiency") {
      result = result.filter((c) => c.conversion_rate >= 3);
    }

    result.sort((a, b) => {
      switch (filters.sortBy) {
        case "clicks":
          return b.clicks - a.clicks;
        case "conversions":
          return b.conversions - a.conversions;
        case "impressions":
          return b.impressions - a.impressions;
        case "ctr":
          return b.ctr - a.ctr;
        case "cpa":
          return (a.cpa || Infinity) - (b.cpa || Infinity);
        case "efficiency":
          return b.efficiency - a.efficiency;
        default:
          return b.cost - a.cost;
      }
    });

    return result;
  }, [rawCampaigns, filters, selectedCampaign, selectedAccount, selectedStatus]);

  // Waste spend scoped to current filters (campaigns with 0 total conversions in the filtered view)
  const wasteSpend = useMemo(
    () => calculateWasteSpend(filteredCampaigns),
    [filteredCampaigns]
  );

  // ---------------------------------------------------------------------------
  // 5. DERIVED METRICS
  // ---------------------------------------------------------------------------
  const overview = useMemo(() => {
    let totalSpend = 0,
      totalClicks = 0,
      totalImpressions = 0,
      totalConversions = 0;
    filteredCampaigns.forEach((c) => {
      totalSpend += c.cost;
      totalClicks += c.clicks;
      totalImpressions += c.impressions;
      totalConversions += c.conversions;
    });
    return { totalSpend, totalClicks, totalImpressions, totalConversions };
  }, [filteredCampaigns]);

  const advMetrics = useMemo(() => {
    const ctr =
      overview.totalImpressions > 0
        ? (overview.totalClicks / overview.totalImpressions) * 100
        : 0;
    const cpc =
      overview.totalClicks > 0
        ? overview.totalSpend / overview.totalClicks
        : 0;
    const cpa =
      overview.totalConversions > 0
        ? overview.totalSpend / overview.totalConversions
        : 0;
    const cvr =
      overview.totalClicks > 0
        ? (overview.totalConversions / overview.totalClicks) * 100
        : 0;
    const efficiencyIndex =
      overview.totalSpend > 0
        ? (overview.totalConversions / overview.totalSpend) * 1000
        : 0;

    const activeCampaigns = filteredCampaigns.filter((c) => c.cost > 0).length;
    const totalCampaigns = filteredCampaigns.length;

    const elite = filteredCampaigns.filter(
      (c) => c.conversion_rate >= 8
    ).length;
    const strong = filteredCampaigns.filter(
      (c) => c.conversion_rate >= 5 && c.conversion_rate < 8
    ).length;
    const average = filteredCampaigns.filter(
      (c) => c.conversion_rate >= 2 && c.conversion_rate < 5
    ).length;
    const weak = filteredCampaigns.filter(
      (c) => c.conversion_rate > 0 && c.conversion_rate < 2
    ).length;
    const noConv = filteredCampaigns.filter(
      (c) => c.cost > 0 && c.conversions === 0
    ).length;

    const topCampaign = [...filteredCampaigns].sort(
      (a, b) => b.conversions - a.conversions
    )[0];
    const worstCampaign =
      filteredCampaigns
        .filter((c) => c.cost > 0 && c.conversions === 0)
        .sort((a, b) => b.cost - a.cost)[0] ||
      [...filteredCampaigns]
        .filter((c) => c.conversions > 0)
        .sort((a, b) => a.cpa - b.cpa)[0];
    const highestCPA = [...filteredCampaigns]
      .filter((c) => c.conversions > 0)
      .sort((a, b) => b.cpa - a.cpa)[0];

    return {
      ctr,
      cpc,
      cpa,
      cvr,
      efficiencyIndex,
      activeCampaigns,
      totalCampaigns,
      elite,
      strong,
      average,
      weak,
      noConv,
      topCampaign,
      worstCampaign,
      highestCPA,
    };
  }, [filteredCampaigns, overview]);

  const executiveScore = useMemo(() => {
    return computeExecutiveScore(
      advMetrics.ctr,
      advMetrics.cvr,
      advMetrics.cpa,
      wasteSpend,
      overview.totalSpend
    );
  }, [advMetrics, wasteSpend, overview.totalSpend]);

  const filteredTrends = useMemo(() => {
    let trends = [...(rawTrends || [])];
    const { start, end } = filters.dateRange;
    if (start && end) {
      trends = trends.filter((t) => {
        const d = new Date(t.report_date);
        return d >= start && d <= end;
      });
    }
    if (selectedAccount !== "All") {
      trends = trends.filter((t) => t.account_id === selectedAccount);
    }
    if (selectedStatus !== "All") {
      trends = trends.filter((t) => t.status === selectedStatus);
    }
    if (selectedCampaign !== "All") {
      trends = trends.filter((t) => t.campaign === selectedCampaign);
    }
    return trends;
  }, [rawTrends, filters.dateRange, selectedCampaign, selectedAccount, selectedStatus]);

  const filteredKeywords = useMemo(() => {
    let keywords = [...(rawKeywords || [])];
    const { start, end } = filters.dateRange;
    if (start && end) {
      keywords = keywords.filter((k) => {
        const d = new Date(k.report_date);
        return d >= start && d <= end;
      });
    }
    if (selectedAccount !== "All") {
      keywords = keywords.filter((k) => k.account_id === selectedAccount);
    }
    if (selectedStatus !== "All") {
      keywords = keywords.filter((k) => k.status === selectedStatus);
    }
    if (selectedCampaign !== "All") {
      keywords = keywords.filter((k) => k.campaign === selectedCampaign);
    }
    return keywords;
  }, [rawKeywords, filters.dateRange, selectedCampaign, selectedAccount, selectedStatus]);

  const recommendations = useMemo(() => {
    const recs = [...hookRecommendations];
    if (advMetrics.topCampaign && advMetrics.topCampaign.conversion_rate > 8) {
      recs.push({
        text: `Scale "${advMetrics.topCampaign.campaign}" by 20%`,
        priority: "High",
      });
    }
    if (
      advMetrics.worstCampaign &&
      advMetrics.worstCampaign.conversions === 0
    ) {
      recs.push({
        text: `Pause "${advMetrics.worstCampaign.campaign}" – zero conversions`,
        priority: "High",
      });
    }
    return recs.slice(0, 5);
  }, [hookRecommendations, advMetrics]);

  const executiveSummary = useMemo(() => {
    const bestCampaign = advMetrics.topCampaign?.campaign || "N/A";
    let recommendedAction = "No immediate action needed.";
    if (
      advMetrics.topCampaign &&
      advMetrics.topCampaign.conversion_rate > 8
    ) {
      recommendedAction = `Scale "${advMetrics.topCampaign.campaign}" by 20%`;
    } else if (
      advMetrics.worstCampaign &&
      advMetrics.worstCampaign.conversions === 0
    ) {
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
        <div className="min-h-screen px-4 py-3" style={{ background: "#0A0A0A" }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            {[...Array(8)].map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </MainLayout>
    );
  }

  const scoreColor =
    executiveScore >= 70
      ? "#9B2423"
      : executiveScore >= 40
      ? "#F3ECE0"
      : "#6B0F0E";

  return (
    <MainLayout>
      <div
        className="min-h-screen px-4 py-3 sm:px-6 sm:py-5"
        style={{ background: "#0A0A0A" }}
      >
        <div
          className="w-full h-[3px] mb-5 rounded-full"
          style={{ background: "linear-gradient(90deg,#9B2423 0%,#6B0F0E 60%,transparent 100%)" }}
        />

        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <span
                className="inline-block w-2 h-2 rounded-full animate-pulse"
                style={{ background: "#9B2423" }}
              />
              <span
                className="text-[10px] font-black tracking-[0.2em] uppercase"
                style={{ color: "#9B2423", letterSpacing: "0.18em" }}
              >
                Live Marketing Intelligence
              </span>
              <span style={{ color: "#2A2A2A" }}>|</span>
              <span className="text-xs" style={{ color: "#555" }}>
                {advMetrics.activeCampaigns} active /{" "}
                {advMetrics.totalCampaigns} campaigns
              </span>
            </div>

            <div className="flex items-center gap-4">
              <img
                src={SiegerLogo}
                alt="Sieger"
                className="h-14 sm:h-20 w-auto object-contain"
              />
              <div>
                <h1
                  className="text-xl sm:text-2xl font-bold"
                  style={{ color: "#F3ECE0" }}
                >
                  Google Ads Command Centre
                </h1>
                <p
                  className="text-[10px] font-semibold tracking-[0.25em] uppercase"
                  style={{ color: "#9B2423" }}
                >
                  PARTNERING PROGRESS
                </p>
              </div>
            </div>
            <p className="text-xs mt-1" style={{ color: "#444" }}>
              Director-level marketing intelligence & optimisation platform
            </p>
          </div>

          <div className="flex flex-wrap items-stretch gap-3">
            {wasteSpend > 0 && (
              <div
                className="rounded-xl px-4 py-3 text-right border"
                style={{
                  background: "rgba(155,36,35,0.12)",
                  borderColor: "rgba(155,36,35,0.4)",
                }}
              >
                <div
                  className="text-[9px] font-black uppercase tracking-widest mb-0.5"
                  style={{ color: "#9B2423" }}
                >
                  ⚠ Waste Spend
                </div>
                <div
                  className="font-black text-xl"
                  style={{ color: "#F3ECE0" }}
                >
                  {fmt.currency(wasteSpend)}
                </div>
              </div>
            )}

            <div
              className="rounded-xl px-5 py-3 text-right border"
              style={{
                background: "#111111",
                borderColor: "#1E1E1E",
              }}
            >
              <div
                className="text-[9px] font-semibold uppercase tracking-widest mb-0.5"
                style={{ color: "#444" }}
              >
                Perf. Score
              </div>
              <div className="font-black text-2xl" style={{ color: scoreColor }}>
                {executiveScore}
                <span className="text-sm ml-0.5" style={{ color: "#333" }}>
                  /100
                </span>
              </div>
            </div>
          </div>
        </div>

        <div
          className="flex flex-wrap items-center gap-3 mb-5 rounded-xl p-3 border"
          style={{ background: "#111111", borderColor: "#1E1E1E" }}
        >
          <span
            className="text-[9px] font-black uppercase tracking-[0.2em]"
            style={{ color: "#9B2423" }}
          >
            Time &amp; Filters
          </span>

          {[
            { label: "Last 7 days", days: 7 },
            { label: "Last 30 days", days: 30 },
            { label: "Last 90 days", days: 90 },
          ].map(({ label, days }) => {
            const active = filters.dateRange?.label === label;
            return (
              <button
                key={label}
                onClick={() => {
                  const end = new Date(dataMaxDate);
                  const start = new Date(dataMaxDate);
                  start.setDate(end.getDate() - days);
                  setFilters((f) => ({ ...f, dateRange: { start, end, label } }));
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150"
                style={
                  active
                    ? { background: "#9B2423", color: "#F3ECE0" }
                    : {
                        background: "#1A1A1A",
                        color: "#888",
                        border: "1px solid #222",
                      }
                }
              >
                {label}
              </button>
            );
          })}

          <div className="flex items-center gap-1.5">
            <input
              type="date"
              id="customStart"
              className="text-xs rounded-lg px-2 py-1.5 outline-none"
              style={{
                background: "#1A1A1A",
                color: "#F3ECE0",
                border: "1px solid #2A2A2A",
              }}
              onChange={(e) => {
                const start = e.target.value ? new Date(e.target.value) : null;
                const end = filters.dateRange?.end;
                if (start && end)
                  setFilters((f) => ({
                    ...f,
                    dateRange: { start, end, label: "Custom" },
                  }));
              }}
            />
            <span style={{ color: "#333" }}>—</span>
            <input
              type="date"
              id="customEnd"
              className="text-xs rounded-lg px-2 py-1.5 outline-none"
              style={{
                background: "#1A1A1A",
                color: "#F3ECE0",
                border: "1px solid #2A2A2A",
              }}
              onChange={(e) => {
                const end = e.target.value ? new Date(e.target.value) : null;
                const start = filters.dateRange?.start;
                if (start && end)
                  setFilters((f) => ({
                    ...f,
                    dateRange: { start, end, label: "Custom" },
                  }));
              }}
            />
          </div>

          <select
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            className="text-xs rounded-lg px-3 py-2 outline-none min-w-[220px]"
            style={{
              background: "#1A1A1A",
              color: "#F3ECE0",
              border: "1px solid #2A2A2A",
            }}
          >
            <option value="All">All Accounts</option>
            {uniqueAccounts.map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="text-xs rounded-lg px-3 py-2 outline-none min-w-[160px]"
            style={{
              background: "#1A1A1A",
              color: "#F3ECE0",
              border: "1px solid #2A2A2A",
            }}
          >
            <option value="All">All Statuses</option>
            {uniqueStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>

          <select
            value={selectedCampaign}
            onChange={(e) => setSelectedCampaign(e.target.value)}
            className="text-xs rounded-lg px-3 py-2 outline-none min-w-[200px]"
            style={{
              background: "#1A1A1A",
              color: "#F3ECE0",
              border: "1px solid #2A2A2A",
            }}
          >
            <option value="All">All Campaigns</option>
            {uniqueCampaigns.map((c) => (
              <option key={c.campaign} value={c.campaign}>
                {c.campaign}
              </option>
            ))}
          </select>
        </div>

        <DirectorFilterStrip
          filters={filters}
          setFilters={setFilters}
          onClear={clearFilters}
          hasActiveFilters={hasActiveDirectorFilters}
        />

        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3 mb-5">
          {[
            {
              label: "Total Spend",
              value: fmt.currency(overview.totalSpend),
              subValue: `${advMetrics.activeCampaigns} active`,
              accent: "red",
            },
            {
              label: "Total Clicks",
              value: fmt.num(overview.totalClicks),
              subValue: `CTR ${advMetrics.ctr.toFixed(2)}%`,
              accent: "cream",
            },
            {
              label: "Impressions",
              value: fmt.num(overview.totalImpressions),
              subValue: `${advMetrics.totalCampaigns} campaigns`,
              accent: "red",
            },
            {
              label: "Conversions",
              value: fmt.num(overview.totalConversions),
              subValue: `CVR ${advMetrics.cvr.toFixed(2)}%`,
              accent: "cream",
            },
            {
              label: "Avg CPC",
              value: fmt.currency(advMetrics.cpc),
              subValue: "cost per click",
              accent: "red",
            },
            {
              label: "Avg CPA",
              value: fmt.currency(advMetrics.cpa),
              subValue: "cost per acquisition",
              accent: "cream",
            },
            {
              label: "CTR",
              value: fmt.pct(advMetrics.ctr),
              subValue:
                advMetrics.ctr >= 2
                  ? "Above 2% target"
                  : "Below 2% target",
              accent: advMetrics.ctr >= 2 ? "red" : "dark-red",
            },
            {
              label: "Efficiency Index",
              value: advMetrics.efficiencyIndex.toFixed(3),
              subValue: "conv per ₹1K",
              accent: "cream",
            },
          ].map(({ label, value, subValue, accent }) => (
            <div
              key={label}
              className="rounded-xl p-3 border flex flex-col gap-1 relative overflow-hidden"
              style={{
                background: "#111111",
                borderColor:
                  accent === "red" || accent === "dark-red"
                    ? "rgba(155,36,35,0.35)"
                    : "rgba(243,236,224,0.1)",
              }}
            >
              <div
                className="absolute top-0 left-0 right-0 h-[2px]"
                style={{
                  background:
                    accent === "red"
                      ? "#9B2423"
                      : accent === "dark-red"
                      ? "#6B0F0E"
                      : "#F3ECE0",
                }}
              />
              <span
                className="text-[9px] font-black uppercase tracking-widest"
                style={{ color: "#555" }}
              >
                {label}
              </span>
              <span
                className="text-lg font-black leading-tight"
                style={{
                  color:
                    accent === "red"
                      ? "#F3ECE0"
                      : accent === "dark-red"
                      ? "#9B2423"
                      : "#F3ECE0",
                }}
              >
                {value}
              </span>
              <span className="text-[10px]" style={{ color: "#444" }}>
                {subValue}
              </span>
            </div>
          ))}
        </div>

        <div className="mb-5">
          <ExecutiveSummaryCard {...executiveSummary} />
        </div>

        <div className="mb-5">
          <SpendTrendChart trends={filteredTrends} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
          <MonthlyComparisonChart trends={filteredTrends} />
          <ConversionFunnel overview={overview} />
        </div>

        <div className="mb-5">
          <CampaignEfficiencyMatrix campaigns={filteredCampaigns} />
        </div>

        <div className="mb-5">
          <ParetoChart campaigns={filteredCampaigns} />
        </div>

        <div className="mb-5">
          <SpendVsConversionShare campaigns={filteredCampaigns} />
        </div>

        <div className="mb-5">
          <CTRCVRQuadrant campaigns={filteredCampaigns} />
        </div>

        <div className="mb-5">
          <CPATrendChart trends={filteredTrends} />
        </div>

        <div className="mb-5">
          <CampaignHealthTreemap campaigns={filteredCampaigns} />
        </div>

        <div className="mb-5">
          <ExecutiveScoreCard
            score={executiveScore}
            efficiencyIndex={advMetrics.efficiencyIndex}
            activeRate={
              advMetrics.totalCampaigns > 0
                ? Number(((advMetrics.activeCampaigns / advMetrics.totalCampaigns) * 100).toFixed(0))
                : 0
            }
            wasteSpend={wasteSpend}
            ctr={advMetrics.ctr}
            cvr={advMetrics.cvr}
            cpa={advMetrics.cpa}
            totalSpend={overview.totalSpend}
          />
        </div>

        {/* ── KEYWORD INTELLIGENCE ── */}
        <div className="mb-3">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1" style={{ background: "#1A1A1A" }} />
            <span
              className="text-[9px] font-black uppercase tracking-[0.25em] px-3"
              style={{ color: "#9B2423" }}
            >
              Keyword Intelligence
            </span>
            <div className="h-px flex-1" style={{ background: "#1A1A1A" }} />
          </div>
        </div>

        <div className="mb-5">
          <MatchTypeAnalytics keywords={filteredKeywords} />
        </div>

        <div className="mb-5">
          <KeywordTopPerformers keywords={filteredKeywords} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
          <KeywordQuadrant keywords={filteredKeywords} />
          <KeywordCPAChart keywords={filteredKeywords} />
        </div>

        <div className="mb-5">
          <KeywordWasteAnalyzer keywords={filteredKeywords} />
        </div>

        <div className="mb-5">
          <CampaignRankingTable campaigns={filteredCampaigns} />
        </div>

        <div className="mb-5">
          <RecommendationPanel recommendations={recommendations} />
        </div>

        <AIInsightPanel
          campaigns={filteredCampaigns}
          topCampaign={advMetrics.topCampaign}
          worstCampaign={advMetrics.worstCampaign}
          highestCPA={advMetrics.highestCPA}
          wasteSpend={wasteSpend}
        />

        <div className="mb-5">
          <CampaignIntelligenceTable campaigns={filteredCampaigns} />
        </div>

        <NarrativeSummary
          overview={overview}
          campaigns={filteredCampaigns}
          wasteSpend={wasteSpend}
          performanceScore={executiveScore}
        />

        <div
          className="mt-8 pt-4 flex items-center justify-between border-t"
          style={{ borderColor: "#1A1A1A" }}
        >
          <div className="flex items-center gap-2">
            <svg width="14" height="10" viewBox="0 0 20 14">
              <polygon points="0,0 10,14 20,0" fill="#9B2423" />
              <polygon points="4,0 10,9 16,0" fill="#6B0F0E" />
            </svg>
            <span
              className="text-[9px] font-black tracking-[0.2em] uppercase"
              style={{ color: "#333" }}
            >
              Sieger · Partnering Progress
            </span>
          </div>
          <span className="text-[9px]" style={{ color: "#2A2A2A" }}>
            Google Ads Command Centre
          </span>
        </div>
      </div>
    </MainLayout>
  );
}