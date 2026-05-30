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
    return calculateWasteSpend(rows || []);
  }, [rows]);

  const zeroConversionDays = useMemo(() => {
    return calculateZeroConversionDays(rows || []);
  }, [rows]);

  const performanceScore = useMemo(() => {

    if (!campaigns?.length) {
      return 0;
    }

    const validScores = campaigns
      .map((campaign) =>
        Number(
          calculatePerformanceScore(campaign)
        )
      )
      .filter(
        (score) =>
          !Number.isNaN(score) &&
          Number.isFinite(score)
      );

    if (!validScores.length) {
      return 0;
    }

    const avg =
      validScores.reduce(
        (sum, score) =>
          sum + score,
        0
      ) / validScores.length;

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