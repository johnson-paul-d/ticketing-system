// AI Insights Panel (Phase 4 – uses real campaign names)import { fmt } from "../../../../utils/googleAdsMetrics";
import { fmt } from "../../../../utils/googleAdsMetrics";
const AIInsightPanel = ({ campaigns, topCampaign, worstCampaign, highestCPA, wasteSpend }) => {
  const insights = [];

  if (topCampaign) {
    insights.push({
      priority: "High",
      text: `Scale "${topCampaign.campaign}" — ${topCampaign.conversions} conversions at ${fmt.currency(topCampaign.cpa)} CPA`,
    });
  }
  if (worstCampaign && worstCampaign.conversions === 0) {
    insights.push({
      priority: "High",
      text: `Pause "${worstCampaign.campaign}" — spent ${fmt.currency(worstCampaign.cost)} with zero conversions`,
    });
  }
  if (highestCPA && highestCPA.cpa > 5000) {
    insights.push({
      priority: "Medium",
      text: `Reduce CPC on "${highestCPA.campaign}" — CPA at ${fmt.currency(highestCPA.cpa)} is above target`,
    });
  }
  const underperforming = campaigns.filter(c => c.conversion_rate > 0 && c.conversion_rate < 2).slice(0, 2);
  underperforming.forEach(c => {
    insights.push({
      priority: "Low",
      text: `Review ad copy for "${c.campaign}" — CVR only ${c.conversion_rate.toFixed(1)}%`,
    });
  });

  if (insights.length === 0) {
    insights.push({ priority: "Info", text: "All campaigns are performing within acceptable ranges." });
  }

  return (
    <div className="bg-[#0c1425] border border-slate-800 rounded-2xl p-5 mb-5">
      <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
        AI-Powered Insights
      </h3>
      <div className="space-y-2">
        {insights.map((insight, idx) => (
          <div key={idx} className="flex items-start gap-2 text-xs">
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
              insight.priority === "High" ? "bg-red-950 text-red-400" :
              insight.priority === "Medium" ? "bg-amber-950 text-amber-400" :
              "bg-blue-950 text-blue-400"
            }`}>
              {insight.priority}
            </span>
            <span className="text-slate-300">{insight.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AIInsightPanel;