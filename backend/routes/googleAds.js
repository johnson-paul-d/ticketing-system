const express = require("express");
const router = express.Router();

const supabase = require("../config/supabase");
const auth = require("../middleware/auth");

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

module.exports = router;