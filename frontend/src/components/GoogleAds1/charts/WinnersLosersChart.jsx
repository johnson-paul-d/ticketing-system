export default function WinnersLosersChart({
  campaigns = [],
}) {

  const sorted = [...campaigns]
    .sort(
      (a,b) =>
        (b.growth || 0) -
        (a.growth || 0)
    );

  const winners =
    sorted.slice(0,5);

  const losers =
    sorted.slice(-5).reverse();

  return (

    <div className="
      bg-[#0c1425]
      border border-slate-800
      rounded-2xl
      p-5
    ">

      <h3 className="
        text-sm
        font-bold
        text-white
        mb-4
      ">
        Winners vs Losers
      </h3>

      <div className="
        grid grid-cols-2
        gap-6
      ">

        <div>

          <h4 className="
            text-emerald-400
            font-semibold
            mb-3
          ">
            Top Winners
          </h4>

          {winners.map((c) => (

            <div
              key={c.campaign}
              className="
                flex justify-between
                py-2
                border-b border-slate-800
              "
            >

              <span className="
                text-slate-300
              ">
                {c.campaign}
              </span>

              <span className="
                text-emerald-400
                font-semibold
              ">
                ▲ {c.growth}%
              </span>

            </div>

          ))}

        </div>

        <div>

          <h4 className="
            text-red-400
            font-semibold
            mb-3
          ">
            Top Losers
          </h4>

          {losers.map((c) => (

            <div
              key={c.campaign}
              className="
                flex justify-between
                py-2
                border-b border-slate-800
              "
            >

              <span className="
                text-slate-300
              ">
                {c.campaign}
              </span>

              <span className="
                text-red-400
                font-semibold
              ">
                ▼ {Math.abs(c.growth)}%
              </span>

            </div>

          ))}

        </div>

      </div>

    </div>
  );
}