import {
  DollarSign,
  MousePointerClick,
  Eye,
  Target,
  AlertTriangle,
  Activity,
  BarChart3,
  Heart,
  Layers,
} from "lucide-react";

const Card = ({ icon, label, value, color, subtext }) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-slate-400 text-sm">{label}</p>
          <h2 className="text-3xl font-bold text-white mt-2">{value}</h2>
          {subtext && <p className="text-slate-500 text-xs mt-1">{subtext}</p>}
        </div>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
          {icon}
        </div>
      </div>
    </div>
  );
};

export default function KPIGrid({
  overview,
  wasteSpend,
  zeroConversionDays,
  // New required props
  totalCampaigns,
  activeCampaigns,        // campaigns with cost > 0? For both rate and count
  performanceScore,       // 0-100
  totalSpend,             // already in overview, but accept explicitly if needed
  totalConversions,       // already in overview
}) {
  // Compute Active Campaign Rate
  const activeCampaignRate =
    totalCampaigns > 0 ? (activeCampaigns / totalCampaigns) * 100 : 0;

  // Compute Conversion Efficiency (conversions per ₹1000 spend)
  const conversionEfficiency =
    totalSpend > 0 ? (totalConversions / totalSpend) * 1000 : 0;

  // Determine color for Campaign Health based on score
  let healthColor = "bg-red-500/20 text-red-400";
  let healthSubtext = "Needs Attention";
  if (performanceScore > 80) {
    healthColor = "bg-green-500/20 text-green-400";
    healthSubtext = "Excellent";
  } else if (performanceScore >= 60) {
    healthColor = "bg-yellow-500/20 text-yellow-400";
    healthSubtext = "Good";
  }

  // Use overview data (fallback)
  const spend = totalSpend ?? overview?.totalSpend ?? 0;
  const conversions = totalConversions ?? overview?.totalConversions ?? 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 mb-6">
      {/* Original Cards */}
      <Card
        label="Total Spend"
        value={`₹${Number(spend).toLocaleString()}`}
        icon={<DollarSign />}
        color="bg-red-500/20 text-red-400"
      />
      <Card
        label="Clicks"
        value={Number(overview?.totalClicks || 0).toLocaleString()}
        icon={<MousePointerClick />}
        color="bg-blue-500/20 text-blue-400"
      />
      <Card
        label="Impressions"
        value={Number(overview?.totalImpressions || 0).toLocaleString()}
        icon={<Eye />}
        color="bg-purple-500/20 text-purple-400"
      />
      <Card
        label="Conversions"
        value={Number(conversions).toLocaleString()}
        icon={<Target />}
        color="bg-green-500/20 text-green-400"
      />
      <Card
        label="Waste Spend"
        value={`₹${Number(wasteSpend || 0).toLocaleString()}`}
        icon={<Target />}
        color="bg-orange-500/20 text-orange-400"
      />
      <Card
        label="Zero Conv Days"
        value={Number(zeroConversionDays || 0).toLocaleString()}
        icon={<AlertTriangle />}
        color="bg-red-500/20 text-red-400"
      />

      {/* New Metrics */}
      <Card
        label="Active Campaign Rate"
        value={`${activeCampaignRate.toFixed(1)}%`}
        icon={<Activity />}
        color="bg-cyan-500/20 text-cyan-400"
        subtext={`${activeCampaigns} active out of ${totalCampaigns}`}
      />
      <Card
        label="Efficiency Index"
        value={Number(conversionEfficiency || 0).toFixed(2)}
        icon={<BarChart3 />}
        color="bg-indigo-500/20 text-indigo-400"
        subtext="Conversions per ₹1000 spent"
      />
      <Card
        label="Campaign Health"
        value={Math.round(performanceScore)}
        icon={<Heart />}
        color={healthColor}
        subtext={healthSubtext}
      />
      <Card
        label="Active Campaigns"
        value={`${activeCampaigns} / ${totalCampaigns}`}
        icon={<Layers />}
        color="bg-emerald-500/20 text-emerald-400"
        subtext="Campaigns with spend > 0"
      />
    </div>
  );
}