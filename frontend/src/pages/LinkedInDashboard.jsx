import { useMemo, useState } from "react";
import MainLayout from "../layouts/MainLayout";
import useLinkedInData from "../hooks/useLinkedInData";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const LI_BLUE  = "#0077B5";

const OAUTH_SCOPES = [
  "r_organization_social", "rw_organization_admin",
  "r_ads_reporting", "r_ads",
].join("%20");

function buildAuthUrl(clientId, redirectUri) {
  return (
    `https://www.linkedin.com/oauth/v2/authorization` +
    `?response_type=code&client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${OAUTH_SCOPES}&state=${Math.random().toString(36).slice(2)}`
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n, opts = {}) {
  if (n == null || isNaN(n)) return "—";
  if (opts.currency) return `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  if (opts.pct) return `${Number(n).toFixed(2)}%`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return Number(n).toLocaleString();
}

function shortDate(str) {
  if (!str) return "";
  const d = new Date(str);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function mergeByDate(rows, keys) {
  const map = {};
  rows.forEach(r => {
    if (!map[r.date]) {
      map[r.date] = { date: r.date };
      keys.forEach(k => (map[r.date][k] = 0));
    }
    keys.forEach(k => (map[r.date][k] += r[k] || 0));
  });
  return Object.values(map).sort((a, b) => (a.date > b.date ? 1 : -1));
}

const TTStyle = {
  background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12,
  padding: "10px 14px", fontSize: 12, boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
};

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KPICard({ label, value, sub, icon }) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
        <span className="text-lg">{icon}</span>
      </div>
      <p className="text-3xl font-bold text-gray-900 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-8">
      <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-4">{title}</h2>
      {children}
    </div>
  );
}

function EmptyState({ label, sub }) {
  return (
    <div className="bg-gray-50 border border-dashed border-gray-200 rounded-2xl py-12 text-center">
      <p className="text-sm text-gray-400 font-medium">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

// ─── Page selector tabs ───────────────────────────────────────────────────────

function PageSelector({ allOrgs, selectedOrgId, onSelect, dataLoading }) {
  if (!allOrgs.length) return null;
  return (
    <div className="flex items-center gap-2 mb-6 flex-wrap">
      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider mr-1">Page</span>
      <button
        onClick={() => onSelect(null)}
        disabled={dataLoading}
        className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-all ${
          selectedOrgId === null
            ? "text-white border-transparent"
            : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
        }`}
        style={selectedOrgId === null ? { background: LI_BLUE } : {}}
      >
        All Pages
      </button>
      {allOrgs.map(org => (
        <button
          key={org.id}
          onClick={() => onSelect(org.id)}
          disabled={dataLoading}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-all ${
            selectedOrgId === org.id
              ? "text-white border-transparent"
              : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
          }`}
          style={selectedOrgId === org.id ? { background: LI_BLUE } : {}}
        >
          {org.name || `Page ${org.id}`}
        </button>
      ))}
      {dataLoading && (
        <svg className="animate-spin w-3.5 h-3.5 text-gray-400 ml-1" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
    </div>
  );
}

// ─── Connect screen ───────────────────────────────────────────────────────────

function ConnectScreen() {
  const clientId    = import.meta.env.VITE_LINKEDIN_CLIENT_ID;
  const redirectUri = import.meta.env.VITE_LINKEDIN_REDIRECT_URI || "http://localhost:3000/auth/linkedin/callback";
  const authUrl     = buildAuthUrl(clientId, redirectUri);

  return (
    <MainLayout>
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-12 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center" style={{ background: LI_BLUE }}>
            <svg viewBox="0 0 24 24" className="w-9 h-9 fill-white">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">LinkedIn Analytics</h1>
          <p className="text-gray-500 text-sm mb-8">
            Connect your LinkedIn company pages to pull follower growth, post performance, and page analytics.
          </p>
          <a
            href={authUrl}
            className="inline-flex items-center gap-2 text-white font-semibold px-8 py-3 rounded-2xl text-sm hover:opacity-90"
            style={{ background: LI_BLUE }}
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
            Connect LinkedIn Pages
          </a>
          <p className="text-xs text-gray-400 mt-5">
            Requires page admin access · scopes: r_organization_social, r_ads_reporting
          </p>
        </div>
      </div>
    </MainLayout>
  );
}

// ─── Follower Growth Chart ────────────────────────────────────────────────────

function FollowerGrowthChart({ data }) {
  const chartData = useMemo(() =>
    mergeByDate(data, ["total_followers", "organic_followers", "paid_followers"])
      .map(d => ({
        date:     shortDate(d.date),
        Total:    d.total_followers,
        Organic:  d.organic_followers,
        Paid:     d.paid_followers,
      })),
    [data]
  );

  if (!chartData.length) return <EmptyState label="No follower data synced yet. Click Sync Data to pull from LinkedIn." />;

  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Follower Growth</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#F3F4F6" strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} tickFormatter={v => fmt(v)} />
            <Tooltip contentStyle={TTStyle} formatter={(v) => [fmt(v)]} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            <Line type="monotone" dataKey="Total"   stroke={LI_BLUE}  strokeWidth={2.5} dot={false} />
            <Line type="monotone" dataKey="Organic" stroke="#10B981"  strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
            <Line type="monotone" dataKey="Paid"    stroke="#F59E0B"  strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Page Analytics Chart ─────────────────────────────────────────────────────

function PageAnalyticsChart({ data }) {
  const chartData = useMemo(() =>
    mergeByDate(data, ["page_views", "unique_visitors"])
      .map(d => ({
        date:              shortDate(d.date),
        "Page Views":      d.page_views,
        "Unique Visitors": d.unique_visitors,
      })),
    [data]
  );

  if (!chartData.length) return <EmptyState label="No page analytics synced yet." />;

  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Page Views & Unique Visitors</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#F3F4F6" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} tickFormatter={v => fmt(v)} />
            <Tooltip contentStyle={TTStyle} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            <Bar dataKey="Page Views"      fill={LI_BLUE}  radius={[4,4,0,0]} maxBarSize={24} />
            <Bar dataKey="Unique Visitors" fill="#60A5FA"  radius={[4,4,0,0]} maxBarSize={24} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Post Performance Table ───────────────────────────────────────────────────

function PostPerformanceTable({ posts, showPage }) {
  const [sort, setSort] = useState("impressions");
  const sorted = useMemo(() =>
    [...posts].sort((a, b) => (b[sort] || 0) - (a[sort] || 0)),
    [posts, sort]
  );

  if (!posts.length) return <EmptyState label="No posts synced yet." />;

  const cols = [
    { key: "impressions",     label: "Impressions" },
    { key: "clicks",          label: "Clicks" },
    { key: "reactions",       label: "Reactions" },
    { key: "comments",        label: "Comments" },
    { key: "shares",          label: "Shares" },
    { key: "engagement_rate", label: "Eng. Rate" },
  ];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-sm font-semibold text-gray-700">Post Performance</h3>
        <div className="flex gap-2 flex-wrap">
          {cols.map(c => (
            <button
              key={c.key}
              onClick={() => setSort(c.key)}
              className={`text-xs px-3 py-1 rounded-full font-medium border transition-all ${
                sort === c.key
                  ? "text-white border-transparent"
                  : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
              }`}
              style={sort === c.key ? { background: LI_BLUE } : {}}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide w-16">Date</th>
              {showPage && <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Page</th>}
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Post</th>
              {cols.map(c => (
                <th key={c.key} className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sorted.slice(0, 30).map((p, i) => (
              <tr key={p.post_id || i} className="hover:bg-gray-50">
                <td className="px-5 py-3 text-xs text-gray-400 whitespace-nowrap">{shortDate(p.post_date)}</td>
                {showPage && (
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{p.org_name || "—"}</td>
                )}
                <td className="px-5 py-3 text-gray-700 max-w-xs">
                  <p className="truncate text-xs">{p.text_preview || "—"}</p>
                </td>
                <td className="px-4 py-3 text-right text-gray-800 font-medium tabular-nums">{fmt(p.impressions)}</td>
                <td className="px-4 py-3 text-right text-gray-800 font-medium tabular-nums">{fmt(p.clicks)}</td>
                <td className="px-4 py-3 text-right text-gray-800 font-medium tabular-nums">{fmt(p.reactions)}</td>
                <td className="px-4 py-3 text-right text-gray-800 font-medium tabular-nums">{fmt(p.comments)}</td>
                <td className="px-4 py-3 text-right text-gray-800 font-medium tabular-nums">{fmt(p.shares)}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    p.engagement_rate >= 3 ? "bg-green-100 text-green-700"
                    : p.engagement_rate >= 1 ? "bg-yellow-100 text-yellow-700"
                    : "bg-gray-100 text-gray-500"
                  }`}>
                    {fmt(p.engagement_rate, { pct: true })}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Ad Analytics ─────────────────────────────────────────────────────────────

function AdAnalyticsSection({ data }) {
  const chartData = useMemo(() => {
    const byDate = {};
    data.forEach(d => {
      if (!byDate[d.date]) byDate[d.date] = { date: shortDate(d.date), Spend: 0, Clicks: 0 };
      byDate[d.date].Spend  += Number(d.spend || 0);
      byDate[d.date].Clicks += Number(d.clicks || 0);
    });
    return Object.values(byDate).sort((a, b) => a.date > b.date ? 1 : -1);
  }, [data]);

  const totals = useMemo(() => data.reduce((acc, d) => ({
    spend:       acc.spend       + Number(d.spend || 0),
    impressions: acc.impressions + Number(d.impressions || 0),
    clicks:      acc.clicks      + Number(d.clicks || 0),
    conversions: acc.conversions + Number(d.conversions || 0),
  }), { spend: 0, impressions: 0, clicks: 0, conversions: 0 }), [data]);

  const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;

  if (!data.length) return (
    <EmptyState
      label="No ad data synced"
      sub="Requires r_ads_reporting scope and LinkedIn Marketing API access."
    />
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPICard label="Ad Spend"    value={fmt(totals.spend, { currency: true })} icon="💰" />
        <KPICard label="Impressions" value={fmt(totals.impressions)}               icon="👁" />
        <KPICard label="Clicks"      value={fmt(totals.clicks)}                    icon="🖱" />
        <KPICard label="Conversions" value={fmt(totals.conversions)}               icon="✅" />
        <KPICard label="CTR"         value={fmt(ctr, { pct: true })}              icon="📊" />
      </div>
      <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Daily Ad Spend & Clicks</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#F3F4F6" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} />
              <YAxis yAxisId="spend"  tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} tickFormatter={v => `₹${fmt(v)}`} />
              <YAxis yAxisId="clicks" orientation="right" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={TTStyle} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <Bar yAxisId="spend"  dataKey="Spend"  fill={LI_BLUE} radius={[4,4,0,0]} maxBarSize={20} />
              <Bar yAxisId="clicks" dataKey="Clicks" fill="#F59E0B" radius={[4,4,0,0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ─── Sync result banner ───────────────────────────────────────────────────────

function SyncBanner({ result }) {
  if (!result) return null;
  if (result.error) {
    return (
      <span className="text-xs px-3 py-1 rounded-full font-medium bg-red-50 text-red-600">
        Sync error: {result.error}
      </span>
    );
  }
  if (result.summary) {
    const lines = Object.entries(result.summary).map(([name, r]) => {
      const parts = [];
      if (r.follower) parts.push(`${r.follower} follower days`);
      if (r.page)     parts.push(`${r.page} page days`);
      if (r.posts)    parts.push(`${r.posts} posts`);
      const errs = r.errors?.length ? ` (${r.errors.length} errors)` : "";
      return `${name}: ${parts.join(", ") || "no data"}${errs}`;
    });
    return (
      <span className="text-xs px-3 py-1.5 rounded-full font-medium bg-green-50 text-green-700">
        ✓ {lines.join(" · ")}
      </span>
    );
  }
  return null;
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

const TABS = ["Overview", "Posts", "Ads"];

export default function LinkedInDashboard() {
  const {
    status, allOrgs, selectedOrgId, selectOrg,
    followerStats, pageAnalytics, posts, adAnalytics,
    loading, dataLoading, syncing, syncResult, sync, disconnect,
  } = useLinkedInData();

  const [tab, setTab] = useState("Overview");

  // All hooks must run before any early return
  const latestFollowers = useMemo(() => {
    const byDate = mergeByDate(followerStats, ["total_followers"]);
    return byDate.at(-1)?.total_followers || 0;
  }, [followerStats]);

  const firstFollowers = useMemo(() => {
    const byDate = mergeByDate(followerStats, ["total_followers"]);
    return byDate[0]?.total_followers || 0;
  }, [followerStats]);

  const totalImpressions = useMemo(() => posts.reduce((s, p) => s + (p.impressions || 0), 0), [posts]);
  const totalEngagements = useMemo(() => posts.reduce((s, p) =>
    s + (p.reactions || 0) + (p.clicks || 0) + (p.comments || 0) + (p.shares || 0), 0), [posts]);
  const avgEngRate     = totalImpressions > 0 ? (totalEngagements / totalImpressions) * 100 : 0;
  const totalPageViews = useMemo(() => pageAnalytics.reduce((s, p) => s + (p.page_views || 0), 0), [pageAnalytics]);

  if (loading) {
    return (
      <MainLayout>
        <div className="p-8 text-gray-400 text-sm animate-pulse">Loading LinkedIn data…</div>
      </MainLayout>
    );
  }

  if (!status?.connected) return <ConnectScreen />;

  const headerLabel = selectedOrgId
    ? (allOrgs.find(o => o.id === selectedOrgId)?.name || selectedOrgId)
    : allOrgs.length > 1 ? "All Pages Combined" : (status.orgName || "LinkedIn Analytics");

  return (
    <MainLayout>
      <div className="p-4 lg:p-8 max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: LI_BLUE }}>
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{headerLabel}</h1>
              <p className="text-xs text-gray-400 mt-0.5">
                Last 90 days · {followerStats.length} rows · {allOrgs.length} page{allOrgs.length !== 1 ? "s" : ""} connected
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <SyncBanner result={syncResult} />
            <button
              onClick={sync}
              disabled={syncing}
              className="inline-flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl text-white hover:opacity-90 disabled:opacity-50"
              style={{ background: LI_BLUE }}
            >
              {syncing ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Syncing all pages…
                </>
              ) : "↻ Sync Data"}
            </button>
            <button
              onClick={disconnect}
              className="text-xs text-gray-400 hover:text-red-500 px-3 py-2 rounded-xl hover:bg-red-50 transition-colors"
            >
              Disconnect
            </button>
          </div>
        </div>

        {/* Page filter */}
        <PageSelector
          allOrgs={allOrgs}
          selectedOrgId={selectedOrgId}
          onSelect={selectOrg}
          dataLoading={dataLoading}
        />

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-2xl w-fit">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
                tab === t ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* ── Overview ─────────────────────────────────────────────────────── */}
        {tab === "Overview" && (
          <>
            <Section title="Key Metrics">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KPICard
                  label="Total Followers"
                  value={fmt(latestFollowers)}
                  sub={latestFollowers > firstFollowers
                    ? `+${fmt(latestFollowers - firstFollowers)} in period`
                    : `${fmt(latestFollowers - firstFollowers)} in period`}
                  icon="👥"
                />
                <KPICard
                  label="Post Impressions"
                  value={fmt(totalImpressions)}
                  sub={`${posts.length} posts`}
                  icon="👁"
                />
                <KPICard
                  label="Avg Engagement"
                  value={fmt(avgEngRate, { pct: true })}
                  sub="Reactions + clicks + comments + shares"
                  icon="📈"
                />
                <KPICard
                  label="Page Views"
                  value={fmt(totalPageViews)}
                  sub="Last 90 days"
                  icon="🏠"
                />
              </div>
            </Section>

            <Section title="Follower Growth">
              <FollowerGrowthChart data={followerStats} />
            </Section>

            <Section title="Page Analytics">
              <PageAnalyticsChart data={pageAnalytics} />
            </Section>
          </>
        )}

        {/* ── Posts ────────────────────────────────────────────────────────── */}
        {tab === "Posts" && (
          <Section title="Post Performance">
            <PostPerformanceTable posts={posts} showPage={!selectedOrgId && allOrgs.length > 1} />
          </Section>
        )}

        {/* ── Ads ──────────────────────────────────────────────────────────── */}
        {tab === "Ads" && (
          <Section title="Ad Analytics">
            <AdAnalyticsSection data={adAnalytics} />
          </Section>
        )}

      </div>
    </MainLayout>
  );
}
