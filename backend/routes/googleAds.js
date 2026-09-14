const express = require("express");
const router = express.Router();

const supabase = require("../config/supabase");
const auth = require("../middleware/auth");
const requireAccess = require("../middleware/requireAccess");
const { canAccessGoogleAds } = require("../utils/roles");

// Every endpoint below reads campaign and spend data. `auth` was imported but
// never applied, leaving all of it public.
router.use(auth, requireAccess(canAccessGoogleAds));

// =====================================================
// GOOGLE ADS OVERVIEW
// =====================================================

router.get("/overview", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("google_ads_campaign_analysis")
      .select("*");

    if (error) {
      return res.status(500).json({
        message: "Failed to fetch analytics",
        error,
      });
    }

    const totalSpend = data.reduce(
      (sum, row) => sum + Number(row.cost || 0),
      0
    );

    const totalClicks = data.reduce(
      (sum, row) => sum + Number(row.clicks || 0),
      0
    );

    const totalImpressions = data.reduce(
      (sum, row) => sum + Number(row.impressions || 0),
      0
    );

    const totalConversions = data.reduce(
      (sum, row) => sum + Number(row.conversions || 0),
      0
    );

    const avgCpc =
      totalClicks > 0
        ? totalSpend / totalClicks
        : 0;

    const ctr =
      totalImpressions > 0
        ? (totalClicks / totalImpressions) * 100
        : 0;

    const conversionRate =
      totalClicks > 0
        ? (totalConversions / totalClicks) * 100
        : 0;

    const costPerConversion =
      totalConversions > 0
        ? totalSpend / totalConversions
        : 0;

    res.json({
      totalSpend,
      totalClicks,
      totalImpressions,
      totalConversions,
      avgCpc,
      ctr,
      conversionRate,
      costPerConversion,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Server error",
    });
  }
});

// =====================================================
// TRENDS API - returns campaign and report_date grouped
// =====================================================

router.get("/trends", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("google_ads_campaign_analysis")
      .select("*")
      .order("report_date", { ascending: false })
      .range(0, 50000);

    console.log("Trend rows returned:", data?.length);

    if (error) {
      throw error;
    }

    const grouped = {};

    data.forEach((row) => {

      const key =
        `${row.campaign}_${row.report_date}_${row.account_id || ""}`;

      if (!grouped[key]) {

        grouped[key] = {
          campaign: row.campaign,
          report_date: row.report_date,
          account_id: row.account_id || null,
          account_name: row.account_name || null,
          status: row.status || null,
          cost: 0,
          conversions: 0,
          clicks: 0,
          impressions: 0,
        };
      }

      grouped[key].cost += Number(row.cost || 0);
      grouped[key].clicks += Number(row.clicks || 0);
      grouped[key].impressions += Number(row.impressions || 0);
      grouped[key].conversions += Number(row.conversions || 0);
    });

    res.json(Object.values(grouped));
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Server Error",
    });
  }
});

// =====================================================
// CAMPAIGNS API - groups by report_date + campaign
// =====================================================

router.get("/campaigns", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("google_ads_campaign_analysis")
      .select("*")
      .order("report_date", { ascending: false })
      .range(0, 50000);

    console.log("Campaign rows returned:", data?.length);

    if (error) {
      return res.status(500).json({
        message: "Failed to fetch campaigns",
        error,
      });
    }

    // Group by report_date + campaign + account_id
    const grouped = {};

    data.forEach((row) => {
      const key = `${row.report_date}_${row.campaign}_${row.account_id || ""}`;

      if (!grouped[key]) {
        grouped[key] = {
          report_date: row.report_date,
          campaign: row.campaign,
          account_id: row.account_id || null,
          account_name: row.account_name || null,
          status: row.status || null,
          cost: 0,
          conversions: 0,
          clicks: 0,
          impressions: 0,
        };
      }

      grouped[key].cost += Number(row.cost || 0);
      grouped[key].clicks += Number(row.clicks || 0);
      grouped[key].impressions += Number(row.impressions || 0);
      grouped[key].conversions += Number(row.conversions || 0);
    });

    res.json(Object.values(grouped));
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Server error",
    });
  }
});

// =====================================================
// KEYWORDS API - adds computed conversion_rate
// =====================================================

router.get("/keywords", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("google_ads_keyword_analysis")
      .select("*")
      .order("report_date", { ascending: false })
      .range(0, 50000);

    if (error) {
      throw error;
    }

    const clicks = (row) => Number(row.clicks || 0);
    const keywords = data.map((row) => ({
      account_id: row.account_id || null,
      account_name: row.account_name || null,
      campaign: row.campaign,
      campaign_budget: Number(row.campaign_budget || 0),
      ad_group: row.ad_group || null,
      keyword: row.keyword,
      match_type: row.match_type || "UNKNOWN",
      report_date: row.report_date || null,
      clicks: Number(row.clicks || 0),
      impressions: Number(row.impressions || 0),
      ctr: Number(row.ctr || 0),
      avg_cpc: Number(row.avg_cpc || 0),
      cost: Number(row.cost || 0),
      conversions: Number(row.conversions || 0),
      cost_per_conversion: Number(row.cost_per_conversion || 0),
      conversion_rate:
        clicks(row) > 0
          ? (Number(row.conversions || 0) / clicks(row)) * 100
          : 0,
    }));

    res.json(keywords);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Server Error",
    });
  }
});

