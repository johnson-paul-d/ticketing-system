export const generateRecommendations = (
  campaigns
) => {

  const recommendations = [];

  campaigns.forEach((c) => {

    const ctr =
      Number(c.ctr || 0) * 100;

    const conversions =
      Number(c.conversions || 0);

    const cost =
      Number(c.cost || 0);

    const avgCpc =
      Number(c.avg_cpc || 0);

    if (
      conversions === 0 &&
      cost > 1000
    ) {

      recommendations.push({
        priority: "Critical",
        type: "Pause Campaign",
        campaign: c.campaign,
        message:
          "High spend detected without conversions.",
      });
    }

    if (
      ctr > 5 &&
      conversions > 2
    ) {

      recommendations.push({
        priority: "High",
        type: "Scale Budget",
        campaign: c.campaign,
        message:
          "Campaign shows strong engagement and conversion efficiency.",
      });
    }

    if (
      ctr > 5 &&
      conversions === 0
    ) {

      recommendations.push({
        priority: "Medium",
        type: "Optimize Landing Page",
        campaign: c.campaign,
        message:
          "High CTR but low conversion quality.",
      });
    }

    if (avgCpc > 50) {

      recommendations.push({
        priority: "Medium",
        type: "Reduce CPC",
        campaign: c.campaign,
        message:
          "Cost per click significantly above account benchmark.",
      });
    }

  });

  return recommendations;
};