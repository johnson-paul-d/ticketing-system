import { useMemo } from "react";

import {
  calculateWasteSpend,
  calculateZeroConversionDays,
} from "../utils/metrics";

import {
  calculatePerformanceScore,
} from "../utils/scoring";

import {
  generateRecommendations,
} from "../utils/recommendations";

export default function useExecutiveMetrics({
  overview,
  campaigns,
  rows,
}) {

  const wasteSpend = useMemo(() => {

    return calculateWasteSpend(rows);

  }, [rows]);

  const zeroConversionDays = useMemo(() => {

    return calculateZeroConversionDays(rows);

  }, [rows]);

  const performanceScore = useMemo(() => {

    if (!campaigns?.length) return 0;

    const avg =
      campaigns.reduce(
        (sum, campaign) =>
          sum +
          calculatePerformanceScore(campaign),
        0
      ) / campaigns.length;

    return Math.round(avg);

  }, [campaigns]);

  const recommendations = useMemo(() => {

    return generateRecommendations(
      campaigns || []
    );

  }, [campaigns]);

  return {
    wasteSpend,
    zeroConversionDays,
    performanceScore,
    recommendations,
  };
}