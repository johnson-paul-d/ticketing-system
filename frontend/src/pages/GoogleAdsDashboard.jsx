import { useEffect, useState } from "react";
import MainLayout from "../layouts/MainLayout";
import api from "../services/api";

export default function GoogleAdsDashboard() {

  const [overview, setOverview] = useState(null);

  useEffect(() => {
    fetchOverview();
  }, []);

  const fetchOverview = async () => {
    try {

      const res = await api.get(
        "/google-ads/overview"
      );

      setOverview(res.data);

    } catch (err) {
      console.error(err);
    }
  };

  return (
    <MainLayout>

      <div className="p-6">

        <h1 className="text-4xl font-bold mb-6">
          Google Ads Intelligence
        </h1>

        {!overview ? (
          <p>Loading...</p>
        ) : (
          <div className="grid grid-cols-4 gap-6">

            <div className="bg-white p-6 rounded-2xl shadow">
              <p className="text-gray-500">
                Total Spend
              </p>

              <h2 className="text-3xl font-bold mt-2">
                ₹{overview.totalSpend?.toFixed(0)}
              </h2>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow">
              <p className="text-gray-500">
                Total Clicks
              </p>

              <h2 className="text-3xl font-bold mt-2">
                {overview.totalClicks}
              </h2>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow">
              <p className="text-gray-500">
                Conversions
              </p>

              <h2 className="text-3xl font-bold mt-2">
                {overview.totalConversions}
              </h2>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow">
              <p className="text-gray-500">
                Avg CPC
              </p>

              <h2 className="text-3xl font-bold mt-2">
                ₹{overview.avgCpc?.toFixed(2)}
              </h2>
            </div>

          </div>
        )}

      </div>

    </MainLayout>
  );
}
