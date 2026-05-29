export const calculatePerformanceScore = (
  campaign
) => {

  const ctr =
    Number(campaign.ctr || 0);

  const conversionRate =
    Number(campaign.conversion_rate || 0);

  const cpa =
    Number(campaign.cpa || 0);

  let score = 0;

  score += Math.min(ctr * 4, 30);

  score += Math.min(conversionRate * 5, 40);

  score += Math.max(
    0,
    30 - cpa / 50
  );

  return Math.round(
    Math.max(
      0,
      Math.min(score, 100)
    )
  );

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

  // New formula: (ctr * 3 + conversion_rate * 5 + conversions) - avg_cpc
  const score =
    (ctr * 3 + conversionRate * 5 + conversions) - avgCpc;

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