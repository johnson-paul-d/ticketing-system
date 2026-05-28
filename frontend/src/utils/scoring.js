export const calculatePerformanceScore = (
  campaign
) => {

  const ctr =
    Number(campaign.ctr || 0) * 100;

  const conversionRate =
    Number(
      campaign.conversion_rate || 0
    );

  const conversions =
    Number(campaign.conversions || 0);

  const avgCpc =
    Number(campaign.avg_cpc || 0);

  let score =
    ctr * 0.25 +
    conversionRate * 0.35 +
    conversions * 0.25 -
    avgCpc * 0.15;

  score = Math.max(
    0,
    Math.min(100, score)
  );

  return Math.round(score);
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

  return Math.round(
    (ctr * conversions) /
      Math.max(avgCpc, 1)
  );
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