// ======================================================
// GOOGLE ADS EXECUTIVE INTELLIGENCE DASHBOARD
// FULL REACT CODE
// ======================================================

import { useEffect, useMemo, useState } from "react";
import axios from "axios";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  FunnelChart,
  Funnel,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ZAxis,
} from "recharts";

import {
  DollarSign,
  MousePointerClick,
  Eye,
  Target,
  TrendingUp,
  AlertTriangle,
  Brain,
  Activity,
} from "lucide-react";

const COLORS = [
  "#6366F1",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#06B6D4",
];

export default function GoogleAdsDashboard() {

  // ======================================================
  // STATES
  // ======================================================

  const [overview, setOverview] = useState(null);

  const [campaigns, setCampaigns] = useState([]);

  const [keywords, setKeywords] = useState([]);

  const [trends, setTrends] = useState([]);

  const [loading, setLoading] = useState(true);

  const [dateRange, setDateRange] =
    useState("30d");

  const [selectedCampaign, setSelectedCampaign] =
    useState("All");

  // ======================================================
  // FETCH DATA
  // ======================================================

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {

    try {

      const [
        overviewRes,
        campaignsRes,
        keywordsRes,
        trendsRes,
      ] = await Promise.all([

        axios.get(
          "https://ticketing-backend-6azk.onrender.com/api/google-ads/overview"
        ),

        axios.get(
          "https://ticketing-backend-6azk.onrender.com/api/google-ads/campaigns"
        ),

        axios.get(
          "https://ticketing-backend-6azk.onrender.com/api/google-ads/keywords"
        ),

        axios.get(
          "https://ticketing-backend-6azk.onrender.com/api/google-ads/trends"
        ),

      ]);

      setOverview(overviewRes.data);

      setCampaigns(campaignsRes.data);

      setKeywords(keywordsRes.data);

      setTrends(trendsRes.data);

    } catch (err) {

      console.error(err);

    } finally {

      setLoading(false);

    }
  };

  // ======================================================
  // FILTERS
  // ======================================================

  const filteredCampaigns = useMemo(() => {

    let filtered = [...campaigns];

    if (selectedCampaign !== "All") {

      filtered = filtered.filter(
        (c) =>
          c.campaign === selectedCampaign
      );

    }

    return filtered;

  }, [
    campaigns,
    selectedCampaign,
  ]);

  const filteredKeywords = useMemo(() => {

    let filtered = [...keywords];

    if (selectedCampaign !== "All") {

      filtered = filtered.filter(
        (k) =>
          k.campaign === selectedCampaign
      );

    }

    return filtered;

  }, [
    keywords,
    selectedCampaign,
  ]);

  const filteredTrends = useMemo(() => {

    let filtered = [...trends];

    if (dateRange === "7d") {
      filtered = filtered.slice(-7);
    }

    if (dateRange === "30d") {
      filtered = filtered.slice(-30);
    }

    if (dateRange === "90d") {
      filtered = filtered.slice(-90);
    }

    return filtered;

  }, [
    trends,
    dateRange,
  ]);

  // ======================================================
  // KPIs
  // ======================================================

  const wasteSpend = useMemo(() => {

    return campaigns
      .filter(
        (c) =>
          Number(c.conversions || 0) === 0
      )
      .reduce(
        (sum, c) =>
          sum + Number(c.cost || 0),
        0
      );

  }, [campaigns]);

  const wasteSpendPercent = useMemo(() => {

    if (!overview) return 0;

    return (
      (wasteSpend /
        Number(overview.totalSpend || 1)) *
      100
    );

  }, [wasteSpend, overview]);

  const topCampaign = useMemo(() => {

    return [...campaigns].sort(
      (a, b) =>
        Number(b.conversions || 0) -
        Number(a.conversions || 0)
    )[0];

  }, [campaigns]);

  // ======================================================
  // AI INSIGHTS
  // ======================================================

  const insights = useMemo(() => {

    const result = [];

    if (wasteSpendPercent > 30) {

      result.push(
        `₹${wasteSpend.toLocaleString()} spent without conversions`
      );

    }

    if (
      Number(overview?.avgCpc || 0) > 25
    ) {

      result.push(
        "Average CPC is increasing significantly"
      );

    }

    if (topCampaign) {

      result.push(
        `${topCampaign.campaign} is the highest converting campaign`
      );

    }

    if (
      Number(overview?.conversionRate || 0) < 2
    ) {

      result.push(
        "Conversion rate is low. Landing page optimization recommended"
      );

    }

    return result;

  }, [
    wasteSpend,
    wasteSpendPercent,
    overview,
    topCampaign,
  ]);

  // ======================================================
  // FUNNEL
  // ======================================================

  const funnelData = [
    {
      name: "Impressions",
      value:
        overview?.totalImpressions || 0,
    },
    {
      name: "Clicks",
      value:
        overview?.totalClicks || 0,
    },
    {
      name: "Conversions",
      value:
        overview?.totalConversions || 0,
    },
  ];

  // ======================================================
  // LOADING
  // ======================================================

  if (loading || !overview) {

    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center text-4xl">
        Loading Executive Dashboard...
      </div>
    );

  }

  // ======================================================
  // UI
  // ======================================================

  return (

    <div className="min-h-screen bg-[#050816] text-white p-6">

      {/* ================================================= */}
      {/* HEADER */}
      {/* ================================================= */}

      <div className="flex items-center justify-between mb-8">

        <div>

          <h1 className="text-5xl font-black">
            Google Ads Intelligence
          </h1>

          <p className="text-slate-400 mt-2">
            Executive Marketing Analytics Platform
          </p>

        </div>

        <div className="flex gap-3">

          {["7d", "30d", "90d"].map((range) => (

            <button
              key={range}
              onClick={() =>
                setDateRange(range)
              }
              className={`
                px-4 py-2 rounded-xl border
                ${
                  dateRange === range
                    ? "bg-indigo-600 border-indigo-600"
                    : "bg-slate-900 border-slate-700"
                }
              `}
            >
              {range}
            </button>

          ))}

        </div>
      </div>

      {/* ================================================= */}
      {/* FILTERS */}
      {/* ================================================= */}

      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 mb-8 flex gap-4 flex-wrap">

        <select
          value={selectedCampaign}
          onChange={(e) =>
            setSelectedCampaign(
              e.target.value
            )
          }
          className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3"
        >

          <option value="All">
            All Campaigns
          </option>

          {campaigns.map((c, index) => (

            <option
              key={index}
              value={c.campaign}
            >
              {c.campaign}
            </option>

          ))}

        </select>

      </div>

      {/* ================================================= */}
      {/* KPI GRID */}
      {/* ================================================= */}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8 gap-5 mb-8">

        <KPI
          title="Total Spend"
          value={`₹${Number(
            overview.totalSpend
          ).toLocaleString()}`}
          icon={<DollarSign />}
        />

        <KPI
          title="Clicks"
          value={Number(
            overview.totalClicks
          ).toLocaleString()}
          icon={<MousePointerClick />}
        />

        <KPI
          title="Impressions"
          value={Number(
            overview.totalImpressions
          ).toLocaleString()}
          icon={<Eye />}
        />

        <KPI
          title="Conversions"
          value={Number(
            overview.totalConversions
          ).toFixed(0)}
          icon={<Target />}
        />

        <KPI
          title="CTR"
          value={`${Number(
            overview.ctr
          ).toFixed(2)}%`}
          icon={<TrendingUp />}
        />

        <KPI
          title="Avg CPC"
          value={`₹${Number(
            overview.avgCpc
          ).toFixed(2)}`}
          icon={<Activity />}
        />

        <KPI
          title="Waste Spend"
          value={`₹${Number(
            wasteSpend
          ).toLocaleString()}`}
          icon={<AlertTriangle />}
        />

        <KPI
          title="Conv Rate"
          value={`${Number(
            overview.conversionRate
          ).toFixed(2)}%`}
          icon={<Brain />}
        />

      </div>

      {/* ================================================= */}
      {/* AI INSIGHTS */}
      {/* ================================================= */}

      <div className="bg-gradient-to-br from-indigo-900 to-slate-900 rounded-3xl border border-indigo-700 p-6 mb-8">

        <div className="flex items-center gap-3 mb-5">

          <Brain className="text-yellow-400" />

          <h2 className="text-2xl font-bold">
            AI Executive Insights
          </h2>

        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

          {insights.map((insight, index) => (

            <div
              key={index}
              className="bg-white/5 border border-white/10 rounded-2xl p-5"
            >

              {insight}

            </div>

          ))}

        </div>

      </div>

      {/* ================================================= */}
      {/* CHARTS */}
      {/* ================================================= */}

      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-6 mb-8">

        {/* TREND */}

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">

          <h2 className="text-2xl font-bold mb-6">
            Spend & Conversion Trend
          </h2>

          <ResponsiveContainer width="100%" height={400}>

            <LineChart
              data={filteredTrends}
            >

              <CartesianGrid stroke="#1E293B" />

              <XAxis
                dataKey="date"
                stroke="#94A3B8"
              />

              <YAxis stroke="#94A3B8" />

              <Tooltip />

              <Legend />

              <Bar
                dataKey="conversions"
                fill="#10B981"
              />

              <Line
                type="monotone"
                dataKey="spend"
                stroke="#6366F1"
                strokeWidth={3}
              />

            </LineChart>

          </ResponsiveContainer>

        </div>

        {/* FUNNEL */}

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">

          <h2 className="text-2xl font-bold mb-6">
            Conversion Funnel
          </h2>

          <ResponsiveContainer width="100%" height={400}>

            <FunnelChart>

              <Tooltip />

              <Funnel
                dataKey="value"
                data={funnelData}
                isAnimationActive
              />

            </FunnelChart>

          </ResponsiveContainer>

        </div>

      </div>

      {/* ================================================= */}
      {/* CAMPAIGN + KEYWORD */}
      {/* ================================================= */}

      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-6 mb-8">

        {/* CAMPAIGN */}

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">

          <h2 className="text-2xl font-bold mb-6">
            Spend per Campaign
          </h2>

          <ResponsiveContainer width="100%" height={400}>

            <BarChart
              data={filteredCampaigns}
            >

              <CartesianGrid stroke="#1E293B" />

              <XAxis
                dataKey="campaign"
                stroke="#94A3B8"
              />

              <YAxis stroke="#94A3B8" />

              <Tooltip />

              <Legend />

              <Bar
                dataKey="cost"
                fill="#6366F1"
              />

              <Line
                type="monotone"
                dataKey="conversions"
                stroke="#EF4444"
              />

            </BarChart>

          </ResponsiveContainer>

        </div>

        {/* BUBBLE */}

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">

          <h2 className="text-2xl font-bold mb-6">
            Keyword Intelligence
          </h2>

          <ResponsiveContainer width="100%" height={400}>

            <ScatterChart>

              <CartesianGrid stroke="#1E293B" />

              <XAxis
                type="number"
                dataKey="avg_cpc"
                stroke="#94A3B8"
              />

              <YAxis
                type="number"
                dataKey="conversion_rate"
                stroke="#94A3B8"
              />

              <ZAxis
                type="number"
                dataKey="cost"
                range={[60, 500]}
              />

              <Tooltip />

              <Scatter
                data={filteredKeywords}
                fill="#10B981"
              />

            </ScatterChart>

          </ResponsiveContainer>

        </div>

      </div>

      {/* ================================================= */}
      {/* PIE + WASTE */}
      {/* ================================================= */}

      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-6 mb-8">

        {/* PIE */}

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">

          <h2 className="text-2xl font-bold mb-6">
            Campaign Distribution
          </h2>

          <ResponsiveContainer width="100%" height={400}>

            <PieChart>

              <Pie
                data={filteredCampaigns}
                dataKey="cost"
                nameKey="campaign"
                outerRadius={120}
                label
              >

                {filteredCampaigns.map(
                  (entry, index) => (

                    <Cell
                      key={index}
                      fill={
                        COLORS[
                          index %
                            COLORS.length
                        ]
                      }
                    />

                  )
                )}

              </Pie>

              <Tooltip />

            </PieChart>

          </ResponsiveContainer>

        </div>

        {/* WASTE */}

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">

          <h2 className="text-2xl font-bold mb-6">
            Waste Spend Analysis
          </h2>

          <ResponsiveContainer width="100%" height={400}>

            <BarChart
              data={filteredCampaigns.filter(
                (c) =>
                  Number(
                    c.conversions
                  ) <= 1
              )}
              layout="vertical"
            >

              <CartesianGrid stroke="#1E293B" />

              <XAxis
                type="number"
                stroke="#94A3B8"
              />

              <YAxis
                dataKey="campaign"
                type="category"
                width={220}
                stroke="#94A3B8"
              />

              <Tooltip />

              <Bar
                dataKey="cost"
                fill="#EF4444"
              />

            </BarChart>

          </ResponsiveContainer>

        </div>

      </div>

      {/* ================================================= */}
      {/* TABLE */}
      {/* ================================================= */}

      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 overflow-auto">

        <h2 className="text-2xl font-bold mb-6">
          Campaign Intelligence Table
        </h2>

        <table className="w-full min-w-[1200px]">

          <thead>

            <tr className="border-b border-slate-800 text-left text-slate-400">

              <th className="pb-4">
                Campaign
              </th>

              <th className="pb-4">
                Spend
              </th>

              <th className="pb-4">
                Clicks
              </th>

              <th className="pb-4">
                Conversions
              </th>

              <th className="pb-4">
                Avg CPC
              </th>

              <th className="pb-4">
                Recommendation
              </th>

            </tr>

          </thead>

          <tbody>

            {filteredCampaigns.map(
              (campaign, index) => {

                let recommendation =
                  "Monitor";

                if (
                  Number(
                    campaign.conversions
                  ) === 0
                ) {

                  recommendation =
                    "Pause Campaign";

                }

                if (
                  Number(
                    campaign.conversions
                  ) > 10
                ) {

                  recommendation =
                    "Scale Campaign";

                }

                return (

                  <tr
                    key={index}
                    className="border-b border-slate-800"
                  >

                    <td className="py-5">
                      {campaign.campaign}
                    </td>

                    <td className="py-5">
                      ₹
                      {Number(
                        campaign.cost
                      ).toLocaleString()}
                    </td>

                    <td className="py-5">
                      {campaign.clicks}
                    </td>

                    <td className="py-5">
                      {
                        campaign.conversions
                      }
                    </td>

                    <td className="py-5">
                      ₹
                      {Number(
                        campaign.avg_cpc
                      ).toFixed(2)}
                    </td>

                    <td className="py-5">

                      <span className="px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-sm">

                        {recommendation}

                      </span>

                    </td>

                  </tr>

                );
              }
            )}

          </tbody>

        </table>

      </div>

    </div>
  );
}

// ======================================================
// KPI COMPONENT
// ======================================================

function KPI({
  title,
  value,
  icon,
}) {

  return (

    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5">

      <div className="flex items-center justify-between">

        <div>

          <p className="text-slate-400 text-sm">
            {title}
          </p>

          <h2 className="text-3xl font-bold mt-3">
            {value}
          </h2>

        </div>

        <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center">

          {icon}

        </div>

      </div>

    </div>
  );
}