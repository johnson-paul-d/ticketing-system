import { useMemo, useState } from "react";
import MainLayout from "../layouts/MainLayout";
import useLinkedInData from "../hooks/useLinkedInData";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  ScatterChart, Scatter, ZAxis, Cell, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis,
} from "recharts";

const LI_BLUE   = "#0077B5";
const LI_DARK   = "#004471";
const GREEN      = "#10B981";
const AMBER      = "#F59E0B";
const RED        = "#EF4444";
const SLATE      = "#64748B";

const OAUTH_SCOPES = [
  "r_organization_social",
  "r_organization_admin",   // follower, visitor and content analytics
  "rw_organization_admin",
  "w_organization_social",
  "r_ads_reporting",
  "r_ads",
].join("%20");

function buildAuthUrl(clientId, redirectUri) {
  return (
    `https://www.linkedin.com/oauth/v2/authorization?response_type=code` +
    `&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${OAUTH_SCOPES}&state=${Math.random().toString(36).slice(2)}`
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n, opts = {}) {
  if (n == null || isNaN(n)) return "—";
  if (opts.pct)      return `${Number(n).toFixed(2)}%`;
  if (opts.currency) return `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return Number(n).toLocaleString();
}

function pctChange(current, previous) {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

function shortDate(str) {
  if (!str) return "";
  return new Date(str).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function cutoffDate(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

function mergeByDate(rows, keys) {
  const map = {};
  rows.forEach(r => {
    if (!map[r.date]) { map[r.date] = { date: r.date }; keys.forEach(k => (map[r.date][k] = 0)); }
    keys.forEach(k => (map[r.date][k] += Number(r[k]) || 0));
  });
  return Object.values(map).sort((a, b) => (a.date > b.date ? 1 : -1));
}

const TTStyle = {
  background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10,
  padding: "8px 12px", fontSize: 12, boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
};

// ─── Trend badge ──────────────────────────────────────────────────────────────

function Trend({ pct, inverse = false }) {
  if (pct == null) return null;
  const positive = inverse ? pct < 0 : pct > 0;
  const color = pct === 0 ? "text-gray-400" : positive ? "text-green-600" : "text-red-500";
  const arrow = pct > 0 ? "↑" : pct < 0 ? "↓" : "→";
  return (
    <span className={`text-xs font-semibold ${color} ml-1`}>
      {arrow} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KPICard({ label, value, sub, icon, trend }) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider leading-4">{label}</p>
        <span className="text-xl">{icon}</span>
      </div>
      <p className="text-3xl font-bold text-gray-900 tabular-nums mt-1">{value}</p>
      <div className="flex items-center mt-1 flex-wrap gap-1">
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
        {trend != null && <Trend pct={trend} />}
      </div>
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, action, children }) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ label, sub }) {
  return (
    <div className="bg-gray-50 border border-dashed border-gray-200 rounded-2xl py-10 text-center">
      <p className="text-sm text-gray-400 font-medium">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

// ─── Page selector ────────────────────────────────────────────────────────────

function PageSelector({ allOrgs, selectedOrgId, onSelect, dataLoading }) {
  if (!allOrgs.length) return null;
  const opts = [{ id: null, name: "All Pages" }, ...allOrgs];
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Page</span>
      {opts.map(o => (
        <button
          key={o.id ?? "all"}
          onClick={() => onSelect(o.id)}
          disabled={dataLoading}
          className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
            selectedOrgId === o.id
              ? "text-white border-transparent"
              : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
          }`}
          style={selectedOrgId === o.id ? { background: LI_BLUE } : {}}
        >
          {o.name}
        </button>
      ))}
      {dataLoading && (
        <svg className="animate-spin w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
    </div>
  );
}

// ─── Date range filter ────────────────────────────────────────────────────────

