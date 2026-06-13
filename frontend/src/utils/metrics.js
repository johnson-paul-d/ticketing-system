export const calculateCTR = (
  clicks,
  impressions
) => {

  return impressions
    ? (clicks / impressions) * 100
    : 0;

};

export const calculateConversionRate = (
  conversions,
  clicks
) => {

  return clicks
    ? (conversions / clicks) * 100
    : 0;

};

export const calculateCPA = (
  cost,
  conversions
) => {

  return conversions
    ? cost / conversions
    : 0;

};

export const calculateEfficiencyScore = (
  ctr,
  conversionRate,
  avgCpc
) => {

  return (
    (ctr * conversionRate) /
    Math.max(avgCpc, 1)
  );

};
// Waste spend = total cost of campaigns that recorded zero conversions across all dates.
// Groups by campaign name first, then checks if the campaign-level total has no conversions.
export const calculateWasteSpend = (rows = []) => {
  const byCampaign = {};

  rows.forEach((row) => {
    const name = row.campaign || row.campaign_name || row.campaignName;
    if (!name) return;

    if (!byCampaign[name]) {
      byCampaign[name] = { cost: 0, conversions: 0 };
    }

    byCampaign[name].cost        += Number(row.cost || 0);
    byCampaign[name].conversions += Number(row.conversions || 0);
  });

  return Object.values(byCampaign)
    .filter((c) => c.cost > 0 && c.conversions === 0)
    .reduce((sum, c) => sum + c.cost, 0);
};

// Zero-conversion days = distinct (campaign × date) pairs where that campaign
// spent money on that date but recorded zero conversions.
export const calculateZeroConversionDays = (rows = []) => {
  const byCampaignDay = {};

  rows.forEach((row) => {
    const name = row.campaign || row.campaign_name || row.campaignName;
    const date = row.report_date;
    if (!name || !date) return;

    const key = `${name}||${date}`;
    if (!byCampaignDay[key]) {
      byCampaignDay[key] = { cost: 0, conversions: 0 };
    }

    byCampaignDay[key].cost        += Number(row.cost || 0);
    byCampaignDay[key].conversions += Number(row.conversions || 0);
  });

  return Object.values(byCampaignDay)
    .filter((d) => d.cost > 0 && d.conversions === 0)
    .length;
};