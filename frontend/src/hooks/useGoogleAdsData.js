import { useEffect, useState } from "react";

import {
  getOverview,
  getCampaigns,
  getKeywords,
  getTrends,
} from "../services/googleAdsApi";

export default function useGoogleAdsData() {

  const [overview, setOverview] =
    useState(null);

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

      setOverview(overviewData);

      setCampaigns(campaignData);

      setKeywords(keywordData);

      setTrends(trendData);

    } catch (err) {

      console.error(err);

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