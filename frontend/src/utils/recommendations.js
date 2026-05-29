export const generateRecommendations = (campaigns) => {
  if (!campaigns || campaigns.length === 0) return [];

  // Compute account average CPC for the "Reduce CPC" rule
  const totalAvgCpc = campaigns.reduce((sum, c) => {
    const avgCpc = Number(c.avg_cpc || 0);
    return sum + avgCpc;
  }, 0);
  const accountAvgCPC = totalAvgCpc / campaigns.length;

  const recommendations = [];

  campaigns.forEach((c) => {
    const conversions = Number(c.conversions || 0);
    const cost = Number(c.cost || 0);
    const conversionRate = Number(c.conversion_rate || 0);
    const cpa = Number(c.cpa || 0);
    const ctr = Number(c.ctr || 0);
    const avgCpc = Number(c.avg_cpc || 0);

    // 1. Pause Campaign
    if (conversions === 0 && cost > 5000) {
      recommendations.push({
        priority: "Critical",
        type: "Pause Campaign",
        campaign: c.campaign,
        message: "High spend detected without conversions.",
      });
    }

    // 2. Scale Budget
    if (conversionRate > 5 && cpa < 500) {
      recommendations.push({
        priority: "High",
        type: "Scale Budget",
        campaign: c.campaign,
        message: "Campaign shows strong conversion rate and efficient CPA.",
      });
    }

    // 3. Landing Page Issue
    if (ctr > 5 && conversions === 0) {
      recommendations.push({
        priority: "Medium",
        type: "Landing Page Issue",
        campaign: c.campaign,
        message: "High CTR but no conversions – landing page may need optimization.",
      });
    }

    // 4. Reduce CPC
    if (avgCpc > accountAvgCPC * 1.5) {
      recommendations.push({
        priority: "Medium",
        type: "Reduce CPC",
        campaign: c.campaign,
        message: "Cost per click significantly above account benchmark.",
      });
    }
  });

  return recommendations;
};