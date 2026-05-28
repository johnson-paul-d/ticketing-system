import { useEffect, useState } from "react";
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
} from "recharts";

import {
  TrendingUp,
  MousePointerClick,
  IndianRupee,
  Target,
  AlertTriangle,
  Sparkles,
} from "lucide-react";

export default function GoogleAdsDashboard() {
  const [overview, setOverview] = useState(null);
  const [trends, setTrends] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [keywords, setKeywords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      const [
        overviewRes,
        trendsRes,
        campaignRes,
        keywordRes,
      ] = await Promise.all([
        api.get("/google-ads/overview"),
        api.get("/google-ads/trends"),
        api.get("/google-ads/campaigns"),
        api.get("/google-ads/keywords"),
      ]);

      setOverview(overviewRes.data);
      setTrends(trendsRes.data);
      setCampaigns(campaignRes.data);
      setKeywords(keywordRes.data);

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const COLORS = [
    "#6366F1",
    "#10B981",
    "#F59E0B",
    "#EF4444",
  ];

  const aiInsights = [
    {
      type: "warning",
      text: "₹42K spent on low-performing keywords.",
    },
    {
      type: "success",
      text: "Phrase match keywords convert 2.4x better.",
    },
    {
      type: "danger",
      text: "Avg CPC increased 18% this week.",
    },
  ];

  if (loading) {
    return (
      <MainLayout>
        <div className="p-8 text-xl font-semibold">
          Loading Google Ads Intelligence...
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="p-6 space-y-6">

        {/* ================================================= */}
        {/* HEADER */}
        {/* ================================================= */}

        <div className="flex items-center justify-between">

          <div>
            <h1 className="text-4xl font-bold text-slate-900">
              Google Ads Intelligence
            </h1>

            <p className="text-slate-500 mt-2">
              Executive Marketing Performance Platform
            </p>
          </div>

          <div className="bg-indigo-50 px-4 py-2 rounded-xl text-indigo-700 font-semibold">
            Last 30 Days
          </div>
        </div>

        {/* ================================================= */}
        {/* KPI CARDS */}
        {/* ================================================= */}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6">

          <KpiCard
            title="Total Spend"
            value={`₹${Number(
              overview.totalSpend
            ).toLocaleString()}`}
            icon={<IndianRupee />}
            color="bg-indigo-500"
          />

          <KpiCard
            title="Total Clicks"
            value={Number(
              overview.totalClicks
            ).toLocaleString()}
            icon={<MousePointerClick />}
            color="bg-emerald-500"
          />

          <KpiCard
            title="Conversions"
            value={Number(
              overview.totalConversions
            ).toFixed(0)}
            icon={<Target />}
            color="bg-amber-500"
          />

          <KpiCard
            title="Avg CPC"
            value={`₹${Number(
              overview.avgCpc
            ).toFixed(2)}`}
            icon={<TrendingUp />}
            color="bg-rose-500"
          />

          <KpiCard
            title="CTR"
            value={`${Number(
              overview.ctr
            ).toFixed(2)}%`}
            icon={<Sparkles />}
            color="bg-slate-700"
          />
        </div>

        {/* ================================================= */}
        {/* TREND CHART */}
        {/* ================================================= */}

        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">

          <div className="mb-6">
            <h2 className="text-2xl font-bold">
              Spend vs Conversion Trend
            </h2>

            <p className="text-slate-500">
              Daily campaign efficiency tracking
            </p>
          </div>

          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={trends}>

              <CartesianGrid strokeDasharray="3 3" />

              <XAxis dataKey="date" />

              <YAxis />

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

        {/* ================================================= */}
        {/* AI INSIGHTS */}
        {/* ================================================= */}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

          <div className="xl:col-span-1 bg-slate-900 text-white rounded-3xl p-6">

            <div className="flex items-center gap-3 mb-6">
              <Sparkles className="text-yellow-400" />

              <h2 className="text-2xl font-bold">
                AI Insights
              </h2>
            </div>

            <div className="space-y-4">

              {aiInsights.map((item, index) => (
                <div
                  key={index}
                  className="bg-white/10 p-4 rounded-2xl"
                >
                  <div className="flex items-start gap-3">

                    <AlertTriangle
                      className="text-yellow-400 mt-1"
                      size={18}
                    />

                    <p className="text-sm leading-relaxed">
                      {item.text}
                    </p>

                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ================================================= */}
          {/* PIE CHART */}
          {/* ================================================= */}

          <div className="xl:col-span-2 bg-white rounded-3xl shadow-sm border border-slate-200 p-6">

            <div className="mb-6">
              <h2 className="text-2xl font-bold">
                Campaign Spend Distribution
              </h2>

              <p className="text-slate-500">
                Budget allocation across campaigns
              </p>
            </div>

            <ResponsiveContainer width="100%" height={350}>

              <PieChart>

                <Pie
                  data={campaigns}
                  dataKey="cost"
                  nameKey="campaign"
                  outerRadius={130}
                  label
                >

                  {campaigns.map((entry, index) => (
                    <Cell
                      key={index}
                      fill={
                        COLORS[
                          index % COLORS.length
                        ]
                      }
                    />
                  ))}

                </Pie>

                <Tooltip />

              </PieChart>

            </ResponsiveContainer>
          </div>
        </div>

        {/* ================================================= */}
        {/* KEYWORD BUBBLE CHART */}
        {/* ================================================= */}

        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">

          <div className="mb-6">

            <h2 className="text-2xl font-bold">
              Keyword Intelligence Matrix
            </h2>

            <p className="text-slate-500">
              CPC vs Conversion Rate vs Spend
            </p>

          </div>

          <ResponsiveContainer width="100%" height={450}>

            <ScatterChart>

              <CartesianGrid />

              <XAxis
                type="number"
                dataKey="avg_cpc"
                name="Avg CPC"
              />

              <YAxis
                type="number"
                dataKey="conversion_rate"
                name="Conversion Rate"
              />

              <ZAxis
                type="number"
                dataKey="cost"
                range={[80, 500]}
              />

              <Tooltip cursor={{ strokeDasharray: "3 3" }} />

              <Scatter
                name="Keywords"
                data={keywords}
                fill="#6366F1"
              />

            </ScatterChart>

          </ResponsiveContainer>
        </div>

        {/* ================================================= */}
        {/* CAMPAIGN TABLE */}
        {/* ================================================= */}

        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">

          <div className="mb-6">

            <h2 className="text-2xl font-bold">
              Campaign Intelligence
            </h2>

            <p className="text-slate-500">
              Director-level campaign performance overview
            </p>

          </div>

          <div className="overflow-auto">

            <table className="w-full">

              <thead>

                <tr className="border-b border-slate-200 text-left">

                  <th className="pb-4">Campaign</th>
                  <th className="pb-4">Spend</th>
                  <th className="pb-4">Clicks</th>
                  <th className="pb-4">Conversions</th>
                  <th className="pb-4">Avg CPC</th>
                  <th className="pb-4">Recommendation</th>

                </tr>

              </thead>

              <tbody>

                {campaigns.map((campaign, index) => (

                  <tr
                    key={index}
                    className="border-b border-slate-100"
                  >

                    <td className="py-4 font-medium">
                      {campaign.campaign}
                    </td>

                    <td className="py-4">
                      ₹{Number(
                        campaign.cost
                      ).toLocaleString()}
                    </td>

                    <td className="py-4">
                      {campaign.clicks}
                    </td>

                    <td className="py-4">
                      {campaign.conversions}
                    </td>

                    <td className="py-4">
                      ₹{Number(
                        campaign.avg_cpc
                      ).toFixed(2)}
                    </td>

                    <td className="py-4">

                      <span className="
                        px-3 py-1 rounded-full
                        bg-emerald-100
                        text-emerald-700
                        text-sm
                        font-medium
                      ">
                        Scale Campaign
                      </span>

                    </td>

                  </tr>

                ))}

              </tbody>

            </table>
          </div>
        </div>

      </div>
    </MainLayout>
  );
}

/* ===================================================== */
/* KPI CARD */
/* ===================================================== */

function KpiCard({
  title,
  value,
  icon,
  color,
}) {
  return (
    <div className="
      bg-white
      rounded-3xl
      p-6
      shadow-sm
      border
      border-slate-200
      relative
      overflow-hidden
    ">

      <div className={`
        absolute top-0 right-0
        w-24 h-24
        opacity-10 rounded-full
        -mr-8 -mt-8
        ${color}
      `} />

      <div className="flex items-center justify-between">

        <div>

          <p className="text-slate-500 text-sm">
            {title}
          </p>

          <h2 className="text-3xl font-bold mt-2 text-slate-900">
            {value}
          </h2>

        </div>

        <div className={`
          w-12 h-12 rounded-2xl
          flex items-center justify-center
          text-white
          ${color}
        `}>
          {icon}
        </div>

      </div>
    </div>
  );
}