import { useEffect, useState, useCallback } from "react";
import api from "../services/api";

export default function useLinkedInData() {
  const [status,        setStatus]       = useState(null);
  const [allOrgs,       setAllOrgs]      = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState(null); // null = All
  const [followerStats, setFollowerStats] = useState([]);
  const [pageAnalytics, setPageAnalytics] = useState([]);
  const [posts,         setPosts]         = useState([]);
  const [adAnalytics,   setAdAnalytics]   = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [dataLoading,   setDataLoading]   = useState(false);
  const [syncing,       setSyncing]       = useState(false);
  const [syncResult,    setSyncResult]    = useState(null);
  const [error,         setError]         = useState(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get("/linkedin/status");
      setStatus(res.data);
      const orgs = res.data.allOrgs || [];
      setAllOrgs(orgs);
      return res.data.connected;
    } catch {
      setStatus({ connected: false });
      return false;
    }
  }, []);

  const fetchData = useCallback(async (orgId) => {
    setDataLoading(true);
    try {
      const params = orgId ? { params: { orgId } } : {};
      const [f, p, po, a] = await Promise.allSettled([
        api.get("/linkedin/follower-stats",  params),
        api.get("/linkedin/page-analytics",  params),
        api.get("/linkedin/posts",           params),
        api.get("/linkedin/ad-analytics",    params),
      ]);
      if (f.status  === "fulfilled") setFollowerStats(f.value.data  || []);
      if (p.status  === "fulfilled") setPageAnalytics(p.value.data  || []);
      if (po.status === "fulfilled") setPosts(po.value.data         || []);
      if (a.status  === "fulfilled") setAdAnalytics(a.value.data    || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setDataLoading(false);
    }
  }, []);

  const selectOrg = useCallback((orgId) => {
    setSelectedOrgId(orgId);
    fetchData(orgId);
  }, [fetchData]);

  const sync = useCallback(async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await api.post("/linkedin/sync");
      setSyncResult(res.data);
      await fetchData(selectedOrgId);
    } catch (e) {
      setSyncResult({ error: e?.response?.data?.message || e.message });
    } finally {
      setSyncing(false);
    }
  }, [fetchData, selectedOrgId]);

  const disconnect = useCallback(async () => {
    try { await api.delete("/linkedin/disconnect"); } catch { /* ignore */ }
    setStatus({ connected: false });
    setAllOrgs([]);
    setFollowerStats([]);
    setPageAnalytics([]);
    setPosts([]);
    setAdAnalytics([]);
  }, []);

  const debug = useCallback(async (orgId) => {
    const params = orgId ? { params: { orgId } } : {};
    const res = await api.get("/linkedin/debug", params);
    return res.data;
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const connected = await fetchStatus();
      if (connected) await fetchData(null);
      setLoading(false);
    })();
  }, []);

  return {
    status,
    allOrgs,
    selectedOrgId,
    selectOrg,
    followerStats,
    pageAnalytics,
    posts,
    adAnalytics,
    loading,
    dataLoading,
    syncing,
    syncResult,
    error,
    sync,
    disconnect,
    debug,
    refetch: () => fetchData(selectedOrgId),
  };
}
