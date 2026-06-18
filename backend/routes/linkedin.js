const express = require("express");
const router = express.Router();
const supabase = require("../config/supabase");
const auth = require("../middleware/auth");

const CLIENT_ID     = process.env.LINKEDIN_CLIENT_ID;
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
const REDIRECT_URI  = process.env.LINKEDIN_REDIRECT_URI || "http://localhost:3000/auth/linkedin/callback";

const LI_API  = "https://api.linkedin.com/v2";
const LI_AUTH = "https://www.linkedin.com/oauth/v2";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function liGet(path, accessToken, params = {}) {
  const url = new URL(`${LI_API}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "LinkedIn-Version": "202401",
      "X-Restli-Protocol-Version": "2.0.0",
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`LinkedIn ${res.status} on ${path}: ${text}`);
  try { return JSON.parse(text); } catch { return text; }
}

async function getStoredToken() {
  const { data, error } = await supabase
    .from("linkedin_tokens")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (error || !data) throw new Error("LinkedIn not connected. Please authenticate first.");
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    throw new Error("LinkedIn access token expired. Please re-authenticate.");
  }
  return data;
}

function toDateStr(epochOrStr) {
  if (!epochOrStr) return null;
  const d = typeof epochOrStr === "number" ? new Date(epochOrStr) : new Date(epochOrStr);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0];
}

function epochMs(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// ─── 1. Exchange code for access token — returns all admin pages ───────────────

router.post("/exchange-token", async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ message: "No code provided" });

  try {
    const tokenRes = await fetch(`${LI_AUTH}/accessToken`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type:    "authorization_code",
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

    // Fetch ALL admin orgs (not just the first)
    let orgs = [];
    try {
      const orgAcls = await liGet("/organizationAcls", access_token, {
        q:      "roleAssignee",
        role:   "ADMINISTRATOR",
        state:  "APPROVED",
        count:  10,
      });

      for (const el of orgAcls?.elements || []) {
        const urn = el.organization;
        const id  = urn?.split(":").pop();
        let name  = `Organization ${id}`;
        try {
          const info = await liGet(`/organizations/${id}`, access_token);
          name = info?.localizedName || info?.name?.localized?.en_US || name;
        } catch { /* use default name */ }
        orgs.push({ id, name, urn });
      }
    } catch (e) {
      console.warn("Could not fetch org list:", e.message);
    }

    // Save token without org yet (org selected next step)
    await supabase.from("linkedin_tokens").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    const { error: insertError } = await supabase.from("linkedin_tokens").insert({
      access_token,
      expires_at: expiresAt.toISOString(),
      org_id:   orgs[0]?.id   || null,
      org_name: orgs[0]?.name || null,
      org_urn:  orgs[0]?.urn  || null,
    });

    if (insertError) {
      console.error("Supabase insert error:", insertError);
      return res.status(500).json({
        message: "Token saved failed",
        detail: insertError.message,
      });
    }

    // If multiple orgs, let frontend show a picker
    res.json({ success: true, orgs, needsPicker: orgs.length > 1 });
  } catch (err) {
    console.error("LinkedIn token exchange error:", err);
    res.status(500).json({ message: err.message });
  }
});

// ─── 2. Select which org page to use ─────────────────────────────────────────

router.post("/select-org", async (req, res) => {
  const { orgId, orgName, orgUrn } = req.body;
  if (!orgId) return res.status(400).json({ message: "orgId required" });

  try {
    const { error } = await supabase
      .from("linkedin_tokens")
      .update({ org_id: orgId, org_name: orgName, org_urn: orgUrn })
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) return res.status(500).json({ message: error.message });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── 3. Connection status ─────────────────────────────────────────────────────

router.get("/status", async (req, res) => {
  try {
    const token = await getStoredToken();
    res.json({
      connected: true,
      orgName:   token.org_name,
      orgId:     token.org_id,
      expiresAt: token.expires_at,
    });
  } catch {
    res.json({ connected: false });
  }
});

// ─── 4. Disconnect ────────────────────────────────────────────────────────────

router.delete("/disconnect", auth, async (req, res) => {
  await supabase.from("linkedin_tokens").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  res.json({ success: true });
});

// ─── 5. Debug — see raw LinkedIn API response for chosen org ─────────────────

router.get("/debug", auth, async (req, res) => {
  try {
    const token = await getStoredToken();
    const { access_token, org_id, org_urn } = token;
    if (!org_id) return res.status(400).json({ message: "No org selected" });

    const orgUrn   = org_urn || `urn:li:organization:${org_id}`;
    const start    = epochMs(30);
    const end      = Date.now();
    const timeP    = {
      "timeIntervals.timeGranularityType": "DAY",
      "timeIntervals.timeRange.start": start,
      "timeIntervals.timeRange.end":   end,
    };

    const [follower, page, posts] = await Promise.allSettled([
      liGet("/organizationalEntityFollowerStatistics", access_token, { q: "organizationalEntity", organizationalEntity: orgUrn, ...timeP }),
      liGet("/organizationPageStatistics",             access_token, { q: "organization",         organization: orgUrn,         ...timeP }),
      liGet("/ugcPosts", access_token, { q: "authors", authors: `List(${orgUrn})`, count: 3 }),
    ]);

    res.json({
      orgId:      org_id,
      orgUrn,
      follower:   follower.status === "fulfilled" ? follower.value : { error: follower.reason?.message },
      page:       page.status    === "fulfilled" ? page.value    : { error: page.reason?.message },
      posts:      posts.status   === "fulfilled" ? posts.value   : { error: posts.reason?.message },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── 6. Sync all data ─────────────────────────────────────────────────────────

router.post("/sync", auth, async (req, res) => {
  try {
    const token = await getStoredToken();
    const { access_token, org_id, org_urn } = token;
    if (!org_id) return res.status(400).json({ message: "No organization selected. Please re-connect and choose a page." });

    const orgUrn     = org_urn || `urn:li:organization:${org_id}`;
    const startEpoch = epochMs(90);
    const endEpoch   = Date.now();
    const timeParams = {
      "timeIntervals.timeGranularityType": "DAY",
      "timeIntervals.timeRange.start":     startEpoch,
      "timeIntervals.timeRange.end":       endEpoch,
    };

    const results = { follower: 0, page: 0, posts: 0, ads: 0, errors: [] };

    // ── Follower statistics ──────────────────────────────────────────────────
    try {
      const raw = await liGet("/organizationalEntityFollowerStatistics", access_token, {
        q: "organizationalEntity",
        organizationalEntity: orgUrn,
        ...timeParams,
      });

      const rows = (raw?.elements || []).map((el) => {
        // totalFollowerCounts holds cumulative totals per day
        const tc = el.totalFollowerCounts || {};
        return {
          date:              toDateStr(el.timeRange?.start),
          total_followers:   (tc.organicFollowerCount || 0) + (tc.paidFollowerCount || 0),
          organic_followers:  tc.organicFollowerCount || 0,
          paid_followers:     tc.paidFollowerCount    || 0,
        };
      }).filter(r => r.date);

      if (rows.length > 0) {
        const { error } = await supabase.from("linkedin_follower_stats").upsert(rows, { onConflict: "date" });
        if (!error) results.follower = rows.length;
        else results.errors.push(`Follower upsert: ${error.message}`);
      } else {
        results.errors.push("Follower: API returned 0 elements");
      }
    } catch (e) {
      results.errors.push(`Follower: ${e.message}`);
    }

    // ── Page statistics ──────────────────────────────────────────────────────
    try {
      const raw = await liGet("/organizationPageStatistics", access_token, {
        q:            "organization",
        organization: orgUrn,
        ...timeParams,
      });

      const rows = (raw?.elements || []).map((el) => {
        const views = el.totalPageStatistics?.views || {};
        return {
          date:            toDateStr(el.timeRange?.start),
          page_views:      views.allPageViews?.pageViews       || 0,
          unique_visitors: views.allPageViews?.uniquePageViews || 0,
          impressions:     0,
          clicks:          0,
        };
      }).filter(r => r.date);

      if (rows.length > 0) {
        const { error } = await supabase.from("linkedin_page_analytics").upsert(rows, { onConflict: "date" });
        if (!error) results.page = rows.length;
        else results.errors.push(`Page upsert: ${error.message}`);
      } else {
        results.errors.push("Page: API returned 0 elements");
      }
    } catch (e) {
      results.errors.push(`Page: ${e.message}`);
    }

    // ── Posts + per-post share stats ─────────────────────────────────────────
    try {
      const ugcRaw = await liGet("/ugcPosts", access_token, {
        q:      "authors",
        authors: `List(${orgUrn})`,
        sortBy: "LAST_MODIFIED",
        count:  50,
      });

      const postElements = ugcRaw?.elements || [];
      if (postElements.length === 0) {
        results.errors.push("Posts: API returned 0 UGC posts");
      }

      const postRows = [];
      for (const post of postElements) {
        const postUrn     = post.id;
        const postDate    = toDateStr(post.created?.time);
        const textContent = post.specificContent?.["com.linkedin.ugc.ShareContent"]
                            ?.shareCommentary?.text || "";

        let impressions = 0, clicks = 0, reactions = 0, comments = 0, shares = 0;
        try {
          // Use the ugcPost URN directly — not converted to share URN
          const stats = await liGet("/organizationalEntityShareStatistics", access_token, {
            q:                    "organizationalEntity",
            organizationalEntity: orgUrn,
            "ugcPosts[0]":        postUrn,
          });
          const el = stats?.elements?.[0]?.totalShareStatistics;
          if (el) {
            impressions = el.impressionCount || 0;
            clicks      = el.clickCount      || 0;
            reactions   = el.likeCount       || 0;
            comments    = el.commentCount    || 0;
            shares      = el.shareCount      || 0;
          }
        } catch { /* per-post stats unavailable */ }

        const totalEngagements = reactions + comments + shares + clicks;
        const engagementRate   = impressions > 0 ? (totalEngagements / impressions) * 100 : 0;

        postRows.push({
          post_id:         postUrn,
          post_date:       postDate,
          text_preview:    textContent.slice(0, 300),
          impressions,
          clicks,
          reactions,
          comments,
          shares,
          engagement_rate: parseFloat(engagementRate.toFixed(4)),
        });
      }

      if (postRows.length > 0) {
        const { error } = await supabase.from("linkedin_post_analytics").upsert(postRows, { onConflict: "post_id" });
        if (!error) results.posts = postRows.length;
        else results.errors.push(`Posts upsert: ${error.message}`);
      }
    } catch (e) {
      results.errors.push(`Posts: ${e.message}`);
    }

    // ── Ad analytics (requires r_ads_reporting scope) ────────────────────────
    try {
      const adAccounts = await liGet("/adAccountsV2", access_token, {
        q: "search",
        "search.status.values[0]": "ACTIVE",
        count: 10,
      });

      for (const acct of adAccounts?.elements || []) {
        const startDate = new Date(startEpoch);
        const endDate   = new Date();

        const adAnalytics = await liGet("/adAnalyticsV2", access_token, {
          q: "analytics",
          pivot: "CAMPAIGN",
          "dateRange.start.day":   startDate.getDate(),
          "dateRange.start.month": startDate.getMonth() + 1,
          "dateRange.start.year":  startDate.getFullYear(),
          "dateRange.end.day":     endDate.getDate(),
          "dateRange.end.month":   endDate.getMonth() + 1,
          "dateRange.end.year":    endDate.getFullYear(),
          timeGranularity:         "DAILY",
          accounts:                acct.id,
          fields: "externalWebsiteConversions,clicks,impressions,costInLocalCurrency,dateRange,pivotValues",
        });

        const adRows = (adAnalytics?.elements || []).map((el) => {
          const dr = el.dateRange?.start;
          return {
            date:          dr ? `${dr.year}-${String(dr.month).padStart(2,"0")}-${String(dr.day).padStart(2,"0")}` : null,
            campaign_id:   el.pivotValues?.[0]?.split(":").pop() || "unknown",
            campaign_name: el.pivotValues?.[0] || "Unknown Campaign",
            spend:         parseFloat(el.costInLocalCurrency || 0),
            impressions:   parseInt(el.impressions || 0),
            clicks:        parseInt(el.clicks || 0),
            conversions:   parseInt(el.externalWebsiteConversions || 0),
          };
        }).filter(r => r.date);

        if (adRows.length > 0) {
          const { error } = await supabase.from("linkedin_ad_analytics").upsert(adRows, { onConflict: "date,campaign_id" });
          if (!error) results.ads += adRows.length;
          else results.errors.push(`Ad upsert: ${error.message}`);
        }
      }
    } catch (e) {
      results.errors.push(`Ads (needs r_ads_reporting): ${e.message}`);
    }

    res.json({ success: true, synced: results, warnings: results.errors.length ? results.errors : undefined });
  } catch (err) {
    console.error("LinkedIn sync error:", err);
    res.status(500).json({ message: err.message });
  }
});

// ─── 7. Data read endpoints (no auth — company-wide data) ─────────────────────

router.get("/follower-stats", async (req, res) => {
  try {
    const { data, error } = await supabase.from("linkedin_follower_stats").select("*").order("date", { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get("/page-analytics", async (req, res) => {
  try {
    const { data, error } = await supabase.from("linkedin_page_analytics").select("*").order("date", { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get("/posts", async (req, res) => {
  try {
    const { data, error } = await supabase.from("linkedin_post_analytics").select("*").order("post_date", { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get("/ad-analytics", async (req, res) => {
  try {
    const { data, error } = await supabase.from("linkedin_ad_analytics").select("*").order("date", { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
