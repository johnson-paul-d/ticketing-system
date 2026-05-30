// Loading skeletons (Phase 6)
const SkeletonCard = () => (
  <div className="bg-[#0c1425] border border-slate-800 rounded-2xl p-5 animate-pulse">
    <div className="h-4 bg-slate-800 rounded w-1/3 mb-3" />
    <div className="h-8 bg-slate-800 rounded w-2/3 mb-2" />
    <div className="h-3 bg-slate-800 rounded w-full" />
  </div>
);

export default SkeletonCard;