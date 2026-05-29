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
  rows = []
) => {

  return rows
    .filter(
      row =>
        Number(row.cost || 0) > 0 &&
        Number(row.conversions || 0) === 0
    )
    .reduce(
      (sum, row) =>
        sum + Number(row.cost || 0),
      0
    );

};

export const calculateZeroConversionDays = (
  rows = []
) => {

  return rows.filter(
    row =>
      Number(row.cost || 0) > 0 &&
      Number(row.conversions || 0) === 0
  ).length;

};