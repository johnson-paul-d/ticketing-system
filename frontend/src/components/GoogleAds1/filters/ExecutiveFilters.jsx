export default function ExecutiveFilters({
  filters,
  setFilters,
  campaigns,
}) {

  const uniqueCampaigns = [
    "All",
    ...new Set(
      campaigns.map((c) => c.campaign)
    ),
  ];

  return (

    <div className="
      sticky top-0 z-40
      bg-[#071028]
      border border-slate-800
      rounded-2xl
      p-4
      flex gap-4 flex-wrap
      mb-6
    ">

      <select
        value={filters.campaign}
        onChange={(e) =>
          setFilters({
            ...filters,
            campaign: e.target.value,
          })
        }
        className="
          bg-slate-900
          border border-slate-700
          rounded-xl
          px-4 py-3
          text-white
        "
      >

        {uniqueCampaigns.map((c) => (

          <option key={c}>
            {c}
          </option>

        ))}

      </select>

      <select
        value={filters.dateRange}
        onChange={(e) =>
          setFilters({
            ...filters,
            dateRange: e.target.value,
          })
        }
        className="
          bg-slate-900
          border border-slate-700
          rounded-xl
          px-4 py-3
          text-white
        "
      >

        <option value="7d">
          Last 7 Days
        </option>

        <option value="30d">
          Last 30 Days
        </option>

        <option value="90d">
          Last 90 Days
        </option>

      </select> 

    </div>
  );
}