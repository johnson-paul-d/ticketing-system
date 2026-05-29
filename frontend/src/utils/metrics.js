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

  const dailyTotals = {};

  rows.forEach((row) => {

    const date = row.report_date;

    if (!date) return;

    if (!dailyTotals[date]) {

      dailyTotals[date] = {
        cost: 0,
        conversions: 0,
      };

    }

    dailyTotals[date].cost += Number(
      row.cost || 0
    );

    dailyTotals[date].conversions += Number(
      row.conversions || 0
    );

  });

  return Object.values(dailyTotals)
    .filter(
      day =>
        day.cost > 0 &&
        day.conversions === 0
    )
    .reduce(
      (sum, day) =>
        sum + day.cost,
      0
    );

};

export const calculateZeroConversionDays = (
  rows = []
) => {

  const dailyTotals = {};

  rows.forEach((row) => {

    const date = row.report_date;

    if (!date) return;

    if (!dailyTotals[date]) {

      dailyTotals[date] = {
        cost: 0,
        conversions: 0,
      };

    }

    dailyTotals[date].cost += Number(
      row.cost || 0
    );

    dailyTotals[date].conversions += Number(
      row.conversions || 0
    );

  });

  return Object.values(dailyTotals)
    .filter(
      day =>
        day.cost > 0 &&
        day.conversions === 0
    )
    .length;

};