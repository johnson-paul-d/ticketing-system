const DAYS = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
];

export default function TemporalHeatmap({
  trends,
}) {

  // =====================================================
  // BUILD HEATMAP DATA
  // =====================================================

  const heatmapData = (trends || []).map(
    (t) => {

      const date =
        new Date(t.report_date);

      const conversions =
        Number(t.conversions || 0);

      const ctr =
        Number(t.ctr || 0) * 100;

      const score =
        conversions * 10 + ctr;

      return {

        day:
          DAYS[date.getDay()],

        conversions,

        ctr:
          ctr.toFixed(2),

        score,

        date:
          date.toLocaleDateString(),

      };
    }
  );

  // =====================================================
  // COLOR SCALE
  // =====================================================

  const getColor = (score) => {

    if (score > 40) {
      return "bg-emerald-500/30 border-emerald-500/30";
    }

    if (score > 20) {
      return "bg-yellow-500/30 border-yellow-500/30";
    }

    return "bg-red-500/20 border-red-500/20";
  };

  return (

    <div className="
      bg-slate-900
      border border-slate-800
      rounded-3xl
      p-5
    ">

      {/* =====================================================
          HEADER
      ===================================================== */}

      <div className="
        flex items-start
        justify-between
        mb-6
      ">

        <div>

          <h2 className="
            text-xl
            font-bold
            text-white
          ">
            Temporal Performance Heatmap
          </h2>

          <p className="
            text-slate-400
            text-sm
            mt-1
          ">
            Day-wise conversion intensity analysis
          </p>

        </div>

      </div>

      {/* =====================================================
          HEATMAP GRID
      ===================================================== */}

      <div className="
        grid grid-cols-7
        gap-3
      ">

        {heatmapData.map(
          (cell, index) => (

            <div
              key={index}
              className={`
                rounded-2xl
                border
                p-4
                transition-all
                duration-300
                hover:scale-105
                ${getColor(cell.score)}
              `}
            >

              <div className="
                flex items-center
                justify-between
                mb-4
              ">

                <span className="
                  text-white
                  font-semibold
                ">
                  {cell.day}
                </span>

                <span className="
                  text-xs
                  text-slate-300
                ">
                  {cell.ctr}%
                </span>

              </div>

              <div className="
                text-3xl
                font-black
                text-white
              ">
                {cell.conversions}
              </div>

              <div className="
                text-xs
                text-slate-400
                mt-2
              ">
                conversions
              </div>

            </div>

          )
        )}

      </div>

      {/* =====================================================
          LEGEND
      ===================================================== */}

      <div className="
        flex items-center
        gap-5
        mt-6
      ">

        <div className="
          flex items-center
          gap-2
        ">

          <div className="
            w-4 h-4 rounded
            bg-red-500/30
          " />

          <span className="
            text-slate-400
            text-sm
          ">
            Low Performance
          </span>

        </div>

        <div className="
          flex items-center
          gap-2
        ">

          <div className="
            w-4 h-4 rounded
            bg-yellow-500/30
          " />

          <span className="
            text-slate-400
            text-sm
          ">
            Moderate
          </span>

        </div>

        <div className="
          flex items-center
          gap-2
        ">

          <div className="
            w-4 h-4 rounded
            bg-emerald-500/30
          " />

          <span className="
            text-slate-400
            text-sm
          ">
            High Performance
          </span>

        </div>

      </div>

    </div>
  );
}