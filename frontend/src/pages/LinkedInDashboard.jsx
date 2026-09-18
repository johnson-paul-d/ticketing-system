import { useMemo, useState, useCallback, useEffect } from "react";
import MainLayout from "../layouts/MainLayout";
import useLinkedInData from "../hooks/useLinkedInData";
import api from "../services/api";
import { LINKEDIN_OAUTH_STATE_KEY, newLinkedInOAuthState } from "../constants/linkedin";
import {
  followerSeries, pageViewSeries, sumNew, lastTotal, monthlyNet, sumPageViews, daysAgoISO,
} from "../utils/linkedinFollowers";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  ReferenceLine,
} from "recharts";

// ─── Constants ────────────────────────────────────────────────────────────────

const LI_BLUE  = "#0077B5";
const PALETTE  = ["#0077B5","#10B981","#F59E0B","#EF4444","#8B5CF6","#EC4899","#14B8A6","#6366F1"];
const TTStyle  = { background:"#fff", border:"1px solid #e5e7eb", borderRadius:10, padding:"10px 14px", fontSize:12 };

const OAUTH_SCOPES = [
  "r_organization_social","r_organization_admin",
  "rw_organization_admin","w_organization_social","r_ads_reporting","r_ads",
].join("%20");

const CATS = [
  { name:"Event & Invitation",    icon:"🎪", color:"#6366F1", keys:["webinar","invite","event","exhibition","trade show","join us","register","attend","seminar","conference","workshop","rsvp"] },
  { name:"Company Announcement",  icon:"📢", color:"#0077B5", keys:["proud to announce","new office","partnership","expansion","collaboration","excited to share","milestone","joining","onboarding","we are thrilled","we are excited"] },
  { name:"Product",               icon:"🚀", color:"#10B981", keys:["product","feature","demo","demonstration","solution","platform","software","app","tool","launch","release","version","update"] },
  { name:"Wishes & Celebrations", icon:"🎉", color:"#EC4899", keys:["happy","wish","celebrate","congratulations","festival","holiday","birthday","anniversary","greetings","eid","diwali","christmas","new year","holi","pongal","onam"] },
  { name:"Achievement",           icon:"🏆", color:"#F59E0B", keys:["award","certified","certification","milestone","achievement","recognized","ranked","won","honor","proud","excellence","accreditation"] },
  { name:"Educational Content",   icon:"📚", color:"#8B5CF6", keys:["learn","tips","how to","guide","insight","knowledge","did you know","industry","trend","thought leadership","facts","understand","101","best practice"] },
  { name:"Customer Success",      icon:"⭐", color:"#14B8A6", keys:["testimonial","client","customer","success story","project","helped","results","impact","review","feedback","case study","outcome"] },
  { name:"Recruitment & Careers", icon:"👥", color:"#EF4444", keys:["hiring","job","career","opportunity","apply","join our team","we are looking","position","role","vacancy","opening","recruit"] },
];

