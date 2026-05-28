import { useEffect, useMemo, useState } from "react";
import MainLayout from "../layouts/MainLayout";
import api from "../services/api";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  ZAxis,
  FunnelChart,
  Funnel,
  LabelList,
} from "recharts";

import {
  IndianRupee,
  MousePointerClick,
  Eye,
  Target,
  TrendingUp,
  AlertTriangle,
  Sparkles,
  Activity,
} from "lucide-react";

import { motion } from "framer-motion";

const COLORS = [
  "#6366F1",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#06B6D4",
];

export default function GoogleAdsDashboard() {
  const [overview, setOverview] = useState(null);
  const [trends, setTrends] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [keywords, setKeywords] = useState([]);
  const [loading, setLoading] = useState(true);

  const [dateRange, setDateRange] = useState("30d");
  const [selectedCampaign, setSelectedCampaign] = useState("All");

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      const [overviewRes, trendsRes, campaignsRes, keywordsRes] =
        await Promise.all([
          api.get("/google-ads/overview"),
          api.get("/google-ads/trends"),
          api.get("/google-ads/campaigns"),
          api.get("/google-ads/keywords"),
        ]);

      setOverview(overviewRes.data);
      setTrends(trendsRes.data);
      setCampaigns(campaignsRes.data);
      setKeywords(keywordsRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ========== FILTERED TRENDS (Date + Campaign) ==========
  const filteredTrends = useMemo(() => {
    let filtered = [...trends];

    // DATE FILTER
    if (dateRange === "7d") {
      filtered = filtered.slice(-7);
    } else if (dateRange === "30d") {
      filtered = filtered.slice(-30);
    } else if (dateRange === "90d") {
      filtered = filtered.slice(-90);
    } else if (dateRange === "365d") {
      filtered = filtered.slice(-365);
    }

    // CAMPAIGN FILTER
    if (selectedCampaign !== "All") {
      filtered = filtered.filter(
        (item) => item.campaign === selectedCampaign
      );
    }

    return filtered;
  }, [trends, dateRange, selectedCampaign]);

  // ========== FILTERED CAMPAIGNS ==========
  const filteredCampaigns = useMemo(() => {
    let filtered = [...campaigns];

    if (selectedCampaign !== "All") {
      filtered = filtered.filter(
        (c) => c.campaign === selectedCampaign
      );
    }

    return filtered;
  }, [campaigns, selectedCampaign]);

  // ========== FILTERED KEYWORDS ==========
  const filteredKeywords = useMemo(() => {
    let filtered = [...keywords];

    if (selectedCampaign !== "All") {
      filtered = filtered.filter(
        (k) => k.campaign === selectedCampaign
      );
    }

    return filtered;
  }, [keywords, selectedCampaign]);

  const wasteSpend = useMemo(() => {
    return campaigns
      .filter((c) => Number(c.conversions) === 0)
      .reduce((sum, c) => sum + Number(c.cost || 0), 0);
  }, [campaigns]);

  const topCampaign = useMemo(() => {
    return [...campaigns].sort(
      (a, b) =>
        Number(b.conversions || 0) -
        Number(a.conversions || 0)
    )[0];
  }, [campaigns]);

  const aiInsights = useMemo(() => {
    const insights = [];

    if (wasteSpend > 10000) {
      insights.push(
        `₹${wasteSpend.toLocaleString()} spent on campaigns with zero conversions.`
      );
    }

    if (overview?.avgCpc > 25) {
      insights.push(
        `Average CPC is high. Consider keyword optimization.`
      );
    }

    if (topCampaign) {
      insights.push(
        `${topCampaign.campaign} is generating the highest conversion volume.`
      );
    }

    return insights;
  }, [wasteSpend, overview, topCampaign]);

  const funnelData = [
    {
      value: overview?.totalImpressions || 0,
      name: "Impressions",
    },
    {
      value: overview?.totalClicks || 0,
      name: "Clicks",
    },
    {
      value: overview?.totalConversions || 0,
      name: "Conversions",
    },
  ];

  if (loading || !overview) {
    return (
      <MainLayout>
        <div className="p-8 text-xl font-semibold">
          Loading Executive Intelligence Dashboard...
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="min-h-screen bg-slate-950 text-white p-6 space-y-6">

        {/* ================================================= */}
        {/* HEADER */}
        {/* ================================================= */}

        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">

          <div>
            <h1 className="text-5xl font-black tracking-tight">
              Google Ads Intelligence
            </h1>

            <p className="text-slate-400 mt-3 text-lg">
              Executive Marketing Performance Platform
            </p>
          </div>

          <div className="flex gap-3 flex-wrap">

            {["7d", "30d", "90d", "365d"].map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`
                  px-4 py-2 rounded-xl border
                  ${dateRange === range
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
        {/* KPI SECTION */}
        {/* ================================================= */}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8 gap-5">

          <KPI
            title="Total Spend"
            value={`₹${Number(overview.totalSpend).toLocaleString()}`}
            icon={<IndianRupee />}
            color="from-indigo-500 to-indigo-700"
          />

          <KPI
            title="Clicks"
            value={Number(overview.totalClicks).toLocaleString()}
            icon={<MousePointerClick />}
            color="from-emerald-500 to-emerald-700"
          />

          <KPI
            title="Impressions"
            value={Number(overview.totalImpressions).toLocaleString()}
            icon={<Eye />}
            color="from-cyan-500 to-cyan-700"
          />

          <KPI
            title="Conversions"
            value={Number(overview.totalConversions).toFixed(0)}
            icon={<Target />}
            color="from-amber-500 to-amber-700"
          />

          <KPI
            title="CTR"
            value={`${Number(overview.ctr).toFixed(2)}%`}
            icon={<TrendingUp />}
            color="from-rose-500 to-rose-700"
          />

          <KPI
            title="Avg CPC"
            value={`₹${Number(overview.avgCpc).toFixed(2)}`}
            icon={<Activity />}
            color="from-violet-500 to-violet-700"
          />

          <KPI
            title="Conv. Rate"
            value={`${Number(overview.conversionRate).toFixed(2)}%`}
            icon={<Sparkles />}
            color="from-sky-500 to-sky-700"
          />

          <KPI
            title="Waste Spend"
            value={`₹${Number(wasteSpend).toLocaleString()}`}
            icon={<AlertTriangle />}
            color="from-red-500 to-red-700"
          />
        </div>

        {/* ================================================= */}
        {/* AI INSIGHTS */}
        {/* ================================================= */}

        <div className="bg-gradient-to-br from-indigo-900 to-slate-900 rounded-3xl border border-indigo-700 p-6">

          <div className="flex items-center gap-3 mb-6">
            <Sparkles className="text-yellow-400" />

            <h2 className="text-2xl font-bold">
              AI Executive Insights
            </h2>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

            {aiInsights.map((insight, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/5 border border-white/10 rounded-2xl p-5"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="text-yellow-400 mt-1" />

                  <p className="text-slate-200 leading-relaxed">
                    {insight}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* ================================================= */}
        {/* MAIN CHARTS */}
        {/* ================================================= */}

        <div className="grid grid-cols-1 2xl:grid-cols-3 gap-6">

          {/* TREND CHART - USING FILTERED TRENDS */}

          <div className="2xl:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-6">

            <div className="mb-6">
              <h2 className="text-2xl font-bold">
                Spend vs Conversion Trend
              </h2>

              <p className="text-slate-400 mt-1">
                Daily marketing efficiency analysis
              </p>
            </div>

            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={filteredTrends}>
                <CartesianGrid stroke="#1E293B" />

                <XAxis dataKey="date" stroke="#94A3B8" />

                <YAxis stroke="#94A3B8" />

                <Tooltip />

                <Legend />

                <Bar
                  dataKey="conversions"
                  fill="#10B981"
                  radius={[6, 6, 0, 0]}
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

            <div className="mb-6">
              <h2 className="text-2xl font-bold">
                Conversion Funnel
              </h2>
            </div>

            <ResponsiveContainer width="100%" height={400}>
              <FunnelChart>
                <Tooltip />

                <Funnel
                  dataKey="value"
                  data={funnelData}
                  isAnimationActive
                >
                  <LabelList position="right" fill="#fff" stroke="none" dataKey="name" />
                </Funnel>
              </FunnelChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ================================================= */}
        {/* SECONDARY CHARTS */}
        {/* ================================================= */}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

          {/* CAMPAIGN DISTRIBUTION - USING FILTERED CAMPAIGNS */}

          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">

            <div className="mb-6">
              <h2 className="text-2xl font-bold">
                Campaign Spend Distribution
              </h2>
            </div>

            <ResponsiveContainer width="100%" height={350}>
              <PieChart>
                <Pie
                  data={filteredCampaigns}
                  dataKey="cost"
                  nameKey="campaign"
                  outerRadius={120}
                  label
                >
                  {filteredCampaigns.map((entry, index) => (
                    <Cell
                      key={index}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>

                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* KEYWORD MATRIX - USING FILTERED KEYWORDS */}

          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">

            <div className="mb-6">
              <h2 className="text-2xl font-bold">
                Keyword Intelligence Matrix
              </h2>

              <p className="text-slate-400">
                CPC vs Conversion Rate vs Spend
              </p>
            </div>

            <ResponsiveContainer width="100%" height={350}>
              <ScatterChart>
                <CartesianGrid stroke="#1E293B" />

                <XAxis
                  type="number"
                  dataKey="avg_cpc"
                  name="Avg CPC"
                  stroke="#94A3B8"
                />

                <YAxis
                  type="number"
                  dataKey="conversion_rate"
                  name="Conversion Rate"
                  stroke="#94A3B8"
                />

                <ZAxis
                  type="number"
                  dataKey="cost"
                  range={[80, 500]}
                />

                <Tooltip cursor={{ strokeDasharray: "3 3" }} />

                <Scatter
                  name="Keywords"
                  data={filteredKeywords}
                  fill="#6366F1"
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ================================================= */}
        {/* WASTE ANALYSIS - USING FILTERED CAMPAIGNS */}
        {/* ================================================= */}

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">

          <div className="mb-6">
            <h2 className="text-2xl font-bold">
              Waste Spend Analysis
            </h2>

            <p className="text-slate-400 mt-1">
              Campaigns with low or zero conversion efficiency
            </p>
          </div>

          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={filteredCampaigns.filter(
                (c) => Number(c.conversions) <= 1
              )}
              layout="vertical"
            >
              <CartesianGrid stroke="#1E293B" />

              <XAxis type="number" stroke="#94A3B8" />

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
                radius={[0, 8, 8, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* ================================================= */}
        {/* CAMPAIGN TABLE */}
        {/* ================================================= */}

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 overflow-auto">

          <div className="flex items-center justify-between mb-6">

            <div>
              <h2 className="text-2xl font-bold">
                Campaign Intelligence Table
              </h2>

              <p className="text-slate-400 mt-1">
                Executive campaign ranking and recommendations
              </p>
            </div>

            <select
              value={selectedCampaign}
              onChange={(e) =>
                setSelectedCampaign(e.target.value)
              }
              className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2"
            >
              <option>All</option>

              {campaigns.map((campaign, index) => (
                <option
                  key={index}
                  value={campaign.campaign}
                >
                  {campaign.campaign}
                </option>
              ))}
            </select>
          </div>

          <table className="w-full min-w-[1200px]">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-left">
                <th className="pb-4">Campaign</th>
                <th className="pb-4">Spend</th>
                <th className="pb-4">Clicks</th>
                <th className="pb-4">Conversions</th>
                <th className="pb-4">Avg CPC</th>
                <th className="pb-4">Performance Score</th>
                <th className="pb-4">Recommendation</th>
               </tr>
            </thead>

            <tbody>
              {filteredCampaigns.map((campaign, index) => {

                const score = Math.min(
                  100,
                  (
                    Number(campaign.conversions || 0) * 10 +
                    Number(campaign.clicks || 0) / 10
                  ).toFixed(0)
                );

                let recommendation = "Monitor";

                if (score > 70) {
                  recommendation = "Scale Campaign";
                } else if (
                  Number(campaign.conversions) === 0
                ) {
                  recommendation = "Pause Campaign";
                }

                return (
                  <tr
                    key={index}
                    className="border-b border-slate-800 hover:bg-slate-800/40"
                  >
                    <td className="py-5 font-medium">
                      {campaign.campaign}
                    </td>

                    <td className="py-5">
                      ₹{Number(campaign.cost).toLocaleString()}
                    </td>

                    <td className="py-5">
                      {campaign.clicks}
                    </td>

                    <td className="py-5">
                      {campaign.conversions}
                    </td>

                    <td className="py-5">
                      ₹{Number(campaign.avg_cpc).toFixed(2)}
                    </td>

                    <td className="py-5">
                      <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 rounded-full"
                          style={{ width: `${score}%` }}
                        />
                      </div>
                    </td>

                    <td className="py-5">
                      <span className="px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-sm">
                        {recommendation}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </MainLayout>
  );
}

function KPI({ title, value, icon, color }) {
  return (
    <motion.div
      whileHover={{ y: -5 }}
      className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 p-5"
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${color} opacity-10`} />

      <div className="relative z-10 flex items-center justify-between">

        <div>
          <p className="text-slate-400 text-sm">
            {title}
          </p>

          <h2 className="text-3xl font-bold mt-3">
            {value}
          </h2>
        </div>

        <div className={`
          w-14 h-14 rounded-2xl
          bg-gradient-to-br ${color}
          flex items-center justify-center
        `}>
          {icon}
        </div>
      </div>
    </motion.div>
  );
}