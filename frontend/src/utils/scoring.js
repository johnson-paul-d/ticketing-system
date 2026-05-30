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

  // CTR Contribution (30 points)
  score += Math.min(
    ctr * 4,
    30
  );

  // Conversion Rate Contribution (40 points)
  score += Math.min(
    conversionRate * 5,
    40
  );

  // CPA Contribution (30 points)
  score += Math.max(
    0,
    30 - (cpa / 50)
  );

  const finalScore = Math.max(
    0,
    Math.min(score, 100)
  );

  return Number.isFinite(finalScore)
    ? Math.round(finalScore)
    : 0;

};