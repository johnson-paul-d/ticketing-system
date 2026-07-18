import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Target, Loader2, AlertTriangle, Globe2, Building2, Users,
  Mail, MessageCircle, Phone, CalendarCheck, Reply, ThumbsUp,
} from "lucide-react";

function LinkedinIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  );
}
import MainLayout from "../layouts/MainLayout";
import api from "../services/api";

const KPI_DEFS = [
  { key: "countries", label: "Countries", icon: Globe2 },
  { key: "companies", label: "Companies", icon: Building2 },
  { key: "contacts", label: "Contacts", icon: Users },
  { key: "emails_sent", label: "Emails Sent", icon: Mail },
  { key: "linkedin_touches", label: "LinkedIn Touches", icon: LinkedinIcon },
  { key: "whatsapp_sent", label: "WhatsApp", icon: MessageCircle },
  { key: "calls", label: "Calls", icon: Phone },
  { key: "meetings", label: "Meetings", icon: CalendarCheck },
  { key: "responses", label: "Responses", icon: Reply },
  { key: "positive_responses", label: "Positive", icon: ThumbsUp },
];

export default function AbmDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [setupNeeded, setSetupNeeded] = useState(false);

  useEffect(() => {
    api
      .get("/abm/dashboard")
      .then((r) => setData(r.data))
      .catch((err) => {
        if (err.response?.data?.code === "ABM_MIGRATION_REQUIRED") setSetupNeeded(true);
        else console.error(err);
      })
      .finally(() => setLoading(false));
  }, []);

  const kpis = data?.kpis || {};
  const funnelMax = Math.max(...(data?.funnel || []).map((f) => f.value), 1);

  return (
    <MainLayout>
      <div className="flex items-center justify-between gap-3 mb-8 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-3">
            <Target className="text-[#9b2423]" size={28} /> ABM Dashboard
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Account-based marketing performance at a glance
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/abm/today"
            className="inline-flex items-center gap-2 bg-[#9b2423] hover:bg-[#7d1d1c] text-white font-semibold text-sm px-4 py-2.5 rounded-xl shadow-sm transition"
          >
            Today's Queue
          </Link>
          <Link
            to="/abm/accounts"
            className="inline-flex items-center gap-2 border border-gray-200 hover:border-[#9b2423]/40 text-gray-700 font-semibold text-sm px-4 py-2.5 rounded-xl transition bg-white"
          >
            Accounts
          </Link>
        </div>
      </div>

      {setupNeeded && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex items-start gap-3 text-amber-800">
          <AlertTriangle size={20} className="mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold">ABM CRM is not set up in the database yet</p>
            <p className="text-sm mt-1">
              Run <code className="bg-amber-100 px-1.5 py-0.5 rounded">backend/database/abm-migration.sql</code>{" "}
              in the Supabase SQL Editor, then reload this page.
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24 text-gray-400 gap-2">
          <Loader2 size={20} className="animate-spin" /> Loading dashboard…
        </div>
      ) : (
        data && (
          <>
            {/* KPI grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mb-6">
              {KPI_DEFS.map(({ key, label, icon: Icon }) => (
                <div key={key} className="bg-white rounded-2xl shadow-sm p-4">
                  <div className="flex items-center gap-2 text-gray-400 text-xs font-medium mb-1">
                    <Icon size={14} /> {label}
                  </div>
                  <div className="text-2xl font-bold">{kpis[key] ?? 0}</div>
                </div>
              ))}
            </div>

            {/* Rates */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6 max-w-xl">
              <div className="bg-white rounded-2xl shadow-sm p-4">
                <div className="text-xs font-medium text-gray-400 mb-1">Reply Rate</div>
                <div className="text-2xl font-bold text-[#9b2423]">{kpis.reply_rate ?? 0}%</div>
                <p className="text-[11px] text-gray-400 mt-1">contacts who replied ÷ contacted</p>
              </div>
              <div className="bg-white rounded-2xl shadow-sm p-4">
                <div className="text-xs font-medium text-gray-400 mb-1">Meeting Rate</div>
                <div className="text-2xl font-bold text-[#9b2423]">{kpis.meeting_rate ?? 0}%</div>
                <p className="text-[11px] text-gray-400 mt-1">contacts reaching a meeting ÷ contacted</p>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-6">
              {/* Funnel */}
              <div className="bg-white rounded-2xl shadow-sm p-5">
                <h2 className="font-bold text-base mb-4">Funnel</h2>
                <div className="space-y-2.5">
                  {data.funnel.map((f) => (
                    <div key={f.stage}>
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>{f.stage}</span>
                        <span className="font-semibold text-gray-700">{f.value}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#9b2423] transition-all duration-500"
                          style={{ width: `${Math.max((f.value / funnelMax) * 100, f.value ? 2 : 0)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Channel performance */}
              <div className="bg-white rounded-2xl shadow-sm p-5">
                <h2 className="font-bold text-base mb-4">Channel Performance</h2>
                {data.channels.length === 0 ? (
                  <p className="text-sm text-gray-400">No activities logged yet</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-400 border-b">
                        <th className="pb-2 font-medium">Channel</th>
                        <th className="pb-2 font-medium text-right">Touches</th>
                        <th className="pb-2 font-medium text-right">Responses</th>
                        <th className="pb-2 font-medium text-right">Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.channels.map((c) => (
                        <tr key={c.channel} className="border-b last:border-0">
                          <td className="py-2 font-medium">{c.channel}</td>
                          <td className="py-2 text-right">{c.touches}</td>
                          <td className="py-2 text-right">{c.responses}</td>
                          <td className="py-2 text-right font-semibold text-[#9b2423]">{c.rate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Country breakdown */}
            <div className="bg-white rounded-2xl shadow-sm p-5 overflow-x-auto">
              <h2 className="font-bold text-base mb-4">Country Performance</h2>
              {data.countries.length === 0 ? (
                <p className="text-sm text-gray-400">No accounts yet — add companies to get started</p>
              ) : (
                <table className="w-full text-sm min-w-[560px]">
                  <thead>
                    <tr className="text-left text-xs text-gray-400 border-b">
                      <th className="pb-2 font-medium">Country</th>
                      <th className="pb-2 font-medium text-right">Companies</th>
                      <th className="pb-2 font-medium text-right">Contacts</th>
                      <th className="pb-2 font-medium text-right">Replies</th>
                      <th className="pb-2 font-medium text-right">Meetings</th>
                      <th className="pb-2 font-medium text-right">Won</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.countries.map((c) => (
                      <tr key={c.country} className="border-b last:border-0">
                        <td className="py-2 font-medium">{c.country}</td>
                        <td className="py-2 text-right">{c.companies}</td>
                        <td className="py-2 text-right">{c.contacts}</td>
                        <td className="py-2 text-right">{c.replies}</td>
                        <td className="py-2 text-right">{c.meetings}</td>
                        <td className="py-2 text-right font-semibold text-emerald-600">{c.won}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )
      )}
    </MainLayout>
  );
}
