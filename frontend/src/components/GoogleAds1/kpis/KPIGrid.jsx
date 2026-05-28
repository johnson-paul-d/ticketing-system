import {
  DollarSign,
  MousePointerClick,
  Eye,
  Target,
} from "lucide-react";

const Card = ({
  icon,
  label,
  value,
  color,
}) => {

  return (

    <div className="
      bg-slate-900
      border border-slate-800
      rounded-2xl
      p-5
    ">

      <div className="
        flex items-center justify-between
      ">

        <div>

          <p className="
            text-slate-400
            text-sm
          ">
            {label}
          </p>

          <h2 className="
            text-3xl
            font-bold
            text-white
            mt-2
          ">
            {value}
          </h2>

        </div>

        <div className={`
          w-12 h-12 rounded-xl
          flex items-center justify-center
          ${color}
        `}>
          {icon}
        </div>

      </div>

    </div>
  );
};

export default function KPIGrid({
  overview,
  wasteSpend,
}) {

  return (

    <div className="
      grid grid-cols-1
      md:grid-cols-2
      xl:grid-cols-5
      gap-5 mb-6
    ">

      <Card
        label="Total Spend"
        value={`₹${Number(
          overview?.totalSpend || 0
        ).toLocaleString()}`}
        icon={<DollarSign />}
        color="bg-red-500/20 text-red-400"
      />

      <Card
        label="Clicks"
        value={Number(
          overview?.totalClicks || 0
        ).toLocaleString()}
        icon={<MousePointerClick />}
        color="bg-blue-500/20 text-blue-400"
      />

      <Card
        label="Impressions"
        value={Number(
          overview?.totalImpressions || 0
        ).toLocaleString()}
        icon={<Eye />}
        color="bg-purple-500/20 text-purple-400"
      />

      <Card
        label="Conversions"
        value={Number(
          overview?.totalConversions || 0
        ).toLocaleString()}
        icon={<Target />}
        color="bg-green-500/20 text-green-400"
      />

      <Card
        label="Waste Spend"
        value={`₹${wasteSpend.toLocaleString()}`}
        icon={<Target />}
        color="bg-orange-500/20 text-orange-400"
      />

    </div>
  );
}