export const movingAverageForecast = (
  values,
  period = 7
) => {

  if (!values.length) return 0;

  const recent =
    values.slice(-period);

  const avg =
    recent.reduce(
      (sum, val) =>
        sum + Number(val || 0),
      0
    ) / recent.length;

  return Math.round(avg);
};