const DATE_RANGES = [
  { label: "7D",  days: 7 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
];

function DateRangePicker({ value, onChange }) {
  return (
    <div className="flex gap-1 bg-gray-100 p-0.5 rounded-xl">
      {DATE_RANGES.map(r => (
        <button
          key={r.days}
          onClick={() => onChange(r.days)}
          className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
            value === r.days ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

// ─── Content impressions timeline ────────────────────────────────────────────
// Groups posts by publish date, shows impressions + engagements over time

function ContentImpressionsChart({ posts, allOrgs, showPage }) {
  const chartData = useMemo(() => {
    if (!showPage || allOrgs.length < 2) {
      // Single series: total impressions by date
      const byDate = {};
      posts.forEach(p => {
        if (!p.post_date) return;
        if (!byDate[p.post_date]) byDate[p.post_date] = { date: p.post_date, Impressions: 0, Engagements: 0, Posts: 0 };
        byDate[p.post_date].Impressions += p.impressions || 0;
        byDate[p.post_date].Engagements += (p.reactions || 0) + (p.clicks || 0) + (p.comments || 0) + (p.shares || 0);
        byDate[p.post_date].Posts++;
      });
      return Object.values(byDate).sort((a, b) => a.date > b.date ? 1 : -1)
        .map(d => ({ ...d, date: shortDate(d.date) }));
    } else {
      // Multi-series: one line per page
      const byDate = {};
      posts.forEach(p => {
        if (!p.post_date) return;
        if (!byDate[p.post_date]) byDate[p.post_date] = { date: p.post_date };
        const key = p.org_name || p.org_id;
        byDate[p.post_date][key] = (byDate[p.post_date][key] || 0) + (p.impressions || 0);
      });
      return Object.values(byDate).sort((a, b) => a.date > b.date ? 1 : -1)
        .map(d => ({ ...d, date: shortDate(d.date) }));
    }
  }, [posts, showPage, allOrgs]);

  if (!chartData.length) return <EmptyState label="No post data to chart yet" />;

  const colors = [LI_BLUE, GREEN, AMBER, RED];

  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700 mb-1">Content Impressions by Date</h3>
      <p className="text-xs text-gray-400 mb-4">Total reach of posts published on each date</p>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          {showPage && allOrgs.length > 1 ? (
            <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#F3F4F6" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} tickFormatter={v => fmt(v)} />
              <Tooltip contentStyle={TTStyle} formatter={v => [fmt(v)]} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              {allOrgs.map((o, i) => (
                <Bar key={o.id} dataKey={o.name || o.id} fill={colors[i]} radius={[4,4,0,0]} maxBarSize={28} stackId="a" />
              ))}
            </BarChart>
          ) : (
            <AreaChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="impGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={LI_BLUE} stopOpacity={0.18} />
                  <stop offset="95%" stopColor={LI_BLUE} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="engGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={GREEN} stopOpacity={0.18} />
                  <stop offset="95%" stopColor={GREEN} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#F3F4F6" strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} tickFormatter={v => fmt(v)} />
              <Tooltip contentStyle={TTStyle} formatter={v => [fmt(v)]} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <Area type="monotone" dataKey="Impressions" stroke={LI_BLUE} fill="url(#impGrad)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="Engagements" stroke={GREEN}   fill="url(#engGrad)" strokeWidth={2} dot={false} />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Engagement breakdown per page ───────────────────────────────────────────

function EngagementBreakdownChart({ posts, allOrgs }) {
  const chartData = useMemo(() => {
    if (!allOrgs.length) return [];
    return allOrgs.map(org => {
      const orgPosts = posts.filter(p => p.org_id === org.id);
      return {
        page:      (org.name || org.id).split(" ").slice(-1)[0], // short name
        fullName:  org.name || org.id,
        Reactions: orgPosts.reduce((s, p) => s + (p.reactions || 0), 0),
        Clicks:    orgPosts.reduce((s, p) => s + (p.clicks    || 0), 0),
        Comments:  orgPosts.reduce((s, p) => s + (p.comments  || 0), 0),
        Shares:    orgPosts.reduce((s, p) => s + (p.shares    || 0), 0),
        posts:     orgPosts.length,
      };
    });
  }, [posts, allOrgs]);

  if (!chartData.length || chartData.every(d => !d.Reactions && !d.Clicks && !d.Comments && !d.Shares)) {
    return <EmptyState label="Engagement data not yet available" sub="Sync to pull post metrics" />;
  }

  const ENG_COLORS = { Reactions: "#EC4899", Clicks: LI_BLUE, Comments: AMBER, Shares: GREEN };

  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700 mb-1">Engagement Breakdown by Page</h3>
      <p className="text-xs text-gray-400 mb-4">Total reactions, clicks, comments and shares per page</p>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid stroke="#F3F4F6" strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} tickFormatter={v => fmt(v)} />
            <YAxis type="category" dataKey="page" tick={{ fontSize: 11, fill: "#374151", fontWeight: 600 }} tickLine={false} width={70} />
            <Tooltip contentStyle={TTStyle}
              formatter={(v, name) => [fmt(v), name]}
              labelFormatter={l => chartData.find(d => d.page === l)?.fullName || l} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            {Object.entries(ENG_COLORS).map(([k, c]) => (
              <Bar key={k} dataKey={k} fill={c} stackId="eng" radius={k === "Shares" ? [0,4,4,0] : [0,0,0,0]} maxBarSize={36} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Page performance comparison radar ───────────────────────────────────────

function PageRadarChart({ allOrgs, followerStats, posts }) {
  const chartData = useMemo(() => {
    if (allOrgs.length < 2) return [];
    const maxF = Math.max(...allOrgs.map(o => {
      const latest = followerStats.filter(r => r.org_id === o.id).at(-1);
      return latest?.total_followers || 0;
    }), 1);
    const maxI = Math.max(...allOrgs.map(o =>
      posts.filter(p => p.org_id === o.id).reduce((s, p) => s + (p.impressions || 0), 0)
    ), 1);
    const maxE = Math.max(...allOrgs.map(o => {
      const op = posts.filter(p => p.org_id === o.id);
      const imp = op.reduce((s, p) => s + (p.impressions || 0), 0);
      const eng = op.reduce((s, p) => s + (p.reactions || 0) + (p.clicks || 0) + (p.comments || 0) + (p.shares || 0), 0);
      return imp > 0 ? (eng / imp) * 100 : 0;
    }), 1);
    const maxP = Math.max(...allOrgs.map(o => posts.filter(p => p.org_id === o.id).length), 1);

    const metrics = ["Followers", "Impressions", "Eng. Rate", "Post Count"];
    return metrics.map((m, mi) => {
      const row = { metric: m };
      allOrgs.forEach(org => {
        const orgPosts = posts.filter(p => p.org_id === org.id);
        const latest   = followerStats.filter(r => r.org_id === org.id).at(-1);
        const imp = orgPosts.reduce((s, p) => s + (p.impressions || 0), 0);
        const eng = orgPosts.reduce((s, p) => s + (p.reactions || 0) + (p.clicks || 0) + (p.comments || 0) + (p.shares || 0), 0);
        const vals = [
          ((latest?.total_followers || 0) / maxF) * 100,
          (imp / maxI) * 100,
          (imp > 0 ? (eng / imp) * 100 : 0) / maxE * 100,
          (orgPosts.length / maxP) * 100,
        ];
        row[org.name || org.id] = Math.round(vals[mi]);
      });
      return row;
    });
  }, [allOrgs, followerStats, posts]);

  if (!chartData.length) return null;

  const colors = [LI_BLUE, GREEN];

  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700 mb-1">Page Strength Comparison</h3>
      <p className="text-xs text-gray-400 mb-4">Relative performance across key dimensions (scaled 0–100)</p>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={chartData}>
            <PolarGrid stroke="#F3F4F6" />
            <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: "#6B7280" }} />
            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
            <Tooltip contentStyle={TTStyle} formatter={(v, n) => [`${v}/100`, n]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {allOrgs.map((org, i) => (
              <Radar key={org.id} name={org.name || org.id} dataKey={org.name || org.id}
                stroke={colors[i]} fill={colors[i]} fillOpacity={0.15} strokeWidth={2} />
            ))}
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Impression vs Engagement scatter ────────────────────────────────────────

function PostScatterChart({ posts, allOrgs, showPage }) {
  const data = useMemo(() =>
    posts
      .filter(p => p.impressions > 0)
      .map(p => ({
        x:    p.impressions,
        y:    parseFloat(p.engagement_rate) || 0,
        name: (p.text_preview || "").slice(0, 60),
        page: p.org_name,
        color: !showPage ? LI_BLUE
          : (allOrgs.findIndex(o => o.id === p.org_id) === 0 ? LI_BLUE : GREEN),
      })),
    [posts, showPage, allOrgs]
  );

  if (!data.length) return <EmptyState label="Post impression data not yet available" />;

  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700 mb-1">Impressions vs Engagement Rate</h3>
      <p className="text-xs text-gray-400 mb-4">
        Top-right = high reach AND high engagement · Top-left = efficient but small reach
      </p>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#F3F4F6" strokeDasharray="3 3" />
            <XAxis dataKey="x" type="number" name="Impressions" tick={{ fontSize: 10, fill: "#9CA3AF" }}
              tickLine={false} tickFormatter={v => fmt(v)} label={{ value: "Impressions", position: "insideBottom", offset: -2, fontSize: 10, fill: "#9CA3AF" }} />
            <YAxis dataKey="y" type="number" name="Eng. Rate %" tick={{ fontSize: 10, fill: "#9CA3AF" }}
              tickLine={false} axisLine={false} tickFormatter={v => `${v.toFixed(1)}%`} />
            <ZAxis range={[40, 40]} />
            <Tooltip contentStyle={TTStyle} cursor={{ strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null;
                const d = payload[0].payload;
                return (
                  <div style={TTStyle}>
                    {d.page && <p className="text-xs text-gray-400 mb-1">{d.page}</p>}
                    <p className="text-xs font-semibold text-gray-800 mb-1 max-w-xs">{d.name}…</p>
                    <p className="text-xs text-gray-600">👁 {fmt(d.x)} impressions</p>
                    <p className="text-xs text-gray-600">📈 {d.y.toFixed(2)}% engagement</p>
                  </div>
                );
              }} />
            <Scatter data={data}>
              {data.map((entry, i) => <Cell key={i} fill={entry.color} fillOpacity={0.75} />)}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      {showPage && (
        <div className="flex items-center gap-4 mt-3 justify-center">
          {allOrgs.map((o, i) => (
            <span key={o.id} className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: i === 0 ? LI_BLUE : GREEN }} />
              {o.name}
            </span>
          ))}
        </div>
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
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">LinkedIn Analytics</h1>
          <p className="text-gray-500 text-sm mb-8">Connect your LinkedIn company pages to track follower growth, content performance, and page analytics.</p>
          <a href={authUrl} className="inline-flex items-center gap-2 text-white font-semibold px-8 py-3 rounded-2xl text-sm hover:opacity-90" style={{ background: LI_BLUE }}>
            Connect LinkedIn Pages
          </a>
          <p className="text-xs text-gray-400 mt-4">Requires page admin access · scopes: r_organization_social, r_ads_reporting</p>
        </div>
      </div>
    </MainLayout>
  );
}

// ─── Follower chart ───────────────────────────────────────────────────────────

function FollowerChart({ data, allOrgs, selectedOrgId }) {
  const showMulti = !selectedOrgId && allOrgs.length > 1;

  const chartData = useMemo(() => {
    if (!showMulti) {
      return mergeByDate(data, ["total_followers", "organic_followers", "paid_followers"])
        .map(d => ({ date: shortDate(d.date), Total: d.total_followers, Organic: d.organic_followers, Paid: d.paid_followers }));
    }
    // Multi-org: one series per org by date
    const map = {};
    data.forEach(r => {
      if (!map[r.date]) map[r.date] = { date: r.date };
      map[r.date][r.org_name || r.org_id] = (map[r.date][r.org_name || r.org_id] || 0) + (r.total_followers || 0);
    });
    return Object.values(map).sort((a, b) => a.date > b.date ? 1 : -1)
      .map(d => ({ ...d, date: shortDate(d.date) }));
  }, [data, showMulti]);

  if (!chartData.length) return <EmptyState label="No follower data yet — sync to pull from LinkedIn" />;

  const orgKeys = showMulti ? allOrgs.map(o => o.name || o.id) : ["Total", "Organic", "Paid"];
  const colors  = showMulti ? [LI_BLUE, GREEN, AMBER, RED] : [LI_BLUE, GREEN, AMBER];

  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Follower Growth</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <defs>
              {orgKeys.map((k, i) => (
                <linearGradient key={k} id={`grad${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={colors[i]} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={colors[i]} stopOpacity={0.01} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid stroke="#F3F4F6" strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} tickFormatter={v => fmt(v)} />
            <Tooltip contentStyle={TTStyle} formatter={(v, n) => [fmt(v), n]} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            {orgKeys.map((k, i) => (
              <Area key={k} type="monotone" dataKey={k} stroke={colors[i]} strokeWidth={2}
                fill={`url(#grad${i})`} dot={false} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Page views chart ─────────────────────────────────────────────────────────

function PageViewsChart({ data }) {
  const chartData = useMemo(() =>
    mergeByDate(data, ["page_views", "unique_visitors"])
      .map(d => ({ date: shortDate(d.date), "Page Views": d.page_views, "Unique Visitors": d.unique_visitors })),
    [data]
  );
  if (!chartData.length) return <EmptyState label="No page analytics yet" />;
  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Page Views</h3>
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

// ─── Page comparison cards (director view) ────────────────────────────────────

function PageCompare({ allOrgs, followerStats, pageAnalytics, posts }) {
  if (allOrgs.length < 2) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {allOrgs.map((org, idx) => {
        const fStats = followerStats.filter(r => r.org_id === org.id);
        const pStats = pageAnalytics.filter(r => r.org_id === org.id);
        const pPosts = posts.filter(r => r.org_id === org.id);

        const latestF = fStats.at(-1)?.total_followers || 0;
        const firstF  = fStats[0]?.total_followers || 0;
        const fGrowth = latestF - firstF;

        const totalViews = pStats.reduce((s, r) => s + (r.page_views || 0), 0);
        const totalImp   = pPosts.reduce((s, p) => s + (p.impressions || 0), 0);
        const totalEng   = pPosts.reduce((s, p) => s + (p.reactions || 0) + (p.clicks || 0) + (p.comments || 0) + (p.shares || 0), 0);
        const engRate    = totalImp > 0 ? (totalEng / totalImp) * 100 : 0;

        const dotColor = [LI_BLUE, GREEN][idx] || SLATE;

        return (
          <div key={org.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                style={{ background: dotColor }}>
                {(org.name || "L")[0].toUpperCase()}
              </div>
              <h3 className="font-semibold text-gray-900 text-sm leading-tight">{org.name || org.id}</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Followers",    value: fmt(latestF),              sub: fGrowth >= 0 ? `+${fmt(fGrowth)} growth` : fmt(fGrowth) },
                { label: "Page Views",   value: fmt(totalViews),           sub: `${pStats.length} days` },
                { label: "Impressions",  value: fmt(totalImp),             sub: `${pPosts.length} posts` },
                { label: "Eng. Rate",    value: fmt(engRate, { pct: true }), sub: "avg per post" },
              ].map(m => (
                <div key={m.label} className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400 font-medium mb-1">{m.label}</p>
                  <p className="text-xl font-bold text-gray-900 tabular-nums">{m.value}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{m.sub}</p>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Top posts ────────────────────────────────────────────────────────────────

function TopPosts({ posts, showPage, limit = 5 }) {
  const top = useMemo(() =>
    [...posts].sort((a, b) => (b.impressions || 0) - (a.impressions || 0)).slice(0, limit),
    [posts, limit]
  );
  if (!top.length) return <EmptyState label="No posts synced yet" />;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="divide-y divide-gray-50">
        {top.map((p, i) => {
          const engRate = p.engagement_rate || 0;
          return (
            <div key={p.post_id || i} className="px-5 py-4 flex items-start gap-4 hover:bg-gray-50 transition-colors">
              <span className="text-xs font-bold text-gray-300 w-5 flex-shrink-0 mt-0.5">#{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 leading-snug line-clamp-2">{p.text_preview || "—"}</p>
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <span className="text-xs text-gray-400">{shortDate(p.post_date)}</span>
                  {showPage && <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{p.org_name}</span>}
                  <span className="text-xs text-gray-400">👁 {fmt(p.impressions)}</span>
                  <span className="text-xs text-gray-400">❤️ {fmt(p.reactions)}</span>
                  <span className="text-xs text-gray-400">💬 {fmt(p.comments)}</span>
                  <span className="text-xs text-gray-400">↗️ {fmt(p.shares)}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    engRate >= 3 ? "bg-green-100 text-green-700"
                    : engRate >= 1 ? "bg-yellow-100 text-yellow-700"
                    : "bg-gray-100 text-gray-500"
                  }`}>
                    {fmt(engRate, { pct: true })} eng.
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Full post table ──────────────────────────────────────────────────────────

function PostTable({ posts, showPage }) {
  const [sort, setSort] = useState("impressions");
  const sorted = useMemo(() =>
    [...posts].sort((a, b) => (b[sort] || 0) - (a[sort] || 0)),
    [posts, sort]
  );

  if (!posts.length) return <EmptyState label="No posts synced yet" />;

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
        <h3 className="text-sm font-semibold text-gray-700">All Posts</h3>
        <div className="flex gap-2 flex-wrap">
          {cols.map(c => (
            <button key={c.key} onClick={() => setSort(c.key)}
              className={`text-xs px-3 py-1 rounded-full font-medium border transition-all ${
                sort === c.key ? "text-white border-transparent" : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
              }`}
              style={sort === c.key ? { background: LI_BLUE } : {}}>
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Date</th>
              {showPage && <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Page</th>}
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Post</th>
              {cols.map(c => (
                <th key={c.key} className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sorted.slice(0, 50).map((p, i) => (
              <tr key={p.post_id || i} className="hover:bg-gray-50">
                <td className="px-5 py-3 text-xs text-gray-400 whitespace-nowrap">{shortDate(p.post_date)}</td>
                {showPage && <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{p.org_name || "—"}</td>}
                <td className="px-5 py-3 text-gray-700 max-w-xs"><p className="truncate text-xs">{p.text_preview || "—"}</p></td>
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
                  }`}>{fmt(p.engagement_rate, { pct: true })}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Ads section ──────────────────────────────────────────────────────────────

function AdsSection({ data }) {
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
    spend: acc.spend + Number(d.spend || 0),
    impressions: acc.impressions + Number(d.impressions || 0),
    clicks: acc.clicks + Number(d.clicks || 0),
    conversions: acc.conversions + Number(d.conversions || 0),
  }), { spend: 0, impressions: 0, clicks: 0, conversions: 0 }), [data]);

  const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;

  if (!data.length) return <EmptyState label="No ad data synced" sub="Requires r_ads_reporting scope and LinkedIn Marketing API access." />;

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
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#F3F4F6" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} />
              <YAxis yAxisId="spend"  tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `₹${fmt(v)}`} />
              <YAxis yAxisId="clicks" orientation="right" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={TTStyle} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <Bar yAxisId="spend"  dataKey="Spend"  fill={LI_BLUE} radius={[4,4,0,0]} maxBarSize={20} />
              <Bar yAxisId="clicks" dataKey="Clicks" fill={AMBER}   radius={[4,4,0,0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ─── Sync banner ──────────────────────────────────────────────────────────────

function SyncBanner({ result }) {
  const [open, setOpen] = useState(false);
  if (!result) return null;
  if (result.error) return (
    <span className="text-xs px-3 py-1.5 rounded-full font-medium bg-red-50 text-red-600">
      ✗ {result.error}
    </span>
  );
  if (result.summary) {
    const allErrors = Object.entries(result.summary).flatMap(([name, r]) =>
      (r.errors || []).map(e => `[${name}] ${e}`)
    );
    const lines = Object.entries(result.summary).map(([name, r]) => {
      const parts = [];
      if (r.follower) parts.push(`${r.follower}f`);
      if (r.page)     parts.push(`${r.page}p`);
      if (r.posts)    parts.push(`${r.posts} posts`);
      return `${name}: ${parts.join(", ") || "no data"}`;
    });
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          <span className="text-xs px-3 py-1.5 rounded-full font-medium bg-green-50 text-green-700">
            ✓ {lines.join(" · ")}
          </span>
          {allErrors.length > 0 && (
            <button onClick={() => setOpen(o => !o)}
              className="text-xs text-red-400 underline underline-offset-2 hover:text-red-600">
              {allErrors.length} errors {open ? "▲" : "▼"}
            </button>
          )}
        </div>
        {open && (
          <div className="bg-gray-900 text-green-400 text-xs rounded-xl p-4 max-w-2xl w-full font-mono space-y-1 text-left max-h-64 overflow-y-auto">
            {allErrors.map((e, i) => <p key={i}>{e}</p>)}
          </div>
        )}
      </div>
    );
  }
  return null;
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

const TABS = ["Overview", "Pages", "Posts", "Ads"];

export default function LinkedInDashboard() {
  const {
    status, allOrgs, selectedOrgId, selectOrg,
    followerStats, pageAnalytics, posts, adAnalytics,
    loading, dataLoading, syncing, syncResult, sync, disconnect,
  } = useLinkedInData();

  const [tab,      setTab]      = useState("Overview");
  const [dateRange, setDateRange] = useState(30);

  // All hooks before early returns
  const cutoff = useMemo(() => cutoffDate(dateRange), [dateRange]);
  const prevCutoff = useMemo(() => cutoffDate(dateRange * 2), [dateRange]);

  // Current period data
  const filtFollower = useMemo(() => followerStats.filter(r => r.date >= cutoff), [followerStats, cutoff]);
  const filtPage     = useMemo(() => pageAnalytics.filter(r => r.date >= cutoff), [pageAnalytics, cutoff]);
  const filtPosts    = useMemo(() => posts.filter(r => !r.post_date || r.post_date >= cutoff), [posts, cutoff]);

  // Previous period data for % change
  const prevFollower = useMemo(() => followerStats.filter(r => r.date >= prevCutoff && r.date < cutoff), [followerStats, prevCutoff, cutoff]);
  const prevPosts    = useMemo(() => posts.filter(r => r.post_date && r.post_date >= prevCutoff && r.post_date < cutoff), [posts, prevCutoff, cutoff]);

  // KPI calculations
  const latestFollowers = useMemo(() => mergeByDate(filtFollower, ["total_followers"]).at(-1)?.total_followers || 0, [filtFollower]);
  const prevFollowers   = useMemo(() => mergeByDate(prevFollower, ["total_followers"]).at(-1)?.total_followers || 0, [prevFollower]);

  const totalImpressions = useMemo(() => filtPosts.reduce((s, p) => s + (p.impressions || 0), 0), [filtPosts]);
  const prevImpressions  = useMemo(() => prevPosts.reduce((s, p) => s + (p.impressions || 0), 0), [prevPosts]);

  const totalEngagements = useMemo(() => filtPosts.reduce((s, p) =>
    s + (p.reactions || 0) + (p.clicks || 0) + (p.comments || 0) + (p.shares || 0), 0), [filtPosts]);
  const avgEngRate = totalImpressions > 0 ? (totalEngagements / totalImpressions) * 100 : 0;

  const prevTotalEng  = useMemo(() => prevPosts.reduce((s, p) =>
    s + (p.reactions || 0) + (p.clicks || 0) + (p.comments || 0) + (p.shares || 0), 0), [prevPosts]);
  const prevEngRate   = prevImpressions > 0 ? (prevTotalEng / prevImpressions) * 100 : 0;

  const totalPageViews = useMemo(() => filtPage.reduce((s, p) => s + (p.page_views || 0), 0), [filtPage]);

  if (loading) return (
    <MainLayout>
      <div className="p-8 text-gray-400 text-sm animate-pulse">Loading LinkedIn data…</div>
    </MainLayout>
  );

  if (!status?.connected) return <ConnectScreen />;

  const headerLabel = selectedOrgId
    ? (allOrgs.find(o => o.id === selectedOrgId)?.name || selectedOrgId)
    : allOrgs.length > 1 ? "All Pages" : (status.orgName || "LinkedIn Analytics");

  const showPage = !selectedOrgId && allOrgs.length > 1;

  return (
    <MainLayout>
      <div className="p-4 lg:p-8 max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: LI_BLUE }}>
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{headerLabel}</h1>
              <p className="text-xs text-gray-400 mt-0.5">
                {allOrgs.length} page{allOrgs.length !== 1 ? "s" : ""} · {filtPosts.length} posts · {filtFollower.length} data points
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <SyncBanner result={syncResult} />
            <button onClick={sync} disabled={syncing}
              className="inline-flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl text-white hover:opacity-90 disabled:opacity-50"
              style={{ background: LI_BLUE }}>
              {syncing ? (
                <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>Syncing…</>
              ) : "↻ Sync Data"}
            </button>
            <button onClick={disconnect} className="text-xs text-gray-400 hover:text-red-500 px-3 py-2 rounded-xl hover:bg-red-50 transition-colors">
              Disconnect
            </button>
          </div>
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          <div className="w-px h-5 bg-gray-200 hidden sm:block" />
          <PageSelector allOrgs={allOrgs} selectedOrgId={selectedOrgId} onSelect={selectOrg} dataLoading={dataLoading} />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-2xl w-fit">
          {TABS.filter(t => t !== "Pages" || allOrgs.length > 1).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
                tab === t ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
              }`}>{t}</button>
          ))}
        </div>

        {/* ── Overview ─────────────────────────────────────────────────────── */}
        {tab === "Overview" && (
          <>
            <Section title="Performance Summary">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                  label="Total Followers"
                  value={fmt(latestFollowers)}
                  sub="current count"
                  icon="👥"
                  trend={pctChange(latestFollowers, prevFollowers)}
                />
                <KPICard
                  label="Post Impressions"
                  value={fmt(totalImpressions)}
                  sub={`${filtPosts.length} posts`}
                  icon="👁"
                  trend={pctChange(totalImpressions, prevImpressions)}
                />
                <KPICard
                  label="Avg Engagement Rate"
                  value={fmt(avgEngRate, { pct: true })}
                  sub="reactions + clicks + comments"
                  icon="📈"
                  trend={pctChange(avgEngRate, prevEngRate)}
                />
                <KPICard
                  label="Page Views"
                  value={fmt(totalPageViews)}
                  sub={`last ${dateRange} days`}
                  icon="🏠"
                />
              </div>
            </Section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
              <FollowerChart data={filtFollower} allOrgs={allOrgs} selectedOrgId={selectedOrgId} />
              <PageViewsChart data={filtPage} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
              <ContentImpressionsChart posts={filtPosts} allOrgs={allOrgs} showPage={showPage} />
              <EngagementBreakdownChart posts={filtPosts} allOrgs={allOrgs} />
            </div>

            <Section title={`Top Posts — Last ${dateRange} Days`}>
              <TopPosts posts={filtPosts} showPage={showPage} limit={5} />
            </Section>
          </>
        )}

        {/* ── Pages comparison ─────────────────────────────────────────────── */}
        {tab === "Pages" && allOrgs.length > 1 && (
          <>
            <Section title="Page Comparison">
              <PageCompare
                allOrgs={allOrgs}
                followerStats={filtFollower}
                pageAnalytics={filtPage}
                posts={filtPosts}
              />
            </Section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
              <FollowerChart data={filtFollower} allOrgs={allOrgs} selectedOrgId={null} />
              <PageRadarChart allOrgs={allOrgs} followerStats={filtFollower} posts={filtPosts} />
            </div>

            <Section title="Engagement Breakdown">
              <EngagementBreakdownChart posts={filtPosts} allOrgs={allOrgs} />
            </Section>
          </>
        )}

        {/* ── Posts ────────────────────────────────────────────────────────── */}
        {tab === "Posts" && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
              <ContentImpressionsChart posts={filtPosts} allOrgs={allOrgs} showPage={showPage} />
              <PostScatterChart posts={filtPosts} allOrgs={allOrgs} showPage={showPage} />
            </div>

            <Section title="Top 5 Posts by Impressions">
              <TopPosts posts={filtPosts} showPage={showPage} limit={5} />
            </Section>
            <Section title={`All Posts — Last ${dateRange} Days`}>
              <PostTable posts={filtPosts} showPage={showPage} />
            </Section>
          </>
        )}

        {/* ── Ads ──────────────────────────────────────────────────────────── */}
        {tab === "Ads" && (
          <Section title="Ad Analytics">
            <AdsSection data={adAnalytics} />
          </Section>
        )}

      </div>
    </MainLayout>
  );
}
