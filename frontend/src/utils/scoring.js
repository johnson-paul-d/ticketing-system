export const calculatePerformanceScore = (
  campaign
) => {

  const ctr = parseFloat(
    String(campaign.ctr || 0)
      .replace("%", "")
  ) || 0;

  const conversionRate = parseFloat(
    String(
      campaign.conversion_rate || 0
    ).replace("%", "")
  ) || 0;

  const cpa = Math.max(
    parseFloat(campaign.cpa || 0) || 0,
    0
  );

  let score = 0;

  score += Math.min(ctr * 4, 30);
  score += Math.min(conversionRate * 5, 40);
  score += Math.max(0, 30 - (cpa / 50));

  const finalScore = Math.max(
    0,
    Math.min(score, 100)
  );

  return Number.isFinite(finalScore)
    ? Math.round(finalScore)
    : 0;
};

export const calculateOpportunityScore = (
  campaign
) => {

  const ctr =
    Number(campaign.ctr || 0);

  const conversions =
    Number(campaign.conversions || 0);

  const avgCpc =
    Number(campaign.avg_cpc || 1);

  const conversionRate =
    Number(campaign.conversion_rate || 0);

  const score =
    (ctr * 3) +
    (conversionRate * 5) +
    conversions -
    avgCpc;

  return Math.round(score);
};

export const calculateMomentumScore = (
  current,
  previous
) => {

  if (!previous) return 0;

  return (
    ((current - previous) / previous) *
    100
  );
};