import { useMemo } from "react";

import {
  calculateWasteSpend,
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
}) {

  const wasteSpend = useMemo(() => {

    return calculateWasteSpend(
      campaigns
    );

  }, [campaigns]);

  const performanceScore =
    useMemo(() => {

      if (!campaigns.length) return 0;

      const avg =
        campaigns.reduce(
          (sum, c) =>
            sum +
            calculatePerformanceScore(
              c
            ),
          0
        ) / campaigns.length;

      return Math.round(avg);

    }, [campaigns]);

  const recommendations =
    useMemo(() => {

      return generateRecommendations(
        campaigns
      );

    }, [campaigns]);

  return {
    wasteSpend,
    performanceScore,
    recommendations,
  };
}