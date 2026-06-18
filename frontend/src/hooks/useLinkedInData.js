import { useEffect, useState, useCallback } from "react";
import api from "../services/api";

export default function useLinkedInData() {
  const [status,          setStatus]         = useState(null);   // { connected, orgName, orgId }
  const [followerStats,   setFollowerStats]   = useState([]);
  const [pageAnalytics,   setPageAnalytics]   = useState([]);
  const [posts,           setPosts]           = useState([]);
  const [adAnalytics,     setAdAnalytics]     = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [syncing,         setSyncing]         = useState(false);
  const [syncResult,      setSyncResult]      = useState(null);
  const [error,           setError]           = useState(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get("/linkedin/status");
      setStatus(res.data);
      return res.data.connected;
    } catch (e) {
      // Status endpoint has no auth — any error means not connected
      setStatus({ connected: false });
      return false;
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [f, p, po, a] = await Promise.allSettled([
        api.get("/linkedin/follower-stats"),
        api.get("/linkedin/page-analytics"),
        api.get("/linkedin/posts"),
        api.get("/linkedin/ad-analytics"),
      ]);
      if (f.status === "fulfilled") setFollowerStats(f.value.data || []);
      if (p.status === "fulfilled") setPageAnalytics(p.value.data || []);
      if (po.status === "fulfilled") setPosts(po.value.data || []);
      if (a.status === "fulfilled") setAdAnalytics(a.value.data || []);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const sync = useCallback(async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await api.post("/linkedin/sync");
      setSyncResult(res.data);
      await fetchData();
    } catch (e) {
      setSyncResult({ error: e?.response?.data?.message || e.message });
    } finally {
      setSyncing(false);
    }
  }, [fetchData]);

  const disconnect = useCallback(async () => {
    try { await api.delete("/linkedin/disconnect"); } catch { /* ignore */ }
    setStatus({ connected: false });
    setFollowerStats([]);
    setPageAnalytics([]);
    setPosts([]);
    setAdAnalytics([]);
  }, []);

  const debug = useCallback(async () => {
    const res = await api.get("/linkedin/debug");
    return res.data;
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const connected = await fetchStatus();
      if (connected) await fetchData();
      setLoading(false);
    })();
  }, []);

  return {
    status,
    followerStats,
    pageAnalytics,
    posts,
    adAnalytics,
    loading,
    syncing,
    syncResult,
    error,
    sync,
    disconnect,
    debug,
    refetch: fetchData,
  };
}
