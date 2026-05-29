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
// TRENDS API - FIXED: returns report_date and cost
// =====================================================

router.get("/trends", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("google_ads_campaign_analysis")
      .select("*")
      .order("report_date", {
        ascending: true,
      });

    if (error) {
      throw error;
    }

    const grouped = {};

    data.forEach((row) => {
      const date = row.report_date;

      if (!grouped[date]) {
        grouped[date] = {
          report_date: date,      // changed from 'date'
          cost: 0,                // changed from 'spend'
          conversions: 0,
          clicks: 0,
        };
      }

      grouped[date].cost += Number(row.cost || 0);           // changed from spend
      grouped[date].conversions += Number(row.conversions || 0);
      grouped[date].clicks += Number(row.clicks || 0);
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
// CAMPAIGNS API - MODIFIED: returns raw rows ordered by report_date
// =====================================================

router.get("/campaigns", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("google_ads_campaign_analysis")
      .select("*")
      .order("report_date", { ascending: true });

    if (error) {
      return res.status(500).json({
        message: "Failed to fetch campaigns",
        error,
      });
    }

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Server error",
    });
  }
});

// =====================================================
// KEYWORDS API - FIXED: adds missing fields (match_type, clicks, impressions, conversions)
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
      match_type: row.match_type || "UNKNOWN",           // added match_type
      clicks: Number(row.clicks || 0),                   // added clicks
      impressions: Number(row.impressions || 0),         // added impressions
      conversions: Number(row.conversions || 0),         // added conversions
      cost: Number(row.cost || 0),                       // added cost
      avg_cpc: Number(row.avg_cpc || 0),                 // added avg_cpc
      conversion_rate:                                   // added conversion_rate
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