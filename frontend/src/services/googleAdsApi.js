import api from "./api";

export const getOverview = async () => {
  const res = await api.get(
    "/google-ads/overview"
  );

  return res.data;
};

export const getCampaigns = async () => {
  const res = await api.get(
    "/google-ads/campaigns"
  );

  return res.data;
};

export const getKeywords = async () => {
  const res = await api.get(
    "/google-ads/keywords"
  );

  return res.data;
};

export const getTrends = async () => {
  const res = await api.get(
    "/google-ads/trends"
  );

  return res.data;
};