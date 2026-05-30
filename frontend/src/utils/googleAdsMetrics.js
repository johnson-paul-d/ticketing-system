// src/utils/googleAdsMetrics.js

export const normalizeCampaign = (raw) => {

  const cost =
    Number(raw.cost) || 0;

  const clicks =
    Number(raw.clicks) || 0;

  const impressions =
    Number(raw.impressions) || 0;

  const conversions =
    Number(raw.conversions) || 0;

  const ctr =
    impressions > 0
      ? (clicks / impressions) * 100
      : 0;

  const conversion_rate =
    clicks > 0
      ? (conversions / clicks) * 100
      : 0;

  const avg_cpc =
    clicks > 0
      ? cost / clicks
      : 0;

  const cpa =
    conversions > 0
      ? cost / conversions
      : 0;

  const efficiency =
    (ctr * conversion_rate) /
    Math.max(avg_cpc, 1);

  return {
    campaign:
      raw.campaign ||
      raw.campaign_name ||
      raw.campaignName ||
      "Unknown",

    cost,
    clicks,
    impressions,
    conversions,

    ctr,
    conversion_rate,
    avg_cpc,
    cpa,
    efficiency,
  };
};

export const USD_TO_INR = 1;

export const fmt = {
  currency: (v) => {
    const inr = v * USD_TO_INR;

    if (inr >= 10000000)
      return `₹${(inr / 10000000).toFixed(2)}Cr`;

    if (inr >= 100000)
      return `₹${(inr / 100000).toFixed(2)}L`;

    if (inr >= 1000)
      return `₹${(inr / 1000).toFixed(1)}K`;

    return `₹${inr.toFixed(2)}`;
  },

  pct: (v) => `${Number(v).toFixed(2)}%`,

  num: (v) =>
    v >= 1000000
      ? `${(v / 1000000).toFixed(1)}M`
      : v >= 1000
      ? `${(v / 1000).toFixed(1)}K`
      : Number(v).toLocaleString(),
};

export const computeExecutiveScore = (
  ctr,
  cvr,
  cpa,
  wasteSpend,
  totalSpend
) => {

  const ctrScore =
    Math.min(
      100,
      (ctr / 5) * 100
    );

  const cvrScore =
    Math.min(
      100,
      (cvr / 10) * 100
    );

  const cpaScore =
    Math.max(
      0,
      100 - (cpa / 1000) * 10
    );

  const wasteScore =
    totalSpend > 0
      ? Math.max(
          0,
          100 -
            (wasteSpend / totalSpend) *
              100
        )
      : 100;

  return Math.round(
    ctrScore * 0.25 +
    cvrScore * 0.35 +
    cpaScore * 0.25 +
    wasteScore * 0.15
  );
};