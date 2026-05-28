const express = require("express");
const router = express.Router();

const supabase = require("../config/supabase");
const auth = require("../middleware/auth");

// =====================================================
// GOOGLE ADS OVERVIEW
// =====================================================

router.get("/overview", auth, async (req, res) => {
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
// TRENDS API
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
          date,
          spend: 0,
          conversions: 0,
          clicks: 0,
        };
      }

      grouped[date].spend += Number(row.cost || 0);
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
// CAMPAIGNS API
// =====================================================

router.get("/campaigns", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("google_ads_campaign_analysis")
      .select("*");

    if (error) {
      throw error;
    }

    const grouped = {};

    data.forEach((row) => {
      const campaign = row.campaign;

      if (!grouped[campaign]) {
        grouped[campaign] = {
          campaign,
          cost: 0,
          clicks: 0,
          conversions: 0,
          avg_cpc: 0,
          rows: 0,
        };
      }

      grouped[campaign].cost += Number(row.cost || 0);
      grouped[campaign].clicks += Number(row.clicks || 0);
      grouped[campaign].conversions += Number(row.conversions || 0);
      grouped[campaign].avg_cpc += Number(row.avg_cpc || 0);
      grouped[campaign].rows += 1;
    });

    const result = Object.values(grouped)
      .map((item) => ({
        ...item,
        avg_cpc: item.avg_cpc / item.rows,
      }))
      .sort((a, b) => b.cost - a.cost);

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Server Error",
    });
  }
});

// =====================================================
// KEYWORDS API
// =====================================================a

router.get("/keywords", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("google_ads_keyword_analysis")
      .select("*");

    if (error) {
      throw error;
    }

    const keywords = data.map((row) => ({
      keyword: row.keyword,
      avg_cpc: Number(row.avg_cpc || 0),
      conversion_rate:
        Number(row.conversions || 0) > 0 && Number(row.clicks || 0) > 0
          ? (Number(row.conversions) / Number(row.clicks)) * 100
          : 0,
      cost: Number(row.cost || 0),
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