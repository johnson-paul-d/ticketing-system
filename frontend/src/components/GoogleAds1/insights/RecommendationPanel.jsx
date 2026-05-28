export default function RecommendationPanel({
  recommendations,
}) {

  return (

    <div className="
      bg-slate-900
      border border-slate-800
      rounded-3xl
      p-6
    ">

      <h2 className="
        text-2xl font-bold
        text-white mb-6
      ">
        Executive Recommendations
      </h2>

      <div className="
        space-y-4
      ">

        {(recommendations || []).map(
          (r, index) => (

            <div
              key={index}
              className="
                border border-slate-800
                rounded-2xl
                p-5
                bg-slate-950
              "
            >

              <div className="
                flex items-center
                justify-between
                mb-2
              ">

                <h3 className="
                  text-white
                  font-semibold
                ">
                  {r.type}
                </h3>

                <span className="
                  bg-red-500/20
                  text-red-400
                  px-3 py-1
                  rounded-full
                  text-xs
                ">
                  {r.priority}
                </span>

              </div>

              <p className="
                text-slate-400
                text-sm
              ">
                {r.message}
              </p>

              <div className="
                mt-3
                text-emerald-400
                text-sm
                font-medium
              ">
                {r.campaign}
              </div>

            </div>

          )
        )}

      </div>

    </div>
  );
}