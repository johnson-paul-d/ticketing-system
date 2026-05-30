// Health donut chart
function HealthDonut({ elite, strong, average, weak, noConv, total }) {
  const elitePct = total > 0 ? (elite / total) * 100 : 0;
  const strongPct = total > 0 ? (strong / total) * 100 : 0;
  const avgPct = total > 0 ? (average / total) * 100 : 0;
  const weakPct = total > 0 ? (weak / total) * 100 : 0;
  const noConvPct = total > 0 ? (noConv / total) * 100 : 0;

  const conicGradient = `conic-gradient(
    from 0deg,
    #10b981 0deg ${elitePct * 3.6}deg,
    #3b82f6 ${elitePct * 3.6}deg ${(elitePct + strongPct) * 3.6}deg,
    #fbbf24 ${(elitePct + strongPct) * 3.6}deg ${(elitePct + strongPct + avgPct) * 3.6}deg,
    #f97316 ${(elitePct + strongPct + avgPct) * 3.6}deg ${(elitePct + strongPct + avgPct + weakPct) * 3.6}deg,
    #ef4444 ${(elitePct + strongPct + avgPct + weakPct) * 3.6}deg 360deg
  )`;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-32 h-32 rounded-full" style={{ background: conicGradient }}>
        <div className="absolute inset-[25%] bg-[#0c1425] rounded-full flex items-center justify-center">
          <span className="text-xl font-black text-white">{total}</span>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[10px]">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"/> Elite</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"/> Strong</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400"/> Avg</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500"/> Weak</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"/> No Conv</span>
      </div>
    </div>
  );
}
export default HealthDonut;