const WEEK_DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const SECTIONS  = [
  { id:"overview",   icon:"📊", label:"Overview"          },
  { id:"followers",  icon:"👥", label:"Follower Growth"   },
  { id:"content",    icon:"📝", label:"Post Performance"  },
  { id:"categories", icon:"🏷️", label:"Content Categories"},
  { id:"insights",   icon:"💡", label:"AI Insights"       },
  { id:"strategy",   icon:"🗓️", label:"Content Strategy"  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n = 0, opts = {}) {
  if (opts.pct) return `${parseFloat(n || 0).toFixed(1)}%`;
  const v = parseFloat(n) || 0;
  if (v >= 1_000_000) return `${(v/1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v/1_000).toFixed(1)}K`;
  return v.toFixed(opts.dec || 0);
}

function shortDate(str) {
  if (!str) return "";
  return new Date(str + "T00:00:00").toLocaleDateString("en-US", { month:"short", day:"numeric" });
}

function pctChange(curr, prev) {
  if (!prev) return null;
  return ((curr - prev) / prev) * 100;
}

function autoClassify(text = "") {
  const lower = (text || "").toLowerCase();
  let best = { name:"Uncategorized", score:0 };
  for (const cat of CATS) {
    const score = cat.keys.filter(k => lower.includes(k)).length;
    if (score > best.score) best = { name:cat.name, score };
  }
  return best.name;
}

function linearForecast(values, futureDays) {
  const vals = (values || []).filter(v => v !== null && v !== undefined);
  if (vals.length < 2) return [];
  const n    = vals.length;
  const sumX  = (n*(n-1))/2;
  const sumY  = vals.reduce((s,v)=>s+v,0);
  const sumXY = vals.reduce((s,v,i)=>s+i*v,0);
  const sumXX = vals.reduce((s,_,i)=>s+i*i,0);
  const denom = n*sumXX - sumX*sumX;
  if (!denom) return [];
  const slope     = (n*sumXY - sumX*sumY) / denom;
  const intercept = (sumY - slope*sumX) / n;
  return Array.from({ length: futureDays }, (_,i) => ({
    isForecast: true,
    date:       `+${i+1}d`,
    predicted:  Math.max(0, Math.round(intercept + slope*(n+i))),
  }));
}

function bestDayAnalysis(posts) {
  const map = {};
  posts.forEach(p => {
    if (!p.post_date) return;
    const day = new Date(p.post_date+"T00:00:00").toLocaleDateString("en-US", { weekday:"long" });
    if (!map[day]) map[day] = { posts:0, eng:0, imp:0 };
    map[day].posts++;
    map[day].eng += (p.reactions||0)+(p.clicks||0)+(p.comments||0)+(p.shares||0);
    map[day].imp  += p.impressions || 0;
  });
  return WEEK_DAYS.map(d => ({
    day:    d.slice(0,3),
    full:   d,
    posts:  map[d]?.posts   || 0,
    avgEng: map[d]?.posts   ? Math.round(map[d].eng / map[d].posts) : 0,
    avgImp: map[d]?.posts   ? Math.round(map[d].imp / map[d].posts) : 0,
  }));
}

function ruleBasedInsights(posts, growth, catStats) {
  const out = [];
  const ranked = catStats.filter(c=>c.count>0).sort((a,b)=>b.avgEng-a.avgEng);

  if (ranked.length >= 2) {
    const top = ranked[0], bot = ranked[ranked.length-1];
    const lift = bot.avgEng > 0 ? Math.round((top.avgEng/bot.avgEng-1)*100) : 100;
    out.push({ type:"performance", icon:"🏆", color:"#10B981",
      title:`${top.icon} ${top.name} leads engagement`,
      text:`${top.name} posts average ${fmt(top.avgEng)} engagements — ${lift}% more than ${bot.name} content.`,
      action:`Increase ${top.name} content to 2–3 posts per week.` });
  }

  const highImpLowEng = catStats.find(c=>c.count>0 && c.avgImp>200 && c.avgEngRate<1);
  if (highImpLowEng) {
    out.push({ type:"warning", icon:"⚠️", color:"#F59E0B",
      title:`${highImpLowEng.name}: high reach, low interaction`,
      text:`"${highImpLowEng.name}" posts reach ${fmt(highImpLowEng.avgImp)} impressions on average but only ${fmt(highImpLowEng.avgEngRate,{pct:true})} engagement rate.`,
      action:"Add an open-ended question or clear call-to-action to drive comments." });
  }

  if (growth && growth.last > 0) {
    const { first, last, delta } = growth;
    out.push({ type:"growth", icon:"📈", color:"#0077B5",
      title:`${delta >= 0 ? "+" : ""}${fmt(delta)} followers this period`,
      text:`Page ${delta >= 0 ? "gained" : "lost"} ${fmt(Math.abs(delta))} followers (${fmt(pctChange(last,first)||0,{pct:true})} change). ${last} total followers now.`,
      action: delta < 10 ? "Boost top posts or collaborate with employees to share content." : "Sustain current content cadence — momentum is positive." });
  }

  const dayAn = bestDayAnalysis(posts);
  const bestDay = [...dayAn].sort((a,b)=>b.avgEng-a.avgEng).find(d=>d.posts>0);
  if (bestDay) {
    out.push({ type:"timing", icon:"🗓️", color:"#6366F1",
      title:`${bestDay.full} is your best posting day`,
      text:`Posts on ${bestDay.full} average ${fmt(bestDay.avgEng)} engagements — highest of any weekday in this period.`,
      action:`Schedule your most important content for ${bestDay.full}.` });
  }

  if (posts.length < 8) {
    out.push({ type:"frequency", icon:"📅", color:"#EF4444",
      title:"Posting frequency is low",
      text:`Only ${posts.length} posts in this period. LinkedIn recommends 3–5 posts per week for consistent algorithmic reach.`,
      action:"Build a content calendar. Aim for at least 12 posts per month." });
  }

  const missingCat = CATS.find(c => !catStats.find(cs => cs.name===c.name && cs.count>0));
  if (missingCat) {
    out.push({ type:"opportunity", icon:"💡", color:"#8B5CF6",
      title:`Untapped: ${missingCat.name} content`,
      text:`No "${missingCat.name}" posts detected this period. ${missingCat.icon} content typically drives strong engagement on LinkedIn.`,
      action:`Experiment with 1–2 ${missingCat.name} posts next month.` });
  }

  return out;
}

function buildAuthUrl(clientId, redirectUri, state) {
  return `https://www.linkedin.com/oauth/v2/authorization?response_type=code` +
    `&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${OAUTH_SCOPES}&state=${encodeURIComponent(state)}`;
}

// ─── Micro-components ─────────────────────────────────────────────────────────

function KPICard({ label, value, sub, trend, color = "#1a73e8", sparkData }) {
  const pos      = trend != null && trend >= 0;
  const showTrend = trend != null && isFinite(trend);
  return (
    <div className="bg-white rounded-xl p-4 flex flex-col gap-1" style={{ border:"1px solid #dadce0", borderTop:`3px solid ${color}` }}>
      <p className="text-xs font-medium uppercase tracking-wide" style={{ color:"#5f6368" }}>{label}</p>
      <p className="text-2xl sm:text-3xl font-semibold mt-0.5" style={{ color:"#202124" }}>{value}</p>
      <div className="flex items-center gap-2 flex-wrap mt-0.5">
        {showTrend && (
          <span className={`text-xs font-semibold flex items-center gap-0.5 ${pos ? "text-green-600" : "text-red-500"}`}>
            {pos ? "▲" : "▼"} {Math.abs(trend).toFixed(1)}%
          </span>
        )}
        {sub && <span className="text-xs" style={{ color:"#5f6368" }}>{sub}</span>}
      </div>
      {sparkData && sparkData.length > 1 && (
        <div className="mt-2 h-10">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top:2, right:0, left:0, bottom:0 }}>
              <defs>
                <linearGradient id={`spark_${label.replace(/\s+/g,"")}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={color} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={color} stopOpacity={0}   />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5}
                fill={`url(#spark_${label.replace(/\s+/g,"")})`} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function CatBadge({ name, small = false }) {
  const cat = CATS.find(c => c.name === name);
  if (!cat) return <span className="text-xs text-gray-400 px-2 py-0.5 rounded-full bg-gray-100">{name || "—"}</span>;
  return (
    <span className={`inline-flex items-center gap-1 font-medium rounded-full ${small ? "text-xs px-2 py-0.5" : "text-xs px-2.5 py-1"}`}
      style={{ background: cat.color + "18", color: cat.color }}>
      {cat.icon} {cat.name}
    </span>
  );
}

function Section({ title, sub, children, action }) {
  return (
    <div className="mb-5 sm:mb-8">
      <div className="flex items-center justify-between mb-3 sm:mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-gray-900">{title}</h2>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Empty({ label = "No data yet", sub = "Sync your LinkedIn pages to see data here." }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center text-2xl mb-3">📭</div>
      <p className="text-sm font-semibold text-gray-600">{label}</p>
      <p className="text-xs text-gray-400 mt-1">{sub}</p>
    </div>
  );
}

function Spinner({ sm }) {
  return (
    <svg className={`animate-spin ${sm ? "w-4 h-4" : "w-6 h-6"} text-blue-500`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  );
}

function AiBadge({ powered }) {
  if (!powered) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-600">
      ✨ AI
    </span>
  );
}

// ─── Chart Components ─────────────────────────────────────────────────────────

// Follower figures come from followerSeries() in utils/linkedinFollowers: one
// value per calendar day and per page, estimated between syncs, then added up.

function FollowerGainsChart({ series, prevSeries }) {
  const data = useMemo(() => series.map(d => ({ ...d, label: shortDate(d.date) })), [series]);

  if (!data.length) return <Empty label="No follower data in this period" sub="Sync your pages to start tracking follower metrics." />;

  const totalFollowers = lastTotal(data);
  const newInPeriod    = sumNew(data);
  const prevNew        = sumNew(prevSeries);
  const pctChange      = prevNew > 0 ? Math.round(((newInPeriod - prevNew) / prevNew) * 100) : null;
  const hasSplit       = data.some(d => d.organic !== null || d.paid !== null);
  const measuredDays   = data.filter(d => d.isSynced).length;

  const tickInterval = Math.max(1, Math.floor(data.length / 6));

  const fmtFullDate = raw => {
    try {
      return new Date(raw + "T00:00:00").toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric", year: "numeric",
      });
    } catch { return raw; }
  };

  return (
    <div>
      <div className="flex gap-12 mb-6 flex-wrap">
        <div>
          <p className="text-3xl font-bold text-gray-900">{fmt(totalFollowers)}</p>
          <p className="text-sm text-gray-500 mt-0.5">Total followers</p>
        </div>
        <div>
          <p className="text-3xl font-bold text-gray-900">{fmt(newInPeriod)}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            {pctChange !== null && (
              <span className={`text-sm font-semibold flex items-center gap-0.5 ${pctChange >= 0 ? "text-green-600" : "text-red-500"}`}>
                {pctChange >= 0 ? "▲" : "▼"} {Math.abs(pctChange)}%
              </span>
            )}
            <p className="text-sm text-gray-500">New followers in this period{pctChange !== null ? " vs previous" : ""}</p>
          </div>
        </div>
      </div>

      <div className="h-44 sm:h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top:8, right:8, left:0, bottom:0 }}>
            <CartesianGrid stroke="#E5E7EB" strokeDasharray="" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize:11, fill:"#6B7280" }} tickLine={false} axisLine={false} interval={tickInterval} />
            <YAxis tick={{ fontSize:11, fill:"#6B7280" }} tickLine={false} axisLine={false} tickFormatter={v => fmt(v)} width={36} />
            <Tooltip
              cursor={{ stroke: "#D1D5DB", strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div style={{ ...TTStyle, minWidth: 220 }}>
                    <p className="text-xs font-semibold text-gray-700 mb-2">{fmtFullDate(d.date)}</p>
                    <div className="flex items-center justify-between gap-4 mb-1">
                      <span className="flex items-center gap-1.5 text-xs text-gray-600">
                        <span className="inline-block w-5 border-t-2 border-solid" style={{ borderColor: LI_BLUE }}></span> New followers
                      </span>
                      <span className="text-xs font-bold text-gray-800">{fmt(d.newFollowers)}</span>
                    </div>
                    {d.organic !== null && (
                      <div className="flex items-center justify-between gap-4 mb-1">
                        <span className="flex items-center gap-1.5 text-xs text-gray-600">
                          <span className="inline-block w-5 border-t-2 border-dashed border-green-500"></span> Organic
                        </span>
                        <span className="text-xs font-bold text-gray-800">{fmt(d.organic)}</span>
                      </div>
                    )}
                    {d.paid !== null && (
                      <div className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-1.5 text-xs text-gray-600">
                          <span className="inline-block w-5 border-t-2 border-dashed border-amber-500"></span> Sponsored
                        </span>
                        <span className="text-xs font-bold text-gray-800">{fmt(d.paid)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-4 mt-2 pt-2 border-t border-gray-100">
                      <span className="text-xs text-gray-500">Total followers</span>
                      <span className="text-xs font-semibold text-gray-700">{d.total === null ? "—" : fmt(d.total)}</span>
                    </div>
                    {!d.isSynced && (
                      <p className="text-xs text-amber-500 mt-2">⚡ Estimated: no sync on this day</p>
                    )}
                  </div>
                );
              }}
            />
            <Line type="monotone" dataKey="newFollowers" name="New followers" stroke={LI_BLUE} strokeWidth={2}
              dot={false} activeDot={{ r: 4, fill: LI_BLUE, strokeWidth: 0 }} />
            {hasSplit && (
              <Line type="monotone" dataKey="organic" name="Organic" stroke="#22C55E" strokeWidth={1.5}
                strokeDasharray="6 4" dot={false} connectNulls={false} activeDot={{ r: 3, fill: "#22C55E", strokeWidth: 0 }} />
            )}
            {hasSplit && (
              <Line type="monotone" dataKey="paid" name="Sponsored" stroke="#F59E0B" strokeWidth={1.5}
                strokeDasharray="6 4" dot={false} connectNulls={false} activeDot={{ r: 3, fill: "#F59E0B", strokeWidth: 0 }} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center gap-6 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500 flex-wrap">
        <span className="flex items-center gap-2">
          <svg width="24" height="10"><line x1="0" y1="5" x2="24" y2="5" stroke={LI_BLUE} strokeWidth="2"/></svg>
          New followers
        </span>
        {hasSplit && (
          <>
            <span className="flex items-center gap-2">
              <svg width="24" height="10"><line x1="0" y1="5" x2="24" y2="5" stroke="#22C55E" strokeWidth="1.5" strokeDasharray="6 4"/></svg>
              Organic (imported)
            </span>
            <span className="flex items-center gap-2">
              <svg width="24" height="10"><line x1="0" y1="5" x2="24" y2="5" stroke="#F59E0B" strokeWidth="1.5" strokeDasharray="6 4"/></svg>
              Sponsored (imported)
            </span>
          </>
        )}
        <span className="ml-auto text-gray-400">
          {measuredDays} of {data.length} days measured by a sync; the rest is spread evenly between syncs
        </span>
      </div>
    </div>
  );
}

function OrgSponChart({ series }) {
  const data = useMemo(() => {
    const months = new Map();
    for (const d of series || []) {
      if (d.organic === null && d.paid === null) continue;
      const m = d.date.slice(0, 7);
      if (!months.has(m)) months.set(m, { month: m, Organic: 0, Sponsored: 0 });
      months.get(m).Organic   += d.organic || 0;
      months.get(m).Sponsored += d.paid    || 0;
    }
    return [...months.values()].slice(-12).map(r => ({
      ...r,
      label: new Date(r.month + "-01T00:00:00").toLocaleDateString("en-US", { month:"short", year:"2-digit" }),
    }));
  }, [series]);

  if (!data.length) {
    return (
      <Empty label="No organic / sponsored split yet"
        sub="LinkedIn's API only gives the follower total. Import the page's follower export (Analytics → Followers → Export) to see organic against sponsored." />
    );
  }

  return (
    <div className="h-48 sm:h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top:8, right:16, left:0, bottom:0 }}>
          <CartesianGrid stroke="#F3F4F6" strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={{ fontSize:10, fill:"#9CA3AF" }} tickLine={false} />
          <YAxis tick={{ fontSize:10, fill:"#9CA3AF" }} tickLine={false} axisLine={false} tickFormatter={v=>fmt(v)} />
          <Tooltip contentStyle={TTStyle} formatter={v=>[fmt(v)]} />
          <Legend wrapperStyle={{ fontSize:11, paddingTop:8 }} />
          <Bar dataKey="Organic"   stackId="a" fill="#10B981" maxBarSize={36} />
          <Bar dataKey="Sponsored" stackId="a" fill="#F59E0B" maxBarSize={36} radius={[6,6,0,0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function EngagementTrendChart({ posts }) {
  const data = useMemo(() => {
    const byDate = {};
    posts.forEach(p => {
      if (!p.post_date) return;
      if (!byDate[p.post_date]) byDate[p.post_date] = { date:p.post_date, Impressions:0, Engagements:0 };
      byDate[p.post_date].Impressions  += p.impressions || 0;
      byDate[p.post_date].Engagements  += (p.reactions||0)+(p.clicks||0)+(p.comments||0)+(p.shares||0);
    });
    return Object.values(byDate).sort((a,b)=>a.date>b.date?1:-1).map(d=>({...d, date:shortDate(d.date)}));
  }, [posts]);

  if (!data.length) return <Empty label="No post performance data" />;

  return (
    <div className="h-48 sm:h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top:8, right:16, left:0, bottom:0 }}>
          <defs>
            <linearGradient id="impG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={LI_BLUE} stopOpacity={0.15}/>
              <stop offset="95%" stopColor={LI_BLUE} stopOpacity={0.02}/>
            </linearGradient>
            <linearGradient id="engG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#10B981" stopOpacity={0.15}/>
              <stop offset="95%" stopColor="#10B981" stopOpacity={0.02}/>
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#F3F4F6" strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize:10, fill:"#9CA3AF" }} tickLine={false} />
          <YAxis tick={{ fontSize:10, fill:"#9CA3AF" }} tickLine={false} axisLine={false} tickFormatter={v=>fmt(v)} />
          <Tooltip contentStyle={TTStyle} formatter={v=>[fmt(v)]} />
          <Legend wrapperStyle={{ fontSize:11, paddingTop:8 }} />
          <Area type="monotone" dataKey="Impressions"  stroke={LI_BLUE}  fill="url(#impG)" strokeWidth={2} dot={false} />
          <Area type="monotone" dataKey="Engagements"  stroke="#10B981"  fill="url(#engG)" strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function Top10Chart({ posts, metric = "impressions", label = "Impressions" }) {
  const data = useMemo(() =>
    [...posts]
      .filter(p => (p[metric] || 0) > 0)
      .sort((a,b) => (b[metric]||0)-(a[metric]||0))
      .slice(0, 10)
      .map(p => ({
        name:  (p.text_preview || "Post").slice(0, 35) + "…",
        value: parseFloat(p[metric]) || 0,
        full:  p.text_preview,
      })),
    [posts, metric]);

  if (!data.length) return <Empty label={`No ${label} data yet`} />;

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top:4, right:24, left:8, bottom:0 }}>
          <CartesianGrid stroke="#F3F4F6" strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tick={{ fontSize:10, fill:"#9CA3AF" }} tickLine={false} axisLine={false} tickFormatter={v=>fmt(v)} />
          <YAxis type="category" dataKey="name" tick={{ fontSize:10, fill:"#374151" }} tickLine={false} width={140} />
          <Tooltip contentStyle={TTStyle}
            content={({ active, payload }) => {
              if (!active || !payload?.[0]) return null;
              const d = payload[0].payload;
              return (
                <div style={TTStyle}>
                  <p className="text-xs text-gray-500 max-w-xs mb-1">{d.full}</p>
                  <p className="text-sm font-bold text-gray-900">{fmt(d.value)} {label}</p>
                </div>
              );
            }} />
          <Bar dataKey="value" fill={LI_BLUE} radius={[0,6,6,0]} maxBarSize={20}>
            {data.map((_,i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function CategoryDonut({ catStats }) {
  const data = catStats.filter(c => c.count > 0);
  if (!data.length) return <Empty label="Classify posts to see category distribution" />;

  return (
    <div className="h-48 sm:h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={90}
            dataKey="count" nameKey="name" paddingAngle={2}>
            {data.map((c, i) => <Cell key={i} fill={c.color} />)}
          </Pie>
          <Tooltip contentStyle={TTStyle}
            formatter={(v, name) => [`${v} posts`, name]} />
          <Legend wrapperStyle={{ fontSize:11, paddingTop:4 }}
            formatter={(v) => {
              const c = CATS.find(x=>x.name===v);
              return `${c?.icon || ""} ${v}`;
            }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function DayHeatmap({ posts }) {
  const data = useMemo(() => bestDayAnalysis(posts), [posts]);
  const maxEng = Math.max(...data.map(d=>d.avgEng), 1);

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {data.map(d => {
          const intensity = d.posts ? d.avgEng / maxEng : 0;
          const bg = intensity > 0.7 ? "#0077B5" : intensity > 0.4 ? "#3D9BD4" : intensity > 0.1 ? "#BDD9F2" : "#F3F4F6";
          const textColor = intensity > 0.7 ? "text-white" : "text-gray-700";
          return (
            <div key={d.day} className={`rounded-lg sm:rounded-xl p-2 sm:p-3 text-center transition-all ${textColor}`} style={{ background: bg }}>
              <div className="text-xs font-bold mb-0.5">{d.day.slice(0,3)}</div>
              <div className={`text-xs ${intensity > 0.7 ? "text-blue-100" : "text-gray-400"}`}>{d.posts}p</div>
              {d.posts > 0 && <div className="text-xs font-semibold mt-0.5 hidden sm:block">{fmt(d.avgEng)}</div>}
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-gray-400">Lighter = lower engagement</span>
        <span className="text-xs text-gray-400">Darker = higher</span>
      </div>
    </div>
  );
}

// ─── Overview Section ─────────────────────────────────────────────────────────

function OverviewSection({ posts, series, prevSeries, pageSeries, prevPosts, dateRange }) {
  const latestF   = useMemo(() => lastTotal(series), [series]);
  const prevF     = useMemo(() => lastTotal(prevSeries) || null, [prevSeries]);
  const newF      = useMemo(() => sumNew(series), [series]);
  const pageMeasured = useMemo(() => pageSeries.some(d => d.pageViews !== null), [pageSeries]);

  const totalImp  = useMemo(() => posts.reduce((s,p)=>s+(p.impressions||0),0), [posts]);
  const totalReact = useMemo(() => posts.reduce((s,p)=>s+(p.reactions||0),0), [posts]);
  const totalComm = useMemo(() => posts.reduce((s,p)=>s+(p.comments||0),0), [posts]);
  const totalShare = useMemo(() => posts.reduce((s,p)=>s+(p.shares||0),0), [posts]);
  const totalClick = useMemo(() => posts.reduce((s,p)=>s+(p.clicks||0),0), [posts]);
  const totalEng  = totalReact + totalComm + totalShare + totalClick;
  const engRate   = totalImp > 0 ? (totalEng/totalImp)*100 : 0;
  const ctr       = totalImp > 0 ? (totalClick/totalImp)*100 : 0;
  const totalViews = useMemo(() => sumPageViews(pageSeries), [pageSeries]);
  const avgEngPost = posts.length ? totalEng/posts.length : 0;

  const prevImp   = useMemo(() => prevPosts.reduce((s,p)=>s+(p.impressions||0),0), [prevPosts]);
  const prevReact = useMemo(() => prevPosts.reduce((s,p)=>s+(p.reactions||0),0), [prevPosts]);
  const prevComm  = useMemo(() => prevPosts.reduce((s,p)=>s+(p.comments||0),0), [prevPosts]);
  const prevShare = useMemo(() => prevPosts.reduce((s,p)=>s+(p.shares||0),0), [prevPosts]);
  const prevClick = useMemo(() => prevPosts.reduce((s,p)=>s+(p.clicks||0),0), [prevPosts]);
  const prevEng   = prevReact + prevComm + prevShare + prevClick;
  const prevEngR  = prevImp > 0 ? (prevEng/prevImp)*100 : null;
  const prevCtr   = prevImp > 0 ? (prevClick/prevImp)*100 : null;

  const topPost   = useMemo(() => [...posts].sort((a,b)=>(b.impressions||0)-(a.impressions||0))[0], [posts]);
  const dayAn     = useMemo(() => bestDayAnalysis(posts), [posts]);
  const bestDay   = useMemo(() => [...dayAn].sort((a,b)=>b.avgEng-a.avgEng).find(d=>d.posts>0), [dayAn]);

  // Sparkline data — daily totals from posts
  const sparkByDate = useMemo(() => {
    const map = {};
    posts.forEach(p => {
      if (!p.post_date) return;
      if (!map[p.post_date]) map[p.post_date] = { imp:0, eng:0, react:0, comm:0 };
      map[p.post_date].imp   += p.impressions || 0;
      map[p.post_date].eng   += (p.reactions||0)+(p.comments||0)+(p.shares||0)+(p.clicks||0);
      map[p.post_date].react += p.reactions || 0;
      map[p.post_date].comm  += p.comments  || 0;
    });
    return Object.entries(map).sort(([a],[b])=>a>b?1:-1).map(([,v])=>v);
  }, [posts]);
  const sparkImp   = sparkByDate.map(d=>({ v:d.imp }));
  const sparkEng   = sparkByDate.map(d=>({ v:d.eng }));
  const sparkReact = sparkByDate.map(d=>({ v:d.react }));

  // Engagement type breakdown for donut
  const engBreakdown = [
    { name:"Reactions", value:totalReact, color:"#ec4899" },
    { name:"Comments",  value:totalComm,  color:"#14b8a6" },
    { name:"Shares",    value:totalShare, color:"#6366f1" },
    { name:"Clicks",    value:totalClick, color:"#ff6d00" },
  ].filter(e=>e.value>0);

  // Top 5 posts for performance table
  const top5 = useMemo(() =>
    [...posts].sort((a,b)=>(b.impressions||0)-(a.impressions||0)).slice(0,5),
    [posts]);

  return (
    <div className="space-y-5">

      {/* KPI Row 1 — reach & audience */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard label="Total Followers"   value={fmt(latestF)}
          trend={pctChange(latestF, prevF)} color="#1a73e8"
          sub={`+${fmt(newF)} this period`}
          sparkData={series.slice(-14).map(d=>({ v:d.total||0 }))} />
        <KPICard label="Impressions"       value={fmt(totalImp)}
          trend={pctChange(totalImp, prevImp)} color="#fbbc04"
          sub={`${posts.length} posts`}
          sparkData={sparkImp} />
        <KPICard label="Page Views"        value={pageMeasured ? fmt(totalViews) : "—"}
          color="#ea4335" sub={pageMeasured ? "between syncs, all page sections" : "needs two syncs to measure"} />
        <KPICard label="Posts Published"   value={fmt(posts.length)}
          color="#34a853" sub={`last ${dateRange} days`} />
      </div>

      {/* KPI Row 2 — engagement */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard label="Total Engagements" value={fmt(totalEng)}
          trend={pctChange(totalEng, prevEng)} color="#9c27b0"
          sub="react+comments+shares+clicks"
          sparkData={sparkEng} />
        <KPICard label="Engagement Rate"   value={`${fmt(engRate,{dec:2})}%`}
          trend={pctChange(engRate, prevEngR)} color="#8b5cf6"
          sub="eng / impressions" />
        <KPICard label="Click-Through Rate" value={`${fmt(ctr,{dec:2})}%`}
          trend={pctChange(ctr, prevCtr)} color="#f59e0b"
          sub="clicks / impressions" />
        <KPICard label="Avg Eng / Post"    value={fmt(avgEngPost,{dec:1})}
          trend={pctChange(avgEngPost, prevPosts.length ? prevEng/prevPosts.length : null)} color="#ff6d00"
          sub="per post" />
      </div>

      {/* Engagement type breakdown + Top post */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Engagement Breakdown */}
        {engBreakdown.length > 0 && (
          <div className="bg-white rounded-xl p-4" style={{ border:"1px solid #dadce0" }}>
            <p className="text-xs font-semibold uppercase tracking-wide mb-4" style={{ color:"#5f6368" }}>Engagement Breakdown</p>
            <div className="flex items-center gap-4">
              {/* Donut */}
              <div className="flex-shrink-0" style={{ width:120, height:120 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={engBreakdown} dataKey="value" cx="50%" cy="50%"
                      innerRadius={32} outerRadius={54} strokeWidth={0}>
                      {engBreakdown.map(e=>(
                        <Cell key={e.name} fill={e.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ fontSize:11, border:"1px solid #dadce0", borderRadius:6 }}
                      formatter={(v, n) => [fmt(v), n]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Legend + bars */}
              <div className="flex-1 space-y-2">
                {engBreakdown.map(e=>(
                  <div key={e.name}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="flex items-center gap-1.5 text-xs" style={{ color:"#202124" }}>
                        <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background:e.color }} />
                        {e.name}
                      </span>
                      <span className="text-xs font-semibold" style={{ color:"#202124" }}>{fmt(e.value)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100">
                      <div className="h-1.5 rounded-full" style={{ width:`${totalEng ? (e.value/totalEng*100).toFixed(0) : 0}%`, background:e.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Top post */}
        {topPost && (
          <div className="bg-white rounded-xl p-4" style={{ border:"1px solid #dadce0" }}>
            <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color:"#5f6368" }}>Top Performing Post</p>
            <p className="text-sm font-medium mb-4 leading-relaxed line-clamp-3" style={{ color:"#202124" }}>
              {topPost.text_preview || "—"}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label:"Impressions", val:fmt(topPost.impressions),           color:"#fbbc04" },
                { label:"Reactions",   val:fmt(topPost.reactions),             color:"#ec4899" },
                { label:"Comments",    val:fmt(topPost.comments),              color:"#14b8a6" },
                { label:"Shares",      val:fmt(topPost.shares),                color:"#6366f1" },
                { label:"Clicks",      val:fmt(topPost.clicks),                color:"#ff6d00" },
                { label:"Eng. Rate",   val:`${fmt(topPost.engagement_rate,{dec:2})}%`, color:"#8b5cf6" },
              ].map(m=>(
                <div key={m.label} className="rounded-lg p-2" style={{ background:m.color+"12" }}>
                  <p className="text-base font-bold" style={{ color:m.color }}>{m.val}</p>
                  <p className="text-xs mt-0.5" style={{ color:"#5f6368" }}>{m.label}</p>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <CatBadge name={autoClassify(topPost.text_preview)} small />
              {topPost.post_date && <span className="text-xs ml-2" style={{ color:"#5f6368" }}>{shortDate(topPost.post_date)}</span>}
            </div>
          </div>
        )}
      </div>

      {/* Performance table — top 5 posts */}
      {top5.length > 0 && (
        <div className="bg-white rounded-xl overflow-hidden" style={{ border:"1px solid #dadce0" }}>
          <div className="px-4 py-3 border-b" style={{ borderColor:"#dadce0" }}>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color:"#5f6368" }}>Top 5 Posts by Impressions</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr style={{ borderBottom:"1px solid #f1f3f4" }}>
                  {["Post","Date","Impressions","Reactions","Comments","Eng. Rate"].map(h=>(
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide" style={{ color:"#5f6368" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {top5.map((p,i)=>(
                  <tr key={p.post_id||i} className="hover:bg-gray-50 transition-colors" style={{ borderBottom:"1px solid #f1f3f4" }}>
                    <td className="px-4 py-3 text-xs max-w-[200px] truncate" style={{ color:"#202124" }} title={p.text_preview}>
                      {(p.text_preview||"—").slice(0,55)}{p.text_preview?.length>55?"…":""}
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color:"#5f6368" }}>{shortDate(p.post_date)}</td>
                    <td className="px-4 py-3 text-xs font-semibold whitespace-nowrap" style={{ color:"#202124" }}>{fmt(p.impressions)}</td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color:"#ec4899" }}>{fmt(p.reactions)}</td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color:"#14b8a6" }}>{fmt(p.comments)}</td>
                    <td className="px-4 py-3 text-xs font-semibold whitespace-nowrap" style={{ color:"#8b5cf6" }}>{fmt(p.engagement_rate,{dec:2})}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Best day + top category */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {bestDay && (
          <div className="bg-white rounded-xl p-4" style={{ border:"1px solid #dadce0", borderLeft:"3px solid #1a73e8" }}>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color:"#5f6368" }}>Best Posting Day</p>
            <p className="text-2xl font-bold mb-1" style={{ color:"#202124" }}>{bestDay.full}</p>
            <p className="text-sm" style={{ color:"#5f6368" }}>{fmt(bestDay.avgEng)} avg eng · {bestDay.posts} post{bestDay.posts!==1?"s":""}</p>
          </div>
        )}
        {posts.length > 0 && (() => {
          const cats = CATS.map(c=>({ ...c, count:posts.filter(p=>autoClassify(p.text_preview)===c.name).length }))
            .filter(c=>c.count>0).sort((a,b)=>b.count-a.count);
          const top = cats[0];
          return top ? (
            <div className="bg-white rounded-xl p-4" style={{ border:"1px solid #dadce0", borderLeft:`3px solid ${top.color}` }}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color:"#5f6368" }}>Top Content Category</p>
              <p className="text-2xl font-bold mb-1" style={{ color:"#202124" }}>{top.icon} {top.name}</p>
              <p className="text-sm" style={{ color:"#5f6368" }}>{top.count} of {posts.length} posts · {Math.round(top.count/posts.length*100)}%</p>
            </div>
          ) : null;
        })()}
      </div>
    </div>
  );
}

// ─── Follower Growth Section ──────────────────────────────────────────────────

function ImportHistoricalPanel({ allOrgs, onImported }) {
  const [open,      setOpen]      = useState(false);
  const [orgId,     setOrgId]     = useState(allOrgs[0]?.id || "");
  const [file,      setFile]      = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [result,    setResult]    = useState(null);
  const [error,     setError]     = useState(null);

  const orgName = allOrgs.find(o => o.id === orgId)?.name || orgId;

  const handleImport = async () => {
    if (!file || !orgId) return;
    setLoading(true); setResult(null); setError(null);
    try {
      const fd = new FormData();
      fd.append("file",    file);
      fd.append("orgId",   orgId);
      fd.append("orgName", orgName);
      const { data } = await api.post("/linkedin/import-followers", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(data);
      if (onImported) onImported();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <div className="flex justify-end">
        <button onClick={() => setOpen(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-xl"
          style={{ background: LI_BLUE }}>
          ⬆ Import Historical Data
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-800">Import LinkedIn Follower Export</h3>
          <p className="text-xs text-gray-400 mt-0.5">Go to LinkedIn Page → Analytics → Followers → Export (CSV)</p>
        </div>
        <button onClick={() => { setOpen(false); setResult(null); setError(null); setFile(null); }}
          className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Org selector */}
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">LinkedIn Page</label>
          <select value={orgId} onChange={e => { setOrgId(e.target.value); setResult(null); setError(null); }}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200">
            {allOrgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>

        {/* File picker */}
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Export File (.csv or .xlsx)</label>
          <input type="file" accept=".csv,.xlsx,.xls"
            onChange={e => { setFile(e.target.files[0]); setResult(null); setError(null); }}
            className="w-full text-sm text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5
              file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0
              file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700
              hover:file:bg-blue-100 cursor-pointer" />
        </div>
      </div>

      {/* Step guide */}
      <div className="bg-blue-50 rounded-xl p-3 mb-4 text-xs text-blue-700 space-y-1">
        <p className="font-semibold mb-1">How to export from LinkedIn:</p>
        <p>1. Go to your LinkedIn Company Page</p>
        <p>2. Click <strong>Analytics</strong> → <strong>Followers</strong></p>
        <p>3. Set date range (up to 1 year)</p>
        <p>4. Click <strong>Export</strong> button (top right)</p>
        <p>5. Upload the downloaded file here</p>
      </div>

      {/* Import button */}
      <div className="flex items-center gap-3">
        <button onClick={handleImport} disabled={!file || !orgId || loading}
          className="px-5 py-2 text-sm font-semibold text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          style={{ background: LI_BLUE }}>
          {loading ? "Importing…" : "Import Data"}
        </button>
        {file && <span className="text-xs text-gray-400">{file.name}</span>}
      </div>

      {/* Results */}
      {result && (
        <div className="mt-4 bg-green-50 border border-green-100 rounded-xl p-4">
          <p className="text-sm font-semibold text-green-700 mb-1">✓ Import successful</p>
          <p className="text-xs text-gray-600">{fmt(result.inserted)} days imported for <strong>{orgName}</strong></p>
          <p className="text-xs text-gray-500">
            Date range: {result.dateRange?.from} → {result.dateRange?.to}
          </p>
          {result.knownTotal > 0 && (
            <p className="text-xs text-gray-500">Anchored to current total: {fmt(result.knownTotal)} followers</p>
          )}
          <p className="text-xs text-green-600 mt-1">Refresh the page to see updated charts.</p>
        </div>
      )}

      {error && (
        <div className="mt-4 bg-red-50 border border-red-100 rounded-xl p-4">
          <p className="text-sm font-semibold text-red-700">Import failed</p>
          <p className="text-xs text-red-500 mt-1">{error}</p>
        </div>
      )}
    </div>
  );
}

function FollowerSection({ fullSeries, series, prevSeries, allOrgs }) {

  // Net gain per month across the visible pages, last 12 months.
  const monthlyData = useMemo(() =>
    monthlyNet(fullSeries).slice(-12).map(m => ({
      month: new Date(m.month + "-01T00:00:00").toLocaleDateString("en-US", { month:"short", year:"2-digit" }),
      Net:   m.net,
      End:   m.end,
    })), [fullSeries]);

  return (
    <div className="space-y-6">
      {allOrgs?.length > 0 && (
        <ImportHistoricalPanel allOrgs={allOrgs} onImported={() => window.location.reload()} />
      )}

      <Section title="Daily Follower Growth"
        sub="Followers gained per calendar day; days without a sync are estimated">
        <div className="bg-white rounded-2xl p-3 sm:p-5 border border-gray-100 shadow-sm">
          <FollowerGainsChart series={series} prevSeries={prevSeries} />
        </div>
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Organic vs Sponsored" sub="New followers by month, from imported LinkedIn exports">
          <div className="bg-white rounded-2xl p-3 sm:p-5 border border-gray-100 shadow-sm">
            <OrgSponChart series={fullSeries} />
          </div>
        </Section>
        <Section title="Net Followers by Month" sub="Followers gained per month, last 12 months">
          <div className="bg-white rounded-2xl p-3 sm:p-5 border border-gray-100 shadow-sm">
            {monthlyData.length ? (
              <div className="h-48 sm:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData} margin={{ top:4, right:8, left:0, bottom:0 }}>
                    <CartesianGrid stroke="#F3F4F6" strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize:10, fill:"#9CA3AF" }} tickLine={false} />
                    <YAxis tick={{ fontSize:10, fill:"#9CA3AF" }} tickLine={false} axisLine={false} tickFormatter={v=>fmt(v)} />
                    <Tooltip contentStyle={TTStyle}
                      formatter={(v, name, item) => [`${fmt(v)} gained · ${fmt(item?.payload?.End || 0)} at month end`, "Net"]} />
                    <Bar dataKey="Net" fill={LI_BLUE} radius={[6,6,0,0]} maxBarSize={36}>
                      {monthlyData.map((m,i)=><Cell key={i} fill={m.Net>=0 ? "#10B981" : "#EF4444"} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <Empty label="Not enough data for monthly view" />}
          </div>
        </Section>
      </div>
    </div>
  );
}

// ─── Content Performance Section ──────────────────────────────────────────────

function ContentSection({ posts, showPage }) {
  const [sortCol, setSortCol] = useState("impressions");
  const [sortDir, setSortDir] = useState(-1);

  const sortedPosts = useMemo(() =>
    [...posts].sort((a,b) => sortDir * ((parseFloat(b[sortCol])||0) - (parseFloat(a[sortCol])||0))),
    [posts, sortCol, sortDir]);

  const cols = [
    { key:"post_date",      label:"Date",        fmt:v=>shortDate(v) },
    { key:"text_preview",   label:"Post",        fmt:v=>(v||"—").slice(0,60)+"…" },
    { key:"impressions",    label:"Impressions", fmt:v=>fmt(v) },
    { key:"reactions",      label:"Reactions",   fmt:v=>fmt(v) },
    { key:"comments",       label:"Comments",    fmt:v=>fmt(v) },
    { key:"shares",         label:"Shares",      fmt:v=>fmt(v) },
    { key:"clicks",         label:"Clicks",      fmt:v=>fmt(v) },
    { key:"engagement_rate",label:"Eng. Rate",   fmt:v=>fmt(v,{pct:true}) },
  ];

  return (
    <div className="space-y-6">
      <Section title="Impressions & Engagement Over Time" sub="Combined across all posts by publish date">
        <div className="bg-white rounded-2xl p-3 sm:p-5 border border-gray-100 shadow-sm">
          <EngagementTrendChart posts={posts} />
        </div>
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Top 10 Posts by Impressions" sub="Most reached content">
          <div className="bg-white rounded-2xl p-3 sm:p-5 border border-gray-100 shadow-sm">
            <Top10Chart posts={posts} metric="impressions" label="Impressions" />
          </div>
        </Section>
        <Section title="Top 10 Posts by Engagement Rate" sub="Best converting content">
          <div className="bg-white rounded-2xl p-3 sm:p-5 border border-gray-100 shadow-sm">
            <Top10Chart posts={posts} metric="engagement_rate" label="Eng. Rate %" />
          </div>
        </Section>
      </div>

      <Section title="All Posts" sub={`${posts.length} posts — click a column to sort`}>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-left min-w-[700px]">
            <thead>
              <tr className="border-b border-gray-100">
                {cols.map(c => (
                  <th key={c.key}
                    className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide cursor-pointer hover:text-gray-700 select-none"
                    onClick={() => { if (sortCol===c.key) setSortDir(d=>-d); else { setSortCol(c.key); setSortDir(-1); } }}>
                    {c.label} {sortCol===c.key ? (sortDir===-1?"↓":"↑") : ""}
                  </th>
                ))}
                {showPage && <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Page</th>}
                <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Category</th>
              </tr>
            </thead>
            <tbody>
              {sortedPosts.length === 0 ? (
                <tr><td colSpan={cols.length+2} className="px-4 py-10 text-center text-sm text-gray-400">No posts in this period</td></tr>
              ) : sortedPosts.map(p => (
                <tr key={p.post_id} className="border-b border-gray-50 hover:bg-gray-50">
                  {cols.map(c => (
                    <td key={c.key} className={`px-4 py-3 text-xs ${c.key==="text_preview" ? "text-gray-700 max-w-xs" : "text-gray-500 whitespace-nowrap"}`}>
                      {c.fmt(p[c.key])}
                    </td>
                  ))}
                  {showPage && <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{p.org_name || "—"}</td>}
                  <td className="px-4 py-3"><CatBadge name={autoClassify(p.text_preview)} small /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

// ─── Category Section ─────────────────────────────────────────────────────────

function CategorySection({ posts, classifications, onClassifyAI, classifying, aiClassified }) {
  const enriched = useMemo(() =>
    posts.map(p => ({ ...p, category: classifications[p.post_id] || autoClassify(p.text_preview) })),
    [posts, classifications]);

  const catStats = useMemo(() => CATS.map(cat => {
    const cp      = enriched.filter(p=>p.category===cat.name);
    const totalImp = cp.reduce((s,p)=>s+(p.impressions||0),0);
    const totalEng = cp.reduce((s,p)=>s+(p.reactions||0)+(p.clicks||0)+(p.comments||0)+(p.shares||0),0);
    const best  = [...cp].sort((a,b)=>(parseFloat(b.engagement_rate)||0)-(parseFloat(a.engagement_rate)||0))[0];
    const worst = [...cp].sort((a,b)=>(parseFloat(a.engagement_rate)||0)-(parseFloat(b.engagement_rate)||0)).find(p=>parseFloat(p.engagement_rate||0)>=0);
    return {
      ...cat,
      count:      cp.length,
      avgImp:     cp.length ? Math.round(totalImp/cp.length) : 0,
      avgEngRate: cp.length && totalImp ? parseFloat(((totalEng/totalImp)*100).toFixed(2)) : 0,
      avgEng:     cp.length ? Math.round(totalEng/cp.length) : 0,
      totalEng,
      best, worst,
    };
  }), [enriched]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="Content Distribution"
          sub="Auto-classified from post text"
          action={
            <div className="flex items-center gap-2">
              {aiClassified && <AiBadge powered />}
              <button onClick={onClassifyAI} disabled={classifying || !posts.length}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl text-white disabled:opacity-50"
                style={{ background:"#8B5CF6" }}>
                {classifying ? <><Spinner sm /> Classifying…</> : "✨ Enhance with AI"}
              </button>
            </div>
          }>
          <div className="bg-white rounded-2xl p-3 sm:p-5 border border-gray-100 shadow-sm">
            <CategoryDonut catStats={catStats} />
          </div>
        </Section>

        <Section title="Category Performance" sub="Avg metrics per content type">
          <div className="bg-white rounded-2xl p-3 sm:p-5 border border-gray-100 shadow-sm">
            {catStats.filter(c=>c.count>0).length ? (
              <div className="h-48 sm:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={catStats.filter(c=>c.count>0)} layout="vertical"
                    margin={{ top:4, right:16, left:8, bottom:0 }}>
                    <CartesianGrid stroke="#F3F4F6" strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize:10, fill:"#9CA3AF" }} tickLine={false} axisLine={false} tickFormatter={v=>fmt(v)} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize:10, fill:"#374151" }}
                      tickFormatter={v => CATS.find(c=>c.name===v)?.icon + " " + v.split(" ")[0]}
                      tickLine={false} width={80} />
                    <Tooltip contentStyle={TTStyle}
                      formatter={(v,n) => [fmt(v), n]}
                      labelFormatter={l => CATS.find(c=>c.name===l)?.icon + " " + l} />
                    <Legend wrapperStyle={{ fontSize:11, paddingTop:8 }} />
                    <Bar dataKey="avgImp" name="Avg Impressions" fill={LI_BLUE} radius={[0,4,4,0]} maxBarSize={18}>
                      {catStats.filter(c=>c.count>0).map((_,i)=><Cell key={i} fill={PALETTE[i%PALETTE.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <Empty label="No classified posts" />}
          </div>
        </Section>
      </div>

      <Section title="Category Performance Details" sub="Full metrics breakdown per content category">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-left min-w-[640px]">
            <thead>
              <tr className="border-b border-gray-100">
                {["Category","Posts","Avg Impressions","Avg Eng. Rate","Avg Engagements","Best Post (Eng. Rate)"].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {catStats.sort((a,b)=>b.count-a.count).map(cat => (
                <tr key={cat.name} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
                      style={{ background:cat.color+"18", color:cat.color }}>
                      {cat.icon} {cat.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-gray-900">{cat.count}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{cat.count ? fmt(cat.avgImp) : "—"}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{cat.count ? fmt(cat.avgEngRate,{pct:true}) : "—"}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{cat.count ? fmt(cat.avgEng) : "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-xs">
                    {cat.best ? (cat.best.text_preview || "—").slice(0, 60) + "…" : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

// ─── AI Insights Section ──────────────────────────────────────────────────────

function InsightsSection({ posts, growth, orgId, dateRange }) {
  const [aiInsights,    setAIInsights]    = useState([]);
  const [loadingAI,     setLoadingAI]     = useState(false);
  const [aiPowered,     setAiPowered]     = useState(false);
  const [aiErr,         setAiErr]         = useState(null);

  const catStats = useMemo(() => {
    return CATS.map(cat => {
      const cp = posts.filter(p => autoClassify(p.text_preview) === cat.name);
      const totalImp = cp.reduce((s,p)=>s+(p.impressions||0),0);
      const totalEng = cp.reduce((s,p)=>s+(p.reactions||0)+(p.clicks||0)+(p.comments||0)+(p.shares||0),0);
      return { ...cat, count:cp.length,
        avgImp: cp.length ? Math.round(totalImp/cp.length) : 0,
        avgEngRate: cp.length && totalImp ? parseFloat(((totalEng/totalImp)*100).toFixed(2)) : 0,
        avgEng: cp.length ? Math.round(totalEng/cp.length) : 0,
      };
    });
  }, [posts]);

  const ruleInsights = useMemo(() =>
    ruleBasedInsights(posts, growth, catStats), [posts, growth, catStats]);

  const insights = aiInsights.length ? aiInsights : ruleInsights;

  const handleAIInsights = useCallback(async () => {
    setLoadingAI(true);
    setAiErr(null);
    try {
      const params = { days: dateRange };
      if (orgId) params.orgId = orgId;
      const res = await api.get("/linkedin/ai-insights", { params });
      if (res.data.aiPowered && res.data.insights?.length) {
        setAIInsights(res.data.insights);
        setAiPowered(true);
      } else {
        setAiErr("GEMINI_API_KEY not configured on the server. Add it to backend/.env to enable AI insights.");
      }
    } catch (e) {
      setAiErr(e?.response?.data?.message || e.message);
    } finally {
      setLoadingAI(false);
    }
  }, [orgId, dateRange]);

  const typeIcon = { performance:"🏆", warning:"⚠️", growth:"📈", opportunity:"💡", timing:"🗓️", frequency:"📅" };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-bold text-gray-900">AI Insights & Recommendations</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {aiPowered ? "Gemini AI analysis based on your actual data" : "Smart rule-based analysis — enhance with Gemini AI"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {aiPowered && <AiBadge powered />}
          <button onClick={handleAIInsights} disabled={loadingAI}
            className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl text-white disabled:opacity-50"
            style={{ background:"#8B5CF6" }}>
            {loadingAI ? <><Spinner sm /> Analyzing…</> : "✨ Generate AI Insights"}
          </button>
          {aiPowered && (
            <button onClick={()=>{setAIInsights([]); setAiPowered(false);}}
              className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1">
              Reset
            </button>
          )}
        </div>
      </div>

      {aiErr && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">{aiErr}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {insights.map((ins, i) => (
          <div key={i} className="bg-white rounded-2xl p-3 sm:p-5 border border-gray-100 shadow-sm"
            style={{ borderLeft: `4px solid ${ins.color || "#0077B5"}` }}>
            <div className="flex items-start gap-3">
              <span className="text-2xl flex-shrink-0">{ins.icon || typeIcon[ins.type] || "💡"}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 mb-1">{ins.title}</p>
                <p className="text-xs text-gray-600 mb-3 leading-relaxed">{ins.text}</p>
                <div className="flex items-start gap-1.5">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{ background:(ins.color||"#0077B5")+"15", color:ins.color||"#0077B5" }}>
                    Action
                  </span>
                  <p className="text-xs text-gray-500">{ins.action}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Content mix recommendation */}
      <Section title="Recommended Content Mix" sub="Based on engagement performance across categories">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {catStats.filter(c=>c.count>0).sort((a,b)=>b.avgEng-a.avgEng).slice(0,4).map((cat, i) => {
            const recommended = [40, 25, 20, 15][i];
            return (
              <div key={cat.name} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm text-center">
                <span className="text-2xl">{cat.icon}</span>
                <p className="text-xs font-semibold text-gray-700 mt-2 mb-1">{cat.name}</p>
                <p className="text-2xl font-bold" style={{ color:cat.color }}>{recommended}%</p>
                <p className="text-xs text-gray-400 mt-1">of monthly posts</p>
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

// ─── Strategy Section ─────────────────────────────────────────────────────────

function StrategySection({ posts, fullSeries }) {
  const dayAn  = useMemo(()=>bestDayAnalysis(posts), [posts]);
  const bestDay = useMemo(()=>[...dayAn].sort((a,b)=>b.avgEng-a.avgEng).find(d=>d.posts>0), [dayAn]);

  const catStats = useMemo(()=>CATS.map(cat=>{
    const cp = posts.filter(p=>autoClassify(p.text_preview)===cat.name);
    const totalEng = cp.reduce((s,p)=>s+(p.reactions||0)+(p.clicks||0)+(p.comments||0)+(p.shares||0),0);
    return { ...cat, count:cp.length, avgEng: cp.length ? Math.round(totalEng/cp.length) : 0 };
  }), [posts]);

  const topCats = useMemo(()=>[...catStats].filter(c=>c.count>0).sort((a,b)=>b.avgEng-a.avgEng).slice(0,4), [catStats]);

  const calendarWeeks = useMemo(()=>{
    if (!bestDay || !topCats.length) return [];
    const days   = WEEK_DAYS.map(d=>d.slice(0,3));
    const posts4 = 4;
    const picks  = [];
    let catIdx   = 0;

    for (let w=0; w<4; w++) {
      const week = days.map((d,di) => {
        const isPost = picks.length < posts4 * (w+1) && (di % 2 === 0 || d === bestDay.day.slice(0,3));
        if (!isPost) return { day:d, empty:true };
        const cat = topCats[catIdx % topCats.length]; catIdx++;
        return { day:d, cat, empty:false };
      });
      picks.push(...week.filter(x=>!x.empty));
      if (w===0) {} // first week built
      // only return first week structure
    }

    // Build 4 weeks of calendar
    const weeks = [];
    let ci = 0;
    for (let w=0; w<4; w++) {
      const week = days.map(d => {
        const isPostDay = d === bestDay.day.slice(0,3) || (w%2===0 && d==="Wed") || (w%2===1 && d==="Thu");
        if (!isPostDay) return { day:d, empty:true };
        const cat = topCats[ci % topCats.length]; ci++;
        return { day:d, cat, empty:false };
      });
      weeks.push(week);
    }
    return weeks;
  }, [bestDay, topCats]);

  const forecastRows = useMemo(()=>{
    // Straight-line fit over the last 90 days of the daily total.
    const vals   = (fullSeries || []).slice(-90).map(d => d.total);
    const latest = lastTotal(fullSeries || []);
    const fc30  = linearForecast(vals, 30);
    const fc60  = linearForecast(vals, 60);
    const fc90  = linearForecast(vals, 90);
    return [
      { period:"30 Days", predicted: fc30.at(-1)?.predicted || latest },
      { period:"60 Days", predicted: fc60.at(-1)?.predicted || latest },
      { period:"90 Days", predicted: fc90.at(-1)?.predicted || latest },
    ];
  }, [fullSeries]);

  return (
    <div className="space-y-6">
      <Section title="Best Day & Time to Post" sub="Based on average engagement by weekday">
        <div className="bg-white rounded-2xl p-3 sm:p-5 border border-gray-100 shadow-sm">
          <DayHeatmap posts={posts} />
        </div>
      </Section>

      {calendarWeeks.length > 0 && (
        <Section title="Suggested Monthly Content Calendar"
          sub={`Based on your ${bestDay?.full || "best"} posting day + top-performing categories`}>
          <div className="bg-white rounded-2xl p-3 sm:p-5 border border-gray-100 shadow-sm space-y-2 overflow-x-auto" style={{ WebkitOverflowScrolling:"touch" }}>
            <div className="grid gap-1 mb-2" style={{ gridTemplateColumns:"repeat(7,minmax(40px,1fr))" }}>
              {WEEK_DAYS.map(d=>(
                <div key={d} className="text-center text-xs font-semibold text-gray-400">{d.slice(0,3)}</div>
              ))}
            </div>
            {calendarWeeks.map((week, wi) => (
              <div key={wi} className="grid gap-1" style={{ gridTemplateColumns:"repeat(7,minmax(40px,1fr))" }}>
                {week.map((day, di) => (
                  <div key={di} className={`rounded-lg p-1.5 sm:p-2 min-h-[50px] sm:min-h-[60px] flex flex-col items-center justify-center text-center border ${
                    day.empty ? "border-gray-100 bg-gray-50" : "border-transparent"}`}
                    style={!day.empty ? { background: day.cat.color+"15", borderColor: day.cat.color+"30" } : {}}>
                    <div className="text-xs text-gray-400 mb-0.5">W{wi+1}</div>
                    {!day.empty && (
                      <>
                        <div className="text-sm sm:text-base">{day.cat.icon}</div>
                        <div className="text-[9px] sm:text-[10px] font-semibold mt-0.5 leading-tight" style={{ color:day.cat.color }}>
                          {day.cat.name.split(" ")[0]}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ))}
            <p className="text-xs text-gray-400 pt-2 border-t border-gray-100">
              Calendar is auto-generated from your best-performing content categories. Adjust based on upcoming events.
            </p>
          </div>
        </Section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Follower Growth Forecast" sub="Linear projection based on historical trend">
          <div className="bg-white rounded-2xl p-3 sm:p-5 border border-gray-100 shadow-sm">
            {forecastRows.some(f=>f.predicted>0) ? (
              <div className="space-y-3">
                {forecastRows.map(f => (
                  <div key={f.period} className="flex items-center justify-between p-3 rounded-xl bg-blue-50">
                    <span className="text-sm font-semibold text-gray-700">In {f.period}</span>
                    <div className="text-right">
                      <div className="text-lg font-bold text-blue-700">{fmt(f.predicted)}</div>
                      <div className="text-xs text-gray-400">followers (projected)</div>
                    </div>
                  </div>
                ))}
                <p className="text-xs text-gray-400">⚠️ Projections assume consistent posting and no major algorithm changes.</p>
              </div>
            ) : <Empty label="Need more follower data for forecast" sub="Sync over multiple days to build a trend." />}
          </div>
        </Section>

        <Section title="Recommended Content Strategy" sub="Action plan for next 30 days">
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm space-y-3">
            {[
              { icon:"📅", title:"Posting Frequency", rec:"3–4 posts per week minimum" },
              { icon:"🗓️", title:"Best Day to Post",  rec:bestDay ? `${bestDay.full} (${fmt(bestDay.avgEng)} avg eng)` : "Wednesday or Thursday" },
              { icon:"🏷️", title:"Priority Category", rec:topCats[0] ? `${topCats[0].icon} ${topCats[0].name}` : "Educational Content" },
              { icon:"🔄", title:"Content Mix",        rec:`${topCats.map(c=>c.icon+" "+c.name.split(" ")[0]).slice(0,3).join(", ")}` },
              { icon:"📈", title:"Growth Tactic",      rec:"Ask employees to share company posts in first hour" },
              { icon:"💬", title:"Engagement Boost",   rec:"End each post with an open question to drive comments" },
            ].map(r => (
              <div key={r.title} className="flex items-start gap-3 p-3 rounded-xl hover:bg-gray-50">
                <span className="text-lg flex-shrink-0">{r.icon}</span>
                <div>
                  <p className="text-xs font-bold text-gray-700">{r.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{r.rec}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

// ─── Connect Screen ───────────────────────────────────────────────────────────

function ConnectScreen() {
  const clientId   = import.meta.env.VITE_LINKEDIN_CLIENT_ID;
  const redirectUri = import.meta.env.VITE_LINKEDIN_REDIRECT_URI || `${window.location.origin}/auth/linkedin/callback`;

  // State is minted on click, not during render, so the value we persist is
  // always the one that actually goes out to LinkedIn.
  const connect = () => {
    const state = newLinkedInOAuthState();
    sessionStorage.setItem(LINKEDIN_OAUTH_STATE_KEY, state);
    window.location.href = buildAuthUrl(clientId, redirectUri, state);
  };

  return (
    <MainLayout>
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="bg-white rounded-3xl shadow-lg p-10 w-full max-w-md text-center">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center" style={{ background:LI_BLUE }}>
            <svg viewBox="0 0 24 24" className="w-9 h-9 fill-white">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">LinkedIn Analytics</h1>
          <p className="text-gray-500 text-sm mb-8">
            Connect your LinkedIn company pages to track follower growth, content performance, and get AI-driven strategy recommendations.
          </p>
          <button onClick={connect}
            className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-white font-semibold text-sm"
            style={{ background:LI_BLUE }}>
            Connect LinkedIn Pages
          </button>
          <p className="text-xs text-gray-400 mt-4">Requires admin access to your LinkedIn company page</p>
        </div>
      </div>
    </MainLayout>
  );
}

// ─── Google-Ads-style metric definitions ─────────────────────────────────────
const GA_METRICS = [
  { id:"new_followers",  label:"New followers",  color:"#1a73e8", field:"new_followers",  fmt:(v)=>fmt(v), unit:""      },
  { id:"total_followers",label:"Total followers", color:"#34a853", field:"total",          fmt:(v)=>fmt(v), unit:""      },
  { id:"impressions",    label:"Impressions",     color:"#fbbc04", field:"impressions",    fmt:(v)=>fmt(v), unit:""      },
  { id:"page_views",     label:"Page views",      color:"#ea4335", field:"page_views",     fmt:(v)=>fmt(v), unit:""      },
  { id:"reactions",      label:"Reactions",       color:"#ec4899", field:"reactions",      fmt:(v)=>fmt(v), unit:""      },
  { id:"comments",       label:"Comments",        color:"#14b8a6", field:"comments",       fmt:(v)=>fmt(v), unit:""      },
  { id:"shares",         label:"Shares",          color:"#6366f1", field:"shares",         fmt:(v)=>fmt(v), unit:""      },
  { id:"clicks",         label:"Clicks",          color:"#ff6d00", field:"clicks",         fmt:(v)=>fmt(v), unit:""      },
  { id:"eng_rate",       label:"Eng. Rate",       color:"#8b5cf6", field:"eng_rate",       fmt:(v)=>fmt(v,{dec:2}), unit:"%" },
  { id:"ctr",            label:"CTR",             color:"#f59e0b", field:"ctr",            fmt:(v)=>fmt(v,{dec:2}), unit:"%" },
];

// Merged daily dataset: follower series + estimated page views + post metrics
function buildUnifiedDaily(series, pageSeries, posts) {
  const pageByDate = new Map((pageSeries || []).map(d => [d.date, d.pageViews]));

  const postsByDate = {};
  (posts || []).forEach(p => {
    const d = p.post_date;
    if (!d) return;
    if (!postsByDate[d]) postsByDate[d] = { reactions:0, comments:0, shares:0, clicks:0, impressions:0, count:0 };
    postsByDate[d].reactions   += p.reactions   || 0;
    postsByDate[d].comments    += p.comments    || 0;
    postsByDate[d].shares      += p.shares      || 0;
    postsByDate[d].clicks      += p.clicks      || 0;
    postsByDate[d].impressions += p.impressions || 0;
    postsByDate[d].count++;
  });

  return (series || []).map(d => {
    const pt  = postsByDate[d.date] || null;
    const imp = pt?.impressions || null;
    const totalEng = pt ? (pt.reactions + pt.comments + pt.shares + pt.clicks) : null;
    return {
      date:          d.date,
      label:         shortDate(d.date),
      new_followers: d.newFollowers,
      total:         d.total,
      impressions:   imp,
      page_views:    pageByDate.get(d.date) ?? null,
      reactions:     pt?.reactions    ?? null,
      comments:      pt?.comments     ?? null,
      shares:        pt?.shares       ?? null,
      clicks:        pt?.clicks       ?? null,
      eng_rate:      (imp && totalEng !== null) ? parseFloat(((totalEng / imp) * 100).toFixed(2)) : null,
      ctr:           (imp && pt?.clicks != null) ? parseFloat(((pt.clicks / imp) * 100).toFixed(2)) : null,
    };
  });
}

// Compute period totals for a metric in unified data
function periodTotal(data, field) {
  return data.reduce((s, d) => s + (d[field] ?? 0), 0);
}

// Google Ads-style metric card + chart component
function MetricSelectorChart({ data, prevData, selectedMetrics, onToggleMetric }) {

  const tickInterval = Math.max(1, Math.floor(data.length / 7));

  // Stat for each metric card
  const stat = id => {
    const m    = GA_METRICS.find(x => x.id === id);
    const field = m?.field || id;
    // Rates and the follower total are levels, not amounts: show the latest
    // value instead of adding the days up.
    const isRate = id === "eng_rate" || id === "ctr" || id === "total_followers";
    const cur  = isRate
      ? (data.filter(d => d[field] != null).at(-1)?.[field] ?? 0)
      : periodTotal(data, field);
    const prev = isRate
      ? (prevData.filter(d => d[field] != null).at(-1)?.[field] ?? 0)
      : periodTotal(prevData, field);
    const pct  = prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;
    return { cur, pct };
  };

  // Format value for card display
  const fmtStat = (id, v) => {
    const m = GA_METRICS.find(x => x.id === id);
    if (!m) return String(v);
    const str = m.fmt ? m.fmt(v) : fmt(v);
    return str + (m.unit || "");
  };

  return (
    <div className="bg-white rounded-lg border overflow-hidden" style={{ borderColor:"#dadce0" }}>
      {/* Metric selector cards */}
      {/* Scrollable metric cards — 2-col on mobile, 6-col on desktop */}
      <div className="overflow-x-auto" style={{ WebkitOverflowScrolling:"touch" }}>
        <div className="flex divide-x" style={{ borderColor:"#dadce0", minWidth:"max-content" }}>
          {GA_METRICS.map(m => {
            const s       = stat(m.id);
            const active  = selectedMetrics.includes(m.id);
            const idx     = selectedMetrics.indexOf(m.id);
            return (
              <button key={m.id} onClick={() => onToggleMetric(m.id)}
                className="text-left px-4 py-3 sm:px-5 sm:py-4 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                style={{
                  borderTop: active ? `3px solid ${m.color}` : "3px solid transparent",
                  minWidth: "130px",
                  minHeight: "44px",
                }}>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: active ? m.color : "#dadce0" }} />
                  {active && idx >= 0 && (
                    <span className="text-xs font-medium px-1.5 py-0.5 rounded hidden sm:inline" style={{ background: m.color+"22", color: m.color }}>
                      {idx === 0 ? "Line 1" : "Line 2"}
                    </span>
                  )}
                </div>
                <p className="text-xs mb-0.5" style={{ color:"#5f6368" }}>{m.label}</p>
                <p className="text-lg sm:text-xl font-medium" style={{ color:"#202124" }}>{fmtStat(m.id, s.cur)}</p>
                {s.pct !== null && (
                  <p className={`text-xs font-medium mt-0.5 flex items-center gap-1 ${s.pct >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {s.pct >= 0 ? "▲" : "▼"} {Math.abs(s.pct)}%
                    <span className="hidden sm:inline" style={{ color:"#5f6368", fontWeight:400 }}>vs prev</span>
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Chart */}
      <div className="border-t px-4 pt-4 pb-2" style={{ borderColor:"#dadce0" }}>
        {selectedMetrics.length === 0 ? (
          <div className="h-40 sm:h-56 flex items-center justify-center text-sm" style={{ color:"#5f6368" }}>
            Select a metric above to display it in the chart
          </div>
        ) : (
          <div className="h-40 sm:h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top:8, right:8, left:0, bottom:0 }}>
                <defs>
                  {selectedMetrics.map(id => {
                    const m = GA_METRICS.find(x => x.id === id);
                    if (!m) return null;
                    return (
                      <linearGradient key={id} id={`grad_${id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={m.color} stopOpacity={0.15} />
                        <stop offset="95%" stopColor={m.color} stopOpacity={0} />
                      </linearGradient>
                    );
                  })}
                </defs>
                <CartesianGrid stroke="#f1f3f4" strokeDasharray="" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize:11, fill:"#5f6368" }} tickLine={false} axisLine={false}
                  interval={tickInterval} />
                <YAxis tick={{ fontSize:11, fill:"#5f6368" }} tickLine={false} axisLine={false} domain={[0, "auto"]}
                  tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} width={40} />
                <Tooltip
                  cursor={{ stroke:"#dadce0", strokeWidth:1 }}
                  contentStyle={{ background:"#fff", border:"1px solid #dadce0", borderRadius:8, fontSize:12, padding:"10px 14px" }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div style={{ background:"#fff", border:"1px solid #dadce0", borderRadius:8, padding:"10px 14px", fontSize:12 }}>
                        <p className="font-medium mb-2" style={{ color:"#202124" }}>{label}</p>
                        {payload.map(p => (
                          <div key={p.dataKey} className="flex items-center gap-2 mb-1">
                            <div className="w-2.5 h-2.5 rounded-sm" style={{ background: p.color }} />
                            <span style={{ color:"#5f6368" }}>{GA_METRICS.find(m=>m.id===p.dataKey)?.label}:</span>
                            <span className="font-semibold" style={{ color:"#202124" }}>{fmtStat(p.dataKey, p.value ?? 0)}</span>
                          </div>
                        ))}
                      </div>
                    );
                  }}
                />
                {selectedMetrics.map(id => {
                  const m = GA_METRICS.find(x => x.id === id);
                  if (!m) return null;
                  return (
                    <Area key={id} type="monotone" dataKey={m.field} name={m.label}
                      stroke={m.color} strokeWidth={2}
                      fill={`url(#grad_${id})`}
                      dot={false} activeDot={{ r:4, fill:m.color, strokeWidth:0 }}
                      connectNulls={false} />
                  );
                })}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="flex items-center gap-1 mt-2 mb-1">
          {selectedMetrics.map(id => {
            const m = GA_METRICS.find(x => x.id === id);
            if (!m) return null;
            return (
              <span key={id} className="flex items-center gap-1.5 text-xs mr-3" style={{ color:"#5f6368" }}>
                <svg width="16" height="10"><line x1="0" y1="5" x2="16" y2="5" stroke={m.color} strokeWidth="2"/></svg>
                {m.label}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function LinkedInDashboard() {
  const {
    status, allOrgs, selectedOrgId, selectOrg,
    followerStats, pageAnalytics, posts, loading,
    dataLoading, syncing, syncResult, sync, refreshOrgs, setOrgHidden, disconnect,
  } = useLinkedInData();

  const [section,       setSection]      = useState("overview");
  const [dateRange,     setDateRange]    = useState(30);
  const [refreshing,    setRefreshing]   = useState(false);
  const [refreshMsg,    setRefreshMsg]   = useState(null);
  const [classifications, setClassifications] = useState({});
  const [classifying,   setClassifying]  = useState(false);
  const [aiClassified,  setAiClassified] = useState(false);
  const [selectedMetrics, setSelectedMetrics] = useState(["new_followers", "impressions"]);
  const [pagesOpen,     setPagesOpen]    = useState(false);
  const [pagesMsg,      setPagesMsg]     = useState(null);

  // All hooks must be above early returns
  const cutoff     = useMemo(() => daysAgoISO(dateRange), [dateRange]);
  const prevCutoff = useMemo(() => daysAgoISO(dateRange * 2), [dateRange]);
  const prevEnd    = useMemo(() => daysAgoISO(dateRange + 1), [dateRange]);

  // Follower and page-view figures are built per page on a full calendar and
  // then added up (see utils/linkedinFollowers), so the "All" view no longer
  // jumps when one page has a row on a day and another does not.
  const fullSeries     = useMemo(() => followerSeries(followerStats), [followerStats]);
  const series         = useMemo(() => followerSeries(followerStats, { from: cutoff }), [followerStats, cutoff]);
  const prevSeries     = useMemo(() => followerSeries(followerStats, { from: prevCutoff, to: prevEnd }), [followerStats, prevCutoff, prevEnd]);
  const pageSeries     = useMemo(() => pageViewSeries(pageAnalytics, { from: cutoff }), [pageAnalytics, cutoff]);
  const prevPageSeries = useMemo(() => pageViewSeries(pageAnalytics, { from: prevCutoff, to: prevEnd }), [pageAnalytics, prevCutoff, prevEnd]);

  const filtPosts    = useMemo(()=>posts.filter(r=>!r.post_date||r.post_date>=cutoff), [posts, cutoff]);
  const prevPosts    = useMemo(()=>posts.filter(r=>r.post_date&&r.post_date>=prevCutoff&&r.post_date<cutoff), [posts, prevCutoff, cutoff]);

  const unified     = useMemo(() => buildUnifiedDaily(series, pageSeries, filtPosts), [series, pageSeries, filtPosts]);
  const prevUnified = useMemo(() => buildUnifiedDaily(prevSeries, prevPageSeries, prevPosts), [prevSeries, prevPageSeries, prevPosts]);

  const growth = useMemo(() => {
    const last  = lastTotal(series);
    const delta = sumNew(series);
    return last ? { first: last - delta, last, delta } : null;
  }, [series]);

  const visibleOrgs = useMemo(() => allOrgs.filter(o => !o.hidden), [allOrgs]);
  const showPage = !selectedOrgId && visibleOrgs.length > 1;

  const handleClassifyAI = useCallback(async () => {
    if (!filtPosts.length) return;
    setClassifying(true);
    try {
      const res = await api.post("/linkedin/ai-classify", {
        posts: filtPosts.map(p=>({ post_id:p.post_id, text_preview:p.text_preview })),
      });
      if (res.data.aiPowered && Object.keys(res.data.classifications).length) {
        setClassifications(prev => ({ ...prev, ...res.data.classifications }));
        setAiClassified(true);
      }
    } catch { /* silent */ }
    finally { setClassifying(false); }
  }, [filtPosts]);

  const handleRefreshOrgs = useCallback(async () => {
    setRefreshing(true); setRefreshMsg(null);
    const r = await refreshOrgs();
    setRefreshing(false);
    setRefreshMsg(r.success ? `Found ${r.count} page${r.count!==1?"s":""}` : (r.error||"Failed"));
    setTimeout(()=>setRefreshMsg(null), 4000);
  }, [refreshOrgs]);

  const handleToggleMetric = useCallback(id => {
    setSelectedMetrics(prev => {
      if (prev.includes(id)) return prev.filter(m => m !== id);
      if (prev.length >= 2)  return [prev[1], id];
      return [...prev, id];
    });
  }, []);

  const handleToggleOrg = useCallback(async (org) => {
    setPagesMsg(null);
    const r = await setOrgHidden(org.id, !org.hidden);
    if (!r.success) setPagesMsg(r.error || "Could not update the page");
  }, [setOrgHidden]);

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[80vh]">
          <div className="text-center space-y-3">
            <Spinner />
            <p className="text-sm text-gray-500">Loading dashboard…</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!status?.connected) return <ConnectScreen />;

  const GA_BLUE = "#1a73e8";

  return (
    <MainLayout>
      <div className="min-h-screen" style={{ background:"#f8f9fa" }}>

        {/* ══ Top header bar ═══════════════════════════════════════════════ */}
        <div className="sticky top-0 z-30 bg-white" style={{ borderBottom:"1px solid #dadce0" }}>

          {/* Row 1: branding + controls */}
          <div className="flex items-center justify-between px-3 sm:px-6 py-2.5 sm:py-3 gap-2 sm:gap-4">
            {/* Left: icon + title + page pills */}
            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded flex items-center justify-center"
                  style={{ background: LI_BLUE }}>
                  <svg viewBox="0 0 24 24" fill="white" className="w-3.5 h-3.5 sm:w-4 sm:h-4">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                  </svg>
                </div>
                <span className="text-sm sm:text-base font-medium truncate" style={{ color:"#202124" }}>
                  <span className="hidden sm:inline">LinkedIn Analytics</span>
                  <span className="sm:hidden">Analytics</span>
                </span>
              </div>

              {/* Page selector pills — scrollable on mobile */}
              <div className="flex items-center gap-1 overflow-x-auto flex-shrink min-w-0" style={{ WebkitOverflowScrolling:"touch", scrollbarWidth:"none" }}>
                {[{ id: null, name: "All" }, ...visibleOrgs.map(o => ({ id: o.id, name: o.name || o.id }))].map(o => (
                  <button key={o.id ?? "all"} onClick={() => selectOrg(o.id)}
                    className="px-2.5 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0 min-h-[32px]"
                    style={(!o.id && !selectedOrgId) || selectedOrgId === o.id
                      ? { background:"#e8f0fe", color: GA_BLUE }
                      : { color:"#5f6368", background:"transparent" }}>
                    {o.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Right: date range + sync (compact on mobile) */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
              {/* Date range toggle */}
              <div className="flex items-center rounded-md overflow-hidden" style={{ border:"1px solid #dadce0" }}>
                {[{d:7,l:"7D",lf:"7 days"},{d:30,l:"30D",lf:"30 days"},{d:90,l:"90D",lf:"90 days"},{d:180,l:"6M",lf:"180 days"}].map(({d,l,lf},i)=>(
                  <button key={d} onClick={()=>setDateRange(d)}
                    className="px-2 sm:px-3 py-1.5 text-xs font-medium transition-colors min-h-[32px]"
                    style={{
                      borderLeft: i > 0 ? "1px solid #dadce0" : "none",
                      background: dateRange===d ? GA_BLUE : "transparent",
                      color:      dateRange===d ? "#fff"   : "#5f6368",
                    }}>
                    <span className="sm:hidden">{l}</span>
                    <span className="hidden sm:inline">{lf}</span>
                  </button>
                ))}
              </div>

              {/* Sync */}
              <button onClick={sync} disabled={syncing}
                className="flex items-center gap-1 px-2.5 sm:px-4 py-1.5 rounded-full text-xs font-semibold text-white disabled:opacity-50 min-h-[32px]"
                style={{ background: GA_BLUE }}>
                {syncing ? <Spinner sm /> : "↻"}
                <span className="hidden sm:inline">{syncing ? "Syncing…" : " Sync"}</span>
              </button>

              {/* Refresh — desktop only */}
              <button onClick={handleRefreshOrgs} disabled={refreshing}
                className="hidden sm:flex px-3 py-1.5 rounded-full text-xs font-medium transition-colors min-h-[32px]"
                style={{ border:"1px solid #dadce0", color:"#5f6368" }}>
                {refreshing ? "…" : "⟳ Refresh"}
              </button>

              {refreshMsg && <span className="text-xs font-medium text-green-600 hidden sm:inline">{refreshMsg}</span>}
              {syncResult?.summary && <span className="text-xs font-medium hidden sm:inline" style={{ color:"#34a853" }}>✓</span>}
              {dataLoading && <span className="text-xs hidden sm:inline" style={{ color:"#5f6368" }}>…</span>}

              {/* Pages: choose which of the account's pages count */}
              <div className="relative hidden sm:block">
                <button onClick={() => setPagesOpen(o => !o)}
                  className="text-xs px-2 py-1 rounded transition-colors min-h-[32px]"
                  style={{ color:"#5f6368" }}
                  title="Choose which LinkedIn pages are synced and counted">
                  ☰ Pages{allOrgs.length > visibleOrgs.length ? ` (${allOrgs.length - visibleOrgs.length} hidden)` : ""}
                </button>
                {pagesOpen && (
                  <div className="absolute right-0 mt-1 w-72 bg-white rounded-lg shadow-lg z-40 p-3 text-xs" style={{ border:"1px solid #dadce0" }}>
                    <p className="font-semibold mb-1" style={{ color:"#202124" }}>Pages on this LinkedIn account</p>
                    <p className="mb-2" style={{ color:"#5f6368" }}>Unticked pages are not synced and are left out of the &quot;All&quot; figures.</p>
                    {allOrgs.map(o => (
                      <label key={o.id} className="flex items-center gap-2 py-1 cursor-pointer">
                        <input type="checkbox" checked={!o.hidden} onChange={() => handleToggleOrg(o)} />
                        <span style={{ color:"#202124" }}>{o.name || o.id}</span>
                        <span className="ml-auto" style={{ color:"#9aa0a6" }}>{String(o.role || "").toLowerCase().replace(/_/g, " ")}</span>
                      </label>
                    ))}
                    {pagesMsg && <p className="mt-2 text-red-600">{pagesMsg}</p>}
                    <p className="mt-2 pt-2 border-t border-gray-100" style={{ color:"#5f6368" }}>
                      A page that is missing here is one this LinkedIn login does not administer. Reconnect with a login that does, then press Refresh.
                    </p>
                  </div>
                )}
              </div>

              <button onClick={disconnect}
                className="hidden sm:flex text-xs px-2 py-1 rounded transition-colors min-h-[32px]"
                style={{ color:"#5f6368" }}
                onMouseEnter={e=>{ e.currentTarget.style.color="#ea4335"; }}
                onMouseLeave={e=>{ e.currentTarget.style.color="#5f6368"; }}>
                Disconnect
              </button>
            </div>
          </div>

          {/* Row 2: Tab navigation — scrollable */}
          <div className="flex px-2 sm:px-6 overflow-x-auto" style={{ scrollbarWidth:"none", WebkitOverflowScrolling:"touch" }}>
            {SECTIONS.map(s => (
              <button key={s.id} onClick={()=>setSection(s.id)}
                className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0 min-h-[44px]"
                style={{
                  borderBottom: section===s.id ? `3px solid ${GA_BLUE}` : "3px solid transparent",
                  color:        section===s.id ? GA_BLUE : "#5f6368",
                }}>
                <span className="text-sm">{s.icon}</span>
                <span className="hidden xs:inline sm:inline">{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ══ Main content ═════════════════════════════════════════════════ */}
        <div className="px-3 sm:px-6 py-4 sm:py-6 max-w-screen-2xl">

          {/* Metric selector + unified chart — shown on overview & followers */}
          {(section === "overview" || section === "followers") && (
            <div className="mb-6">
              <MetricSelectorChart
                data={unified}
                prevData={prevUnified}
                selectedMetrics={selectedMetrics}
                onToggleMetric={handleToggleMetric}
              />
            </div>
          )}

          {/* Section-specific content */}
          <div className="space-y-6">
            {section === "overview" && (
              <OverviewSection
                posts={filtPosts}
                series={series}
                prevSeries={prevSeries}
                pageSeries={pageSeries}
                prevPosts={prevPosts}
                dateRange={dateRange}
              />
            )}
            {section === "followers" && (
              <FollowerSection fullSeries={fullSeries} series={series} prevSeries={prevSeries} allOrgs={visibleOrgs} />
            )}
            {section === "content" && (
              <ContentSection posts={filtPosts} showPage={showPage} />
            )}
            {section === "categories" && (
              <CategorySection
                posts={filtPosts}
                classifications={classifications}
                onClassifyAI={handleClassifyAI}
                classifying={classifying}
                aiClassified={aiClassified}
              />
            )}
            {section === "insights" && (
              <InsightsSection
                posts={filtPosts}
                growth={growth}
                orgId={selectedOrgId}
                dateRange={dateRange}
              />
            )}
            {section === "strategy" && (
              <StrategySection posts={filtPosts} fullSeries={fullSeries} />
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