// =====================================================
// IMPORT (Google Sheets → database)
// =====================================================
// The Google Ads figures arrive from a Google Sheet through an Apps Script
// (scripts/google-apps-script/google-ads-sync.gs). It used to write straight
// to Supabase's REST endpoint; the self-hosted database is not reachable from
// Google's servers, and should not be, so the script posts here instead and
// this route does the same upsert on its behalf.
//
// Authentication is the portal's own: an API key acting as an admin, minted
// with read-only unticked. `auth` has already refused read-only keys for POST
// and requireAccess has already applied the Google Ads gate, so by here the
// caller is someone who could see this data in the portal anyway.
//
// Each table has a unique constraint matching its natural key, so an upsert
// updates the row for that campaign/keyword and date rather than adding a
// second one — which is what makes re-running the sheet sync safe, and what
// lets Google's retroactive conversion attribution overwrite earlier figures.

const IMPORTS = {
  "campaign-analysis": {
    table: "google_ads_campaign_analysis",
    onConflict: "account_id,campaign,report_date",
    text: ["account_id", "account_name", "campaign", "status", "channel_type", "report_date"],
    numeric: ["clicks", "impressions", "ctr", "avg_cpc", "cost", "conversions", "cost_per_conversion", "conversion_rate"],
    required: ["account_id", "campaign", "report_date"],
  },
  "keyword-analysis": {
    table: "google_ads_keyword_analysis",
    onConflict: "account_id,campaign,ad_group,keyword,report_date",
    text: ["account_id", "account_name", "campaign", "ad_group", "keyword", "match_type", "report_date"],
    numeric: ["campaign_budget", "clicks", "impressions", "ctr", "avg_cpc", "cost", "conversions", "cost_per_conversion"],
    required: ["account_id", "campaign", "ad_group", "keyword", "report_date"],
  },
};

const isIsoDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));

// Keeps only the columns the table has, as the types it expects. Anything
// else in the payload is dropped rather than reaching the database.
const shapeRow = (spec, raw) => {
  const row = {};
  for (const k of spec.text) row[k] = raw[k] == null ? "" : String(raw[k]).trim();
  for (const k of spec.numeric) {
    const n = Number(raw[k]);
    row[k] = Number.isFinite(n) ? n : 0;
  }
  return row;
};

const MAX_ROWS = 5000;
const CHUNK = 500;

router.post("/import/:kind", async (req, res) => {
  const spec = IMPORTS[req.params.kind];
  if (!spec) {
    return res.status(404).json({ message: `Unknown import "${req.params.kind}"` });
  }

  const rows = Array.isArray(req.body) ? req.body : req.body?.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ message: "Send a JSON array of rows (or { rows: [...] })" });
  }
  if (rows.length > MAX_ROWS) {
    return res.status(413).json({ message: `Send at most ${MAX_ROWS} rows per request` });
  }

  const shaped = [];
  const rejected = [];
  // The sheet can hold the same key twice (a repeated export); only the last
  // occurrence is kept, since a single upsert statement cannot touch one row
  // twice ("ON CONFLICT DO UPDATE command cannot affect row a second time").
  const byKey = new Map();
  rows.forEach((raw, i) => {
    const row = shapeRow(spec, raw || {});
    const missing = spec.required.filter((k) => !row[k]);
    if (missing.length || !isIsoDate(row.report_date)) {
      rejected.push({ index: i, reason: missing.length ? `missing ${missing.join(", ")}` : "report_date must be YYYY-MM-DD" });
      return;
    }
    byKey.set(spec.onConflict.split(",").map((k) => row[k]).join("|"), row);
  });
  shaped.push(...byKey.values());

  let upserted = 0;
  try {
    for (let i = 0; i < shaped.length; i += CHUNK) {
      const chunk = shaped.slice(i, i + CHUNK);
      const { error } = await supabase
        .from(spec.table)
        .upsert(chunk, { onConflict: spec.onConflict, ignoreDuplicates: false });
      if (error) throw error;
      upserted += chunk.length;
    }
  } catch (err) {
    console.error(`GOOGLE ADS IMPORT (${spec.table}) ERROR after ${upserted} rows:`, err);
    return res.status(500).json({
      message: `Import failed after ${upserted} rows: ${err.message || err.code || "database error"}`,
      upserted,
      rejected,
    });
  }

  res.json({
    table: spec.table,
    received: rows.length,
    upserted,
    deduplicated: rows.length - rejected.length - shaped.length,
    rejected,
  });
});

module.exports = router;