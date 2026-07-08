import { useEffect, useState } from "react";

import {
  getOverview,
  getCampaigns,
  getKeywords,
  getTrends,
} from "../services/googleAdsApi";

export default function useGoogleAdsData() {

  const [overview, setOverview] =
    useState({});

  const [campaigns, setCampaigns] =
    useState([]);

  const [keywords, setKeywords] =
    useState([]);

  const [trends, setTrends] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {

    fetchData();

  }, []);

  const fetchData = async () => {

    try {

      setLoading(true);

      const [
        overviewData,
        campaignData,
        keywordData,
        trendData,
      ] = await Promise.all([
        getOverview(),
        getCampaigns(),
        getKeywords(),
        getTrends(),
      ]);

      setOverview(
        overviewData || {}
      );

      setCampaigns(
        Array.isArray(campaignData)
          ? campaignData
          : campaignData?.data || []
      );

      setKeywords(
        Array.isArray(keywordData)
          ? keywordData
          : keywordData?.data || []
      );

      setTrends(
        Array.isArray(trendData)
          ? trendData
          : trendData?.data || []
      );

    } catch (err) {

      console.error(
        "Google Ads Fetch Error:",
        err
      );

    } finally {

      setLoading(false);

    }
  };

  return {
    overview,
    campaigns,
    keywords,
    trends,
    loading,
  };
}
