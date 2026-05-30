// Director Filter Strip (Phase 5 – affects everything)
function DirectorFilterStrip({ filters, setFilters, onClear, hasActiveFilters }) {
  const sel = "bg-transparent text-xs text-white border-none outline-none cursor-pointer appearance-none";
  const inp = "bg-transparent text-xs text-white border-none outline-none w-16 placeholder:text-slate-700";
  const pill = "flex items-center gap-2 bg-[#0c1425] border border-slate-700/60 rounded-xl px-3 py-2";

  return (
    <div className="flex flex-wrap items-center gap-2 mb-5">
      <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mr-1">Director Filters</span>

      <div className={pill}>
        <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wide whitespace-nowrap">Sort</span>
        <select value={filters.sortBy} onChange={(e) => setFilters((f) => ({ ...f, sortBy: e.target.value }))} className={sel}>
          <option value="cost">Spend ↓</option>
          <option value="clicks">Clicks ↓</option>
          <option value="conversions">Conversions ↓</option>
          <option value="impressions">Impressions ↓</option>
          <option value="ctr">CTR ↓</option>
          <option value="cpa">CPA ↑ (best first)</option>
          <option value="efficiency">Efficiency ↓</option>
        </select>
      </div>

      <div className={pill}>
        <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wide whitespace-nowrap">Status</span>
        <select value={filters.campaignStatus} onChange={(e) => setFilters((f) => ({ ...f, campaignStatus: e.target.value }))} className={sel}>
          <option value="All">All</option>
          <option value="Active">Active</option>
          <option value="Top Performer">Top Performers</option>
          <option value="Underperforming">Underperforming</option>
          <option value="Efficient">Below Avg CPA</option>
          <option value="No Conversions">Zero Conversions</option>
        </select>
      </div>

      <div className={pill}>
        <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wide whitespace-nowrap">Focus</span>
        <select value={filters.metricFocus} onChange={(e) => setFilters((f) => ({ ...f, metricFocus: e.target.value }))} className={sel}>
          <option value="All">All Metrics</option>
          <option value="Spend">Spend-Based</option>
          <option value="Conversion">Conversion-Based</option>
          <option value="Efficiency">Efficiency Only</option>
        </select>
      </div>

      <div className={pill}>
        <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wide whitespace-nowrap">Min ₹</span>
        <input type="number" min={0} placeholder="0" value={filters.minSpend} onChange={(e) => setFilters((f) => ({ ...f, minSpend: e.target.value }))} className={inp} />
      </div>

      <div className={pill}>
        <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wide whitespace-nowrap">Min Conv</span>
        <input type="number" min={0} placeholder="0" value={filters.conversionMin} onChange={(e) => setFilters((f) => ({ ...f, conversionMin: e.target.value }))} className={inp} />
      </div>

      <div className={pill}>
        <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wide whitespace-nowrap">Max CPA ₹</span>
        <input type="number" min={0} placeholder="∞" value={filters.cpaMax} onChange={(e) => setFilters((f) => ({ ...f, cpaMax: e.target.value }))} className={inp} />
      </div>

      <div className={pill}>
        <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wide whitespace-nowrap">Min CTR %</span>
        <input type="number" min={0} step={0.1} placeholder="0" value={filters.ctrMin} onChange={(e) => setFilters((f) => ({ ...f, ctrMin: e.target.value }))} className={inp} />
      </div>

      <div className={pill}>
        <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wide whitespace-nowrap">Min Impr</span>
        <input type="number" min={0} placeholder="0" value={filters.impressionMin} onChange={(e) => setFilters((f) => ({ ...f, impressionMin: e.target.value }))} className={inp} />
      </div>

      {hasActiveFilters && (
        <button onClick={onClear} className="text-[11px] text-red-400 border border-red-800/50 bg-red-950/30 px-3 py-2 rounded-xl hover:bg-red-950/60 transition-colors">
          ✕ Clear All
        </button>
      )}
    </div>
  );
}
export default DirectorFilterStrip;