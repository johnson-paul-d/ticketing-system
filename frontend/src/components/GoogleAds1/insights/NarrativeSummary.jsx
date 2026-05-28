export default function NarrativeSummary({
  overview,
  campaigns,
  wasteSpend,
  performanceScore,
}) {

  const topCampaign =
    campaigns.sort( 
      (a, b) =>
        Number(b.conversions || 0) -
        Number(a.conversions || 0)
    )[0];

  return (

    <div className="
      bg-gradient-to-br
      from-slate-900
      to-slate-950
      border border-slate-800
      rounded-3xl
      p-6
    ">

      <div className="
        flex items-center
        gap-3
        mb-5
      ">

        <div className="
          w-10 h-10
          rounded-2xl
          bg-indigo-500/20
          flex items-center
          justify-center
          text-indigo-400
          font-bold
        ">
          AI
        </div>

        <div>

          <h2 className="
            text-2xl
            font-bold
            text-white
          ">
            Executive Narrative Summary
          </h2>

          <p className="
            text-slate-400
            text-sm
          ">
            AI-generated business intelligence
          </p>

        </div>

      </div>

      <div className="
        space-y-5
        text-slate-300
        leading-8
      ">

        <p>

          Google Ads campaigns generated
          <span className="
            text-white font-bold
          ">
            {" "}
            {overview?.totalConversions}
          </span>
          {" "}conversions while maintaining
          an account-wide CTR of
          <span className="
            text-emerald-400 font-bold
          ">
            {" "}
            {(
              Number(
                overview?.averageCTR || 0
              ) * 100
            ).toFixed(2)}%
          </span>.

        </p>

        <p>

          The current executive
          performance score stands at
          <span className="
            text-cyan-400 font-bold
          ">
            {" "}
            {performanceScore}/100
          </span>,
          indicating overall campaign
          health and efficiency.

        </p>

        <p>

          <span className="
            text-white font-bold
          ">
            {topCampaign?.campaign}
          </span>
          {" "}is currently the strongest
          performing campaign based on
          conversion contribution and
          engagement quality.

        </p>

        <p>

          Waste spend currently stands at
          <span className="
            text-red-400 font-bold
          ">
            {" "}
            ₹{wasteSpend.toLocaleString()}
          </span>,
          suggesting opportunities for
          budget optimization and keyword
          refinement.

        </p>

      </div>

    </div>
  );
}