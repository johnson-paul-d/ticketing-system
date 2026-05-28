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

module.exports = router;