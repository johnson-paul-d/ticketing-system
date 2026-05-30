import { fmt } from "../../../utils/googleAdsMetrics";

const ExecutiveSummaryCard = ({ spend, conversions, cpa, bestCampaign, wasteSpend, recommendedAction }) => (
  <div className="bg-gradient-to-r from-[#0c1425] to-[#0f172a] border border-slate-800 rounded-2xl p-5 mb-5">
    <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
      Executive Summary
    </h2>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      <div>
        <div className="text-[10px] text-slate-500 uppercase">Total Spend</div>
        <div className="text-2xl font-black text-white">{fmt.currency(spend)}</div>
      </div>
      <div>
        <div className="text-[10px] text-slate-500 uppercase">Conversions</div>
        <div className="text-2xl font-black text-white">{fmt.num(conversions)}</div>
      </div>
      <div>
        <div className="text-[10px] text-slate-500 uppercase">Avg CPA</div>
        <div className="text-2xl font-black text-white">{fmt.currency(cpa)}</div>
      </div>
      <div>
        <div className="text-[10px] text-slate-500 uppercase">Best Campaign</div>
        <div className="text-sm font-semibold text-emerald-400 truncate">{bestCampaign}</div>
      </div>
      <div>
        <div className="text-[10px] text-slate-500 uppercase">Waste Spend</div>
        <div className="text-sm font-semibold text-red-400">{fmt.currency(wasteSpend)}</div>
      </div>
    </div>
    <div className="mt-4 pt-3 border-t border-slate-800/50 text-xs">
      <span className="text-slate-500">📌 Recommended Action: </span>
      <span className="text-white">{recommendedAction}</span>
    </div>
  </div>
);

export default ExecutiveSummaryCard;