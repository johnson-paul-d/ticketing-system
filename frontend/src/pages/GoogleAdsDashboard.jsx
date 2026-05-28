import { useState } from "react";

import MainLayout from "../layouts/MainLayout";

import useGoogleAdsData from "../hooks/useGoogleAdsData";
import useExecutiveMetrics from "../hooks/useExecutiveMetrics";

import ExecutiveFilters from "../components/googleAds/filters/ExecutiveFilters";

import KPIGrid from "../components/googleAds/kpis/KPIGrid";
import ExecutiveScoreCard from "../components/googleAds/kpis/ExecutiveScoreCard";

import CampaignEfficiencyMatrix from "../components/googleAds/charts/CampaignEfficiencyMatrix";
import MatchTypeAnalytics from "../components/googleAds/charts/MatchTypeAnalytics";
import SpendTrendChart from "../components/googleAds/charts/SpendTrendChart";
import WasteSpendTrend from "../components/googleAds/charts/WasteSpendTrend";
import ForecastChart from "../components/googleAds/charts/ForecastChart";
import MomentumChart from "../components/googleAds/charts/MomentumChart";
import TemporalHeatmap from "../components/googleAds/charts/TemporalHeatmap";

import OpportunityTable from "../components/googleAds/tables/OpportunityTable";
import CampaignIntelligenceTable from "../components/googleAds/tables/CampaignIntelligenceTable";

import RecommendationPanel from "../components/googleAds/insights/RecommendationPanel";
import NarrativeSummary from "../components/googleAds/insights/NarrativeSummary";

