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

export const calculateWasteSpend = (
  campaigns
) => {

  return campaigns
    .filter(
      (c) =>
        Number(c.conversions || 0) === 0
    )
    .reduce(
      (sum, c) =>
        sum + Number(c.cost || 0),
      0
    );
};