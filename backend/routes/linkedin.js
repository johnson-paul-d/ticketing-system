const express = require("express");
const router  = express.Router();
const supabase = require("../config/supabase");
const auth     = require("../middleware/auth");

const CLIENT_ID     = process.env.LINKEDIN_CLIENT_ID;
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
const REDIRECT_URI  = process.env.LINKEDIN_REDIRECT_URI || "http://localhost:3000/auth/linkedin/callback";
const LI_API        = "https://api.linkedin.com/v2";
const LI_AUTH       = "https://www.linkedin.com/oauth/v2";

// ─── Core fetch wrapper ───────────────────────────────────────────────────────
// Builds URL manually so List() notation is not double-encoded by URLSearchParams

async function liGet(path, token, params = {}) {
  const pairs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  const url = `${LI_API}${path}${pairs ? "?" + pairs : ""}`;

  const res  = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Restli-Protocol-Version": "2.0.0",
      "LinkedIn-Version": "202401",
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`LI ${res.status} [${path}]: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { return {}; }
}

// ugcPosts authors param must NOT be double-encoded (List(...) is restli syntax)
async function liGetRaw(path, token, rawQuery) {
  const url = `${LI_API}${path}?${rawQuery}`;
  const res  = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Restli-Protocol-Version": "2.0.0",
      "LinkedIn-Version": "202401",
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`LI ${res.status} [${path}]: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { return {}; }
}

async function getStoredToken() {
  const { data, error } = await supabase
    .from("linkedin_tokens").select("*")
    .order("created_at", { ascending: false }).limit(1).single();
  if (error || !data) throw new Error("LinkedIn not connected.");
  if (data.expires_at && new Date(data.expires_at) < new Date())
    throw new Error("LinkedIn token expired. Please re-authenticate.");
  return data;
}

function toDate(epoch) {
  if (!epoch) return null;
  const d = new Date(typeof epoch === "number" ? epoch : Number(epoch));
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0];
}

function daysAgoMs(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// ─── 1. Exchange code → store token + all orgs ───────────────────────────────

router.post("/exchange-token", async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ message: "No code provided" });

  try {
    const tokenRes = await fetch(`${LI_AUTH}/accessToken`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri:  REDIRECT_URI,
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    });
    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      return res.status(400).json({ message: "Token exchange failed", detail: err });
    }

    const { access_token, expires_in } = await tokenRes.json();
    const expiresAt = new Date(Date.now() + (expires_in || 5184000) * 1000);

    // Fetch ALL admin orgs
    let orgs = [];
    try {
      const aclData = await liGet("/organizationAcls", access_token, {
        q: "roleAssignee", role: "ADMINISTRATOR", state: "APPROVED", count: 10,
      });
      for (const el of aclData?.elements || []) {
        const urn  = el.organization;
        const id   = urn?.split(":").pop();
        let name   = `Org ${id}`;
        try {
          const info = await liGet(`/organizations/${id}`, access_token);
          name = info?.localizedName || info?.name?.localized?.en_US || name;
        } catch { /* keep default name */ }
        orgs.push({ id, name, urn });
      }
    } catch (e) {
      console.warn("Org fetch warn:", e.message);
    }

    // Persist — wipe old, insert new
    await supabase.from("linkedin_tokens").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    const { error: insertErr } = await supabase.from("linkedin_tokens").insert({
      access_token,
      expires_at: expiresAt.toISOString(),
      org_id:    orgs[0]?.id   || null,
      org_name:  orgs[0]?.name || null,
      org_urn:   orgs[0]?.urn  || null,
      all_orgs:  orgs,
    });

    if (insertErr) {
      return res.status(500).json({ message: "Failed to save token", detail: insertErr.message });
    }

    res.json({ success: true, orgs, needsPicker: orgs.length > 1 });
  } catch (err) {
    console.error("exchange-token:", err.message);
    res.status(500).json({ message: err.message });
  }
});

// ─── 2. Select org (after picker) ────────────────────────────────────────────

router.post("/select-org", async (req, res) => {
  const { orgId, orgName, orgUrn } = req.body;
  if (!orgId) return res.status(400).json({ message: "orgId required" });
  try {
    await supabase.from("linkedin_tokens")
      .update({ org_id: orgId, org_name: orgName, org_urn: orgUrn })
      .order("created_at", { ascending: false }).limit(1);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── 3. Status ───────────────────────────────────────────────────────────────

router.get("/status", async (req, res) => {
  try {
    const t = await getStoredToken();
    res.json({
      connected: true,
      orgName:   t.org_name,
      orgId:     t.org_id,
      allOrgs:   t.all_orgs || [],
      expiresAt: t.expires_at,
    });
  } catch { res.json({ connected: false }); }
});

// ─── 4. Disconnect ────────────────────────────────────────────────────────────

router.delete("/disconnect", auth, async (req, res) => {
  await supabase.from("linkedin_tokens").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  res.json({ success: true });
});

// ─── 5. Debug — raw API response for one org ─────────────────────────────────

router.get("/debug", auth, async (req, res) => {
  try {
    const t      = await getStoredToken();
    const token  = t.access_token;
    const allOrgs = t.all_orgs?.length ? t.all_orgs : [{ id: t.org_id, urn: t.org_urn, name: t.org_name }];
    const orgId  = req.query.orgId || allOrgs[0]?.id;
    const org    = allOrgs.find(o => o.id === orgId) || allOrgs[0];
    const orgUrn = org?.urn || `urn:li:organization:${org?.id}`;

    const start = daysAgoMs(30);
    const end   = Date.now();
    const timeP = {
      "timeIntervals.timeGranularityType": "DAY",
      "timeIntervals.timeRange.start": start,
      "timeIntervals.timeRange.end":   end,
    };

    const [follower, followerSnap, page, posts, shareWithTime, shareNoTime] = await Promise.allSettled([
      liGet("/organizationalEntityFollowerStatistics", token, { q: "organizationalEntity", organizationalEntity: orgUrn, ...timeP }),
      liGet("/organizationalEntityFollowerStatistics", token, { q: "organizationalEntity", organizationalEntity: orgUrn }),
      liGet("/organizationPageStatistics",             token, { q: "organization", organization: orgUrn, ...timeP }),
      liGetRaw("/ugcPosts", token, `q=authors&authors=List(${encodeURIComponent(orgUrn)})&sortBy=LAST_MODIFIED&count=3`),
      liGet("/organizationalEntityShareStatistics",    token, { q: "organizationalEntity", organizationalEntity: orgUrn, ...timeP }),
      liGet("/organizationalEntityShareStatistics",    token, { q: "organizationalEntity", organizationalEntity: orgUrn }),
    ]);

    const ok  = r => r.status === "fulfilled" ? r.value : { error: r.reason?.message };
    const cnt = r => r.status === "fulfilled" ? r.value?.elements?.length : null;

    res.json({
      org, orgUrn,
      follower_timeseries: { elements: cnt(follower),     sample: ok(follower)?.elements?.[0] },
      follower_snapshot:   { elements: cnt(followerSnap), sample: ok(followerSnap)?.elements?.[0] },
      page:                { elements: cnt(page),         sample: ok(page)?.elements?.[0] },
      posts:               { elements: cnt(posts),        sample: ok(posts)?.elements?.[0]?.id },
      share_with_time:     { elements: cnt(shareWithTime), sample: ok(shareWithTime)?.elements?.[0] },
      share_no_time:       { elements: cnt(shareNoTime),   sample: ok(shareNoTime)?.elements?.[0] },
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── 6. Sync — loops ALL orgs ─────────────────────────────────────────────────

router.post("/sync", auth, async (req, res) => {
  try {
    const t      = await getStoredToken();
    const token  = t.access_token;
    const allOrgs = t.all_orgs?.length
      ? t.all_orgs
      : [{ id: t.org_id, name: t.org_name, urn: t.org_urn }];

    if (!allOrgs.length || !allOrgs[0]?.id) {
      return res.status(400).json({ message: "No organizations found. Please reconnect." });
    }

    const start = daysAgoMs(90);
    const end   = Date.now();
    const timeP = {
      "timeIntervals.timeGranularityType": "DAY",
      "timeIntervals.timeRange.start": start,
      "timeIntervals.timeRange.end":   end,
    };

    const summary = {};

    for (const org of allOrgs) {
      const orgId  = org.id;
      const orgUrn = org.urn || `urn:li:organization:${orgId}`;
      const orgName = org.name || orgId;
      const r = { follower: 0, page: 0, posts: 0, errors: [] };

      // ── Follower stats (time-series, fallback to snapshot) ───────────────
      try {
        let rows = [];

        // Try daily time-series first
        try {
          const raw = await liGet("/organizationalEntityFollowerStatistics", token, {
            q: "organizationalEntity", organizationalEntity: orgUrn, ...timeP,
          });
          rows = (raw?.elements || []).map(el => ({
            date:              toDate(el.timeRange?.start),
            org_id:            orgId,
            org_name:          orgName,
            total_followers:   (el.totalFollowerCounts?.organicFollowerCount || 0) + (el.totalFollowerCounts?.paidFollowerCount || 0),
            organic_followers:  el.totalFollowerCounts?.organicFollowerCount || 0,
            paid_followers:     el.totalFollowerCounts?.paidFollowerCount    || 0,
          })).filter(x => x.date);
        } catch (e) { r.errors.push(`FollowerTimeSeries: ${e.message}`); }

        // Fallback: current snapshot (no time range → returns total counts)
        if (!rows.length) {
          try {
            const snap = await liGet("/organizationalEntityFollowerStatistics", token, {
              q: "organizationalEntity", organizationalEntity: orgUrn,
            });
            const el0 = snap?.elements?.[0];
            const tc  = el0?.totalFollowerCounts || {};
            const total = (tc.organicFollowerCount || 0) + (tc.paidFollowerCount || 0);
            if (total > 0) {
              rows = [{ date: new Date().toISOString().split("T")[0], org_id: orgId, org_name: orgName,
                total_followers: total, organic_followers: tc.organicFollowerCount || 0, paid_followers: tc.paidFollowerCount || 0 }];
            } else {
              r.errors.push(`Follower: 0 elements from both time-series and snapshot. snap keys: ${Object.keys(snap || {}).join(",")}`);
            }
          } catch (e) { r.errors.push(`FollowerSnapshot: ${e.message}`); }
        }

        if (rows.length) {
          const { error } = await supabase.from("linkedin_follower_stats").upsert(rows, { onConflict: "date,org_id" });
          if (error) r.errors.push(`Follower upsert: ${error.message}`);
          else r.follower = rows.length;
        }
      } catch (e) { r.errors.push(`Follower: ${e.message}`); }

      // ── Page views (time-series, fallback to snapshot) ───────────────────
      try {
        let rows = [];

        try {
          const raw = await liGet("/organizationPageStatistics", token, {
            q: "organization", organization: orgUrn, ...timeP,
          });
          rows = (raw?.elements || []).map(el => ({
            date:            toDate(el.timeRange?.start),
            org_id:          orgId,
            org_name:        orgName,
            page_views:      el.totalPageStatistics?.views?.allPageViews?.pageViews       || 0,
            unique_visitors: el.totalPageStatistics?.views?.allPageViews?.uniquePageViews || 0,
            impressions:     0,
            clicks:          0,
          })).filter(x => x.date);
        } catch (e) { r.errors.push(`PageTimeSeries: ${e.message}`); }

        // Fallback: snapshot without time range
        if (!rows.length) {
          try {
            const snap = await liGet("/organizationPageStatistics", token, {
              q: "organization", organization: orgUrn,
            });
            const el0 = snap?.elements?.[0];
            const views = el0?.totalPageStatistics?.views?.allPageViews;
            if (views?.pageViews) {
              rows = [{ date: new Date().toISOString().split("T")[0], org_id: orgId, org_name: orgName,
                page_views: views.pageViews || 0, unique_visitors: views.uniquePageViews || 0,
                impressions: 0, clicks: 0 }];
            } else {
              r.errors.push(`Page: 0 elements from both queries. snap keys: ${Object.keys(snap || {}).join(",")}`);
            }
          } catch (e) { r.errors.push(`PageSnapshot: ${e.message}`); }
        }

        if (rows.length) {
          const { error } = await supabase.from("linkedin_page_analytics").upsert(rows, { onConflict: "date,org_id" });
          if (error) r.errors.push(`Page upsert: ${error.message}`);
          else r.page = rows.length;
        }
      } catch (e) { r.errors.push(`Page: ${e.message}`); }

      // ── Posts ────────────────────────────────────────────────────────────
      try {
        const ugcRaw = await liGetRaw(
          "/ugcPosts", token,
          `q=authors&authors=List(${encodeURIComponent(orgUrn)})&sortBy=LAST_MODIFIED&count=50`
        );
        const posts = ugcRaw?.elements || [];
        if (!posts.length) r.errors.push("Posts: 0 UGC posts returned");

        // Share stats WITHOUT time range = per-post lifetime engagement
        // (with time range it returns time-bucketed aggregates, not per-post)
        let shareMap = {};
        try {
          const shareRaw = await liGet("/organizationalEntityShareStatistics", token, {
            q: "organizationalEntity", organizationalEntity: orgUrn,
          });
          for (const el of shareRaw?.elements || []) {
            const key = el.ugcPost || el.share;
            if (key) shareMap[key] = el.totalShareStatistics || {};
          }
          r.errors.push(`ShareStats: ${Object.keys(shareMap).length} posts mapped`);
        } catch (se) { r.errors.push(`ShareStats: ${se.message}`); }

        const rows = posts.map(post => {
          const postUrn = post.id;
          const s = shareMap[postUrn] || {};
          const imp  = s.impressionCount || 0;
          const eng  = (s.likeCount || 0) + (s.commentCount || 0) + (s.shareCount || 0) + (s.clickCount || 0);
          return {
            post_id:         postUrn,
            org_id:          orgId,
            org_name:        orgName,
            post_date:       toDate(post.created?.time),
            text_preview:    (post.specificContent?.["com.linkedin.ugc.ShareContent"]?.shareCommentary?.text || "").slice(0, 300),
            impressions:     imp,
            clicks:          s.clickCount    || 0,
            reactions:       s.likeCount     || 0,
            comments:        s.commentCount  || 0,
            shares:          s.shareCount    || 0,
            engagement_rate: imp > 0 ? parseFloat(((eng / imp) * 100).toFixed(4)) : 0,
          };
        });

        if (rows.length) {
          const { error } = await supabase.from("linkedin_post_analytics").upsert(rows, { onConflict: "post_id" });
          if (error) r.errors.push(`Posts upsert: ${error.message}`);
          else r.posts = rows.length;
        }
      } catch (e) { r.errors.push(`Posts: ${e.message}`); }

      summary[orgName] = r;
    }

    res.json({ success: true, summary });
  } catch (err) {
    console.error("sync:", err.message);
    res.status(500).json({ message: err.message });
  }
});

// ─── 7. Data endpoints — filter by ?orgId= or return all ─────────────────────

router.get("/follower-stats", async (req, res) => {
  try {
    let q = supabase.from("linkedin_follower_stats").select("*").order("date", { ascending: true });
    if (req.query.orgId) q = q.eq("org_id", req.query.orgId);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get("/page-analytics", async (req, res) => {
  try {
    let q = supabase.from("linkedin_page_analytics").select("*").order("date", { ascending: true });
    if (req.query.orgId) q = q.eq("org_id", req.query.orgId);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get("/posts", async (req, res) => {
  try {
    let q = supabase.from("linkedin_post_analytics").select("*").order("post_date", { ascending: false });
    if (req.query.orgId) q = q.eq("org_id", req.query.orgId);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get("/ad-analytics", async (req, res) => {
  try {
    let q = supabase.from("linkedin_ad_analytics").select("*").order("date", { ascending: true });
    if (req.query.orgId) q = q.eq("org_id", req.query.orgId);
    const { data, error } = await q;
    // 42703 = column does not exist (org_id not yet added via ALTER TABLE)
    if (error) {
      if (error.code === "42703") return res.json([]);
      throw error;
    }
    res.json(data || []);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