export default function GoogleAdsDashboard() {

  // =====================================================
  // DATA
  // =====================================================

  const {
    overview,
    campaigns,
    keywords,
    trends,
    loading,
  } = useGoogleAdsData();

  // =====================================================
  // FILTERS
  // =====================================================

  const [filters, setFilters] =
    useState({

      campaign: "All",

      dateRange: "30d",

      matchType: "All",

      performanceTier: "All",

      keywordSearch: "",

    });

  // =====================================================
  // EXECUTIVE METRICS
  // =====================================================

  const {
    wasteSpend,
    performanceScore,
    recommendations,
  } = useExecutiveMetrics({
    overview,
    campaigns,
  });

  // =====================================================
  // FILTERED CAMPAIGNS
  // =====================================================

  const filteredCampaigns =
    campaigns.filter((campaign) => {

      // CAMPAIGN FILTER

      if (
        filters.campaign !== "All" &&
        campaign.campaign !==
          filters.campaign
      ) {
        return false;
      }

      return true;
    });

  // =====================================================
  // FILTERED KEYWORDS
  // =====================================================

  const filteredKeywords =
    keywords.filter((keyword) => {

      // MATCH TYPE FILTER

      if (
        filters.matchType !== "All" &&
        keyword.match_type !==
          filters.matchType
      ) {
        return false;
      }

      // KEYWORD SEARCH

      if (
        filters.keywordSearch &&
        !keyword.keyword
          ?.toLowerCase()
          .includes(
            filters.keywordSearch
              .toLowerCase()
          )
      ) {
        return false;
      }

      return true;
    });

  // =====================================================
  // LOADING
  // =====================================================

  if (loading) {

    return (

      <MainLayout>

        <div className="
          min-h-screen
          bg-[#020617]
          flex items-center
          justify-center
        ">

          <div className="
            text-center
          ">

            <div className="
              w-14 h-14
              border-4
              border-indigo-500
              border-t-transparent
              rounded-full
              animate-spin
              mx-auto
              mb-5
            " />

            <h2 className="
              text-white
              text-2xl
              font-bold
            ">
              Loading Intelligence
            </h2>

            <p className="
              text-slate-400
              mt-2
            ">
              Processing executive analytics...
            </p>

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

      <div className="
        min-h-screen
        bg-[#020617]
        px-6
        py-5
      ">

        {/* =====================================================
            EXECUTIVE HEADER
        ===================================================== */}

        <div className="
          flex items-start
          justify-between
          mb-6
        ">

          <div>

            <div className="
              flex items-center
              gap-3
              mb-2
            ">

              <div className="
                w-3 h-3
                rounded-full
                bg-emerald-500
                animate-pulse
              " />

              <span className="
                text-emerald-400
                text-sm
                font-medium
              ">
                LIVE MARKETING INTELLIGENCE
              </span>

            </div>

            <h1 className="
              text-4xl
              font-black
              tracking-tight
              text-white
            ">
              Google Ads Intelligence
            </h1>

            <p className="
              text-slate-400
              mt-1
              text-sm
            ">
              Executive marketing analytics & optimization platform
            </p>

          </div>

          <div className="
            flex items-center
            gap-3
          ">

            <div className="
              bg-slate-900
              border border-slate-800
              rounded-2xl
              px-4 py-3
            ">

              <div className="
                text-xs
                text-slate-400
              ">
                Last Updated
              </div>

              <div className="
                text-white
                font-semibold
                mt-1
              ">
                Real-Time
              </div>

            </div>

          </div>

        </div>

        {/* =====================================================
            FILTERS
        ===================================================== */}

        <ExecutiveFilters
          filters={filters}
          setFilters={setFilters}
          campaigns={campaigns}
        />

        {/* =====================================================
            KPI GRID
        ===================================================== */}

        <KPIGrid
          overview={overview}
          wasteSpend={wasteSpend}
        />

        {/* =====================================================
            HERO SECTION
        ===================================================== */}

        <div className="
          grid grid-cols-1
          xl:grid-cols-3
          gap-4
          mb-4
        ">

          <div className="
            xl:col-span-2
          ">

            <CampaignEfficiencyMatrix
              campaigns={
                filteredCampaigns
              }
            />

          </div>

          <ExecutiveScoreCard
            score={performanceScore}
          />

        </div>

        {/* =====================================================
            MATCH TYPE + WASTE ANALYTICS
        ===================================================== */}

        <div className="
          grid grid-cols-1
          xl:grid-cols-2
          gap-4
          mb-4
        ">

          <MatchTypeAnalytics
            keywords={
              filteredKeywords
            }
          />

          <WasteSpendTrend
            trends={trends}
          />

        </div>

        {/* =====================================================
            SPEND + FORECAST
        ===================================================== */}

        <div className="
          grid grid-cols-1
          xl:grid-cols-2
          gap-4
          mb-4
        ">

          <SpendTrendChart
            trends={trends}
          />

          <ForecastChart
            trends={trends}
          />

        </div>

        {/* =====================================================
            MOMENTUM + OPPORTUNITY
        ===================================================== */}

        <div className="
          grid grid-cols-1
          xl:grid-cols-2
          gap-4
          mb-4
        ">

          <MomentumChart
            campaigns={
              filteredCampaigns
            }
          />

          <OpportunityTable
            campaigns={
              filteredCampaigns
            }
          />

        </div>

        {/* =====================================================
            TEMPORAL HEATMAP
        ===================================================== */}

        <div className="
          mb-4
        ">

          <TemporalHeatmap
            trends={trends}
          />

        </div>

        {/* =====================================================
            RECOMMENDATIONS
        ===================================================== */}

        <div className="
          mb-4
        ">

          <RecommendationPanel
            recommendations={
              recommendations
            }
          />

        </div>

        {/* =====================================================
            CAMPAIGN INTELLIGENCE TABLE
        ===================================================== */}

        <div className="
          mb-4
        ">

          <CampaignIntelligenceTable
            campaigns={
              filteredCampaigns
            }
          />

        </div>

        {/* =====================================================
            EXECUTIVE NARRATIVE
        ===================================================== */}

        <NarrativeSummary
          overview={overview}
          campaigns={
            filteredCampaigns
          }
          wasteSpend={wasteSpend}
          performanceScore={
            performanceScore
          }
        />

      </div>

    </MainLayout>
  );
}
