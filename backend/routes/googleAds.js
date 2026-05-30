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
      .order("report_date", { ascending: true })
      .range(0, 50000);

    console.log("Trend rows returned:", data?.length);

    if (error) {
      throw error;
    }

    const grouped = {};

    data.forEach((row) => {

      const key =
        `${row.campaign}_${row.report_date}`;

      if (!grouped[key]) {

        grouped[key] = {
          campaign: row.campaign,
          report_date: row.report_date,
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
      .order("report_date", { ascending: true })
      .range(0, 5000);

    console.log("Campaign rows returned:", data?.length);

    if (error) {
      return res.status(500).json({
        message: "Failed to fetch campaigns",
        error,
      });
    }

    // Group by report_date + campaign
    const grouped = {};

    data.forEach((row) => {
      const key = `${row.report_date}_${row.campaign}`;

      if (!grouped[key]) {
        grouped[key] = {
          report_date: row.report_date,
          campaign: row.campaign,
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
      .select("*");

    if (error) {
      throw error;
    }

    const keywords = data.map((row) => ({
      campaign: row.campaign,
      keyword: row.keyword,
      match_type: row.match_type || "UNKNOWN",
      clicks: Number(row.clicks || 0),
      impressions: Number(row.impressions || 0),
      conversions: Number(row.conversions || 0),
      cost: Number(row.cost || 0),
      avg_cpc: Number(row.avg_cpc || 0),
      conversion_rate:
        Number(row.clicks || 0) > 0
          ? (Number(row.conversions || 0) / Number(row.clicks || 0)) * 100
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