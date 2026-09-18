const express = require("express");
const router  = express.Router();
const supabase = require("../config/supabase");
const auth     = require("../middleware/auth");
const requireAccess = require("../middleware/requireAccess");
const { canAccessLinkedIn } = require("../utils/roles");
const { rateLimit }         = require("../utils/rateLimit");

const CLIENT_ID     = process.env.LINKEDIN_CLIENT_ID;
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
const REDIRECT_URI  = process.env.LINKEDIN_REDIRECT_URI || "http://localhost:3000/auth/linkedin/callback";
const LI_API        = "https://api.linkedin.com/v2";
const LI_AUTH       = "https://www.linkedin.com/oauth/v2";

// Every route below reads or rotates the shared LinkedIn page token and its
// analytics. Mounted router-wide so a new route cannot be added unprotected.
router.use(auth, requireAccess(canAccessLinkedIn));

// ─── Core fetch wrapper ───────────────────────────────────────────────────────
// Builds URL manually so List() notation is not double-encoded by URLSearchParams

// withVersion=true → sends LinkedIn-Version: 202401 (needed for ugcPosts)
// withVersion=false → classic v2 without version header (used for analytics endpoints)
async function liGet(path, token, params = {}, withVersion = false) {
  const pairs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  const url = `${LI_API}${path}${pairs ? "?" + pairs : ""}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    "X-Restli-Protocol-Version": "2.0.0",
  };
  if (withVersion) headers["LinkedIn-Version"] = "202401";

  const res  = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`LI ${res.status} [${path}]: ${text.slice(0, 400)}`);
  try { return JSON.parse(text); } catch { return {}; }
}

async function liGetRaw(path, token, rawQuery, withVersion = false) {
  const url = `${LI_API}${path}?${rawQuery}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    "X-Restli-Protocol-Version": "2.0.0",
  };
  if (withVersion) headers["LinkedIn-Version"] = "202401";

  const res  = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`LI ${res.status} [${path}]: ${text.slice(0, 400)}`);
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

// The date a snapshot is filed under: the server's own calendar day (the
// server runs in Indian time, as do the people reading the dashboard). A UTC
// date would file a 3 am sync under the previous day.
function localDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Pages the user has switched off on the dashboard (all_orgs[].hidden). They
// are left out of syncs and of the "All pages" figures, but their history
// stays in the tables in case they are switched back on.
function hiddenOrgIds(t) {
  return (t?.all_orgs || []).filter(o => o?.hidden).map(o => String(o.id));
}

// Parses the dates LinkedIn's follower export uses without going through the
// Date constructor, whose local-time parse of "MM/DD/YYYY" lands on the
// previous day once converted to UTC on a server east of Greenwich.
function parseExportDate(raw) {
  const s = String(raw || "").trim();
  let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`; // LinkedIn: MM/DD/YYYY
  if ((m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/))) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;  // DD-MM-YYYY
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return localDate(d);
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

    // Fetch ALL admin orgs (any role — ADMINISTRATOR, CONTENT_ADMIN, etc.)
    let orgs = [];
    try {
      const aclData = await liGet("/organizationAcls", access_token, {
        q: "roleAssignee", count: 50,
      });
      const seen = new Set();
      for (const el of aclData?.elements || []) {
        const urn = el.organization;
        const id  = urn?.split(":").pop();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        let name = `Org ${id}`;
        try {
          const info = await liGet(`/organizations/${id}`, access_token);
          name = info?.localizedName || info?.name?.localized?.en_US || name;
        } catch { /* keep default name */ }
        orgs.push({ id, name, urn, role: el.role });
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
    console.error("exchange-token:", err);
    res.status(500).json({ message: "Failed to complete LinkedIn authorization" });
  }
});

// ─── 2. Refresh org list (re-query ACLs without re-authorizing) ──────────────

router.post("/refresh-orgs", async (req, res) => {
  try {
    const t     = await getStoredToken();
    const token = t.access_token;

    const aclData = await liGet("/organizationAcls", token, { q: "roleAssignee", count: 50 });
    const seen = new Set();
    const orgs = [];
    for (const el of aclData?.elements || []) {
      const urn = el.organization;
      const id  = urn?.split(":").pop();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      let name = `Org ${id}`;
      try {
        const info = await liGet(`/organizations/${id}`, token);
        name = info?.localizedName || info?.name?.localized?.en_US || name;
      } catch { /* keep default */ }
      const hidden = (t.all_orgs || []).find(o => String(o.id) === id)?.hidden === true;
      orgs.push({ id, name, urn, role: el.role, ...(hidden ? { hidden } : {}) });
    }

    const { error } = await supabase
      .from("linkedin_tokens")
      .update({ all_orgs: orgs })
      .eq("id", t.id);

    if (error) {
      console.error("refresh-orgs update:", error);
      return res.status(500).json({ message: "Failed to refresh LinkedIn organizations" });
    }
    res.json({ success: true, orgs, count: orgs.length });
  } catch (err) {
    console.error("refresh-orgs:", err);
    res.status(500).json({ message: "Failed to refresh LinkedIn organizations" });
  }
});

// ─── 3. Select org (after picker) ────────────────────────────────────────────

router.post("/select-org", async (req, res) => {
  const { orgId, orgName, orgUrn } = req.body;
  if (!orgId) return res.status(400).json({ message: "orgId required" });
  try {
    // An update without .eq() would rewrite every stored token row — order()
    // and limit() do not narrow an update in PostgREST.
    const t = await getStoredToken();
    const { error } = await supabase.from("linkedin_tokens")
      .update({ org_id: orgId, org_name: orgName, org_urn: orgUrn })
      .eq("id", t.id);

    if (error) {
      console.error("select-org update:", error);
      return res.status(500).json({ message: "Failed to select LinkedIn organization" });
    }
    res.json({ success: true });
  } catch (err) {
    console.error("select-org:", err);
    res.status(500).json({ message: "Failed to select LinkedIn organization" });
  }
});

// ─── Show or hide a page ─────────────────────────────────────────────────────
// The connected LinkedIn account may administer pages that have nothing to do
// with this dashboard. A hidden page is skipped by the sync and left out of the
// "All pages" figures; its rows stay in the tables.

router.put("/orgs/:id", async (req, res) => {
  const id = String(req.params.id || "");
  const hidden = req.body?.hidden === true;
  try {
    const t = await getStoredToken();
    const orgs = (t.all_orgs || []).map(o => {
      if (String(o.id) !== id) return o;
      const { hidden: _old, ...rest } = o;
      return hidden ? { ...rest, hidden: true } : rest;
    });
    if (!orgs.some(o => String(o.id) === id)) return res.status(404).json({ message: "Page not found" });
    if (!orgs.some(o => !o.hidden)) return res.status(400).json({ message: "At least one page has to stay visible" });
    const { error } = await supabase.from("linkedin_tokens").update({ all_orgs: orgs }).eq("id", t.id);
    if (error) throw error;
    res.json({ success: true, orgs });
  } catch (err) {
    console.error("orgs update:", err);
    res.status(500).json({ message: "Failed to update the page" });
  }
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

router.delete("/disconnect", async (req, res) => {
  await supabase.from("linkedin_tokens").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  res.json({ success: true });
});

// ─── 5. Debug — raw API response for one org ─────────────────────────────────

router.get("/debug", async (req, res) => {
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

    // Get 3 posts first so we can test share stats with real URNs
    const ugcRaw   = await liGetRaw("/ugcPosts", token, `q=authors&authors=List(${encodeURIComponent(orgUrn)})&sortBy=LAST_MODIFIED&count=3`, true).catch(e => ({ elements: [], _err: e.message }));
    const postUrns = (ugcRaw?.elements || []).map(p => p.id).filter(Boolean);
    const ugcList  = postUrns.map(u => encodeURIComponent(u)).join(",");

    const [follower, followerSnap, page, shareList] = await Promise.allSettled([
      liGet("/organizationalEntityFollowerStatistics", token, { q: "organizationalEntity", organizationalEntity: orgUrn, ...timeP }),
      liGet("/organizationalEntityFollowerStatistics", token, { q: "organizationalEntity", organizationalEntity: orgUrn }),
      liGet("/organizationPageStatistics",             token, { q: "organization", organization: orgUrn, ...timeP }),
      ugcList.length
        ? liGetRaw("/organizationalEntityShareStatistics", token,
            `q=organizationalEntity&organizationalEntity=${encodeURIComponent(orgUrn)}&ugcPosts=List(${ugcList})`)
        : Promise.resolve({ elements: [], _note: "no posts to test" }),
    ]);

    const ok  = r => r.status === "fulfilled" ? r.value : { error: r.reason?.message };
    const cnt = r => r.status === "fulfilled" ? r.value?.elements?.length : `err: ${r.reason?.message?.slice(0,120)}`;

    res.json({
      org, orgUrn,
      follower_timeseries: { elements: cnt(follower),     sample: ok(follower)?.elements?.[0],    error: ok(follower)?.error },
      follower_snapshot:   { elements: cnt(followerSnap), sample: ok(followerSnap)?.elements?.[0], error: ok(followerSnap)?.error },
      page_timeseries:     { elements: cnt(page),         sample: ok(page)?.elements?.[0],         error: ok(page)?.error },
      posts:               { elements: ugcRaw?.elements?.length, sample: ugcRaw?.elements?.[0]?.id, error: ugcRaw?._err },
      share_with_ugclist:  { elements: cnt(shareList),    sample: ok(shareList)?.elements?.[0],    error: ok(shareList)?.error,
                             tested_urns: postUrns },
    });
  } catch (err) {
    console.error("debug:", err);
    res.status(500).json({ message: "Failed to fetch LinkedIn debug data" });
  }
});

// ─── 6. Sync — loops ALL orgs ─────────────────────────────────────────────────

router.post("/sync", async (req, res) => {
  try {
    const t      = await getStoredToken();
    const token  = t.access_token;
    const allOrgs = t.all_orgs?.length
      ? t.all_orgs
      : [{ id: t.org_id, name: t.org_name, urn: t.org_urn }];

    if (!allOrgs.length || !allOrgs[0]?.id) {
      return res.status(400).json({ message: "No organizations found. Please reconnect." });
    }

    const summary = {};
    const hidden  = new Set(hiddenOrgIds(t));
    const today   = localDate();

    for (const org of allOrgs) {
      if (hidden.has(String(org.id))) continue;
      const orgId  = org.id;
      const orgUrn = org.urn || `urn:li:organization:${orgId}`;
      const orgName = org.name || orgId;
      const r = { follower: 0, page: 0, posts: 0, errors: [] };

      // ── Followers: today's count ─────────────────────────────────────────
      // LinkedIn only lets this app read the current follower count. The
      // day-by-day history (organizationalEntityFollowerStatistics with a time
      // range) answers 403 "Unpermitted fields" for apps without the Marketing
      // Developer Platform, so the history is built from one snapshot a day
      // (see services/linkedinScheduler.js) plus imports of LinkedIn's own
      // follower export. networkSizes is the count shown on the page itself;
      // the statistics call is kept as a fallback only.
      try {
        let total = 0;
        try {
          const ns = await liGet(`/networkSizes/${encodeURIComponent(orgUrn)}`, token, {
            edgeType: "CompanyFollowedByMember",
          });
          total = ns?.firstDegreeSize || 0;
        } catch (e) { r.errors.push(`Followers: ${e.message}`); }

        if (!total) {
          try {
            const snap = await liGet("/organizationalEntityFollowerStatistics", token, {
              q: "organizationalEntity", organizationalEntity: orgUrn,
            });
            const tc = snap?.elements?.[0]?.totalFollowerCounts || {};
            total = (tc.organicFollowerCount || 0) + (tc.paidFollowerCount || 0);
          } catch (e) { r.errors.push(`Followers (fallback): ${e.message}`); }
        }

        if (total > 0) {
          // organic = total, paid = 0 marks a sync row: LinkedIn gives no
          // organic/paid split of the total. Import rows look different (see
          // /import-followers) and the dashboard tells the two apart.
          const { error } = await supabase.from("linkedin_follower_stats").upsert(
            [{ date: today, org_id: orgId, org_name: orgName,
               total_followers: total, organic_followers: total, paid_followers: 0 }],
            { onConflict: "date,org_id" }
          );
          if (error) r.errors.push(`Followers: could not save (${error.message})`);
          else r.follower = 1;
        } else {
          r.errors.push("Followers: LinkedIn returned no follower count for this page");
        }
      } catch (e) { r.errors.push(`Followers: ${e.message}`); }

      // ── Page views: running counter ──────────────────────────────────────
      // Same restriction: no day-by-day page views, only the counter LinkedIn
      // keeps for the page. Each sync stores the counter as of that day; the
      // dashboard turns the difference between two syncs into views per day.
      // LinkedIn reports no unique-visitor figure here, so that stays 0.
      try {
        const snap = await liGet("/organizationPageStatistics", token, {
          q: "organization", organization: orgUrn,
        });
        const el0  = snap?.elements?.[0];
        const views = el0?.totalPageStatistics?.views?.allPageViews;
        if (views?.pageViews) {
          const { error } = await supabase.from("linkedin_page_analytics").upsert(
            [{ date: today, org_id: orgId, org_name: orgName,
               page_views: views.pageViews || 0, unique_visitors: views.uniquePageViews || 0,
               impressions: 0, clicks: 0 }],
            { onConflict: "date,org_id" }
          );
          if (error) r.errors.push(`Page views: could not save (${error.message})`);
          else r.page = 1;
        } else {
          r.errors.push("Page views: LinkedIn returned no page statistics for this page");
        }
      } catch (e) { r.errors.push(`Page views: ${e.message}`); }

      // ── Posts + share stats ───────────────────────────────────────────────
      try {
        const ugcRaw = await liGetRaw(
          "/ugcPosts", token,
          `q=authors&authors=List(${encodeURIComponent(orgUrn)})&sortBy=LAST_MODIFIED&count=50`,
          true  // LinkedIn-Version header required for ugcPosts
        );
        const posts = ugcRaw?.elements || [];
        if (!posts.length) r.errors.push("Posts: 0 returned");

        // Posts from ugcPosts endpoint return urn:li:share: URNs (not urn:li:ugcPost:)
        // Use shares=List(...) param, not ugcPosts=List(...)
        let shareMap = {};
        const BATCH = 20;
        for (let bi = 0; bi < posts.length; bi += BATCH) {
          const batch = posts.slice(bi, bi + BATCH);

          // Group by URN type — share URNs → shares param, ugcPost URNs → ugcPosts param
          const byParam = {};
          batch.forEach(p => {
            const param = p.id?.includes(":ugcPost:") ? "ugcPosts" : "shares";
            if (!byParam[param]) byParam[param] = [];
            byParam[param].push(p);
          });

          for (const [param, group] of Object.entries(byParam)) {
            const urnList = group.map(p => encodeURIComponent(p.id)).join(",");
            try {
              const batchRaw = await liGetRaw("/organizationalEntityShareStatistics", token,
                `q=organizationalEntity&organizationalEntity=${encodeURIComponent(orgUrn)}&${param}=List(${urnList})`
              );
              for (const el of batchRaw?.elements || []) {
                const key = el.ugcPost || el.share;
                if (key) shareMap[key] = el.totalShareStatistics || {};
              }
            } catch (be) { r.errors.push(`ShareBatch[${bi}/${param}]: ${be.message}`); }
          }
        }
        const mapped = Object.keys(shareMap).length;
        if (mapped === 0 && posts.length > 0) r.errors.push(`ShareStats: 0/${posts.length} mapped`);

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

    res.json({ success: true, summary, skippedHidden: [...hidden] });
  } catch (err) {
    console.error("sync:", err);
    res.status(500).json({ message: "Failed to sync LinkedIn data" });
  }
});

// ─── 7. Data endpoints — filter by ?orgId= or return all ─────────────────────

const hiddenIds = async () => {
  try { return hiddenOrgIds(await getStoredToken()); } catch { return []; }
};
const withoutHidden = (q, ids) =>
  ids.length ? q.not("org_id", "in", `(${ids.map(i => `"${i}"`).join(",")})`) : q;

router.get("/follower-stats", async (req, res) => {
  try {
    let q = supabase.from("linkedin_follower_stats").select("*").order("date", { ascending: true });
    if (req.query.orgId) q = q.eq("org_id", req.query.orgId);
    else q = withoutHidden(q, await hiddenIds());
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error("follower-stats:", err);
    res.status(500).json({ message: "Failed to fetch follower stats" });
  }
});

router.get("/page-analytics", async (req, res) => {
  try {
    let q = supabase.from("linkedin_page_analytics").select("*").order("date", { ascending: true });
    if (req.query.orgId) q = q.eq("org_id", req.query.orgId);
    else q = withoutHidden(q, await hiddenIds());
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error("page-analytics:", err);
    res.status(500).json({ message: "Failed to fetch page analytics" });
  }
});

router.get("/posts", async (req, res) => {
  try {
    let q = supabase.from("linkedin_post_analytics").select("*").order("post_date", { ascending: false });
    if (req.query.orgId) q = q.eq("org_id", req.query.orgId);
    else q = withoutHidden(q, await hiddenIds());
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error("posts:", err);
    res.status(500).json({ message: "Failed to fetch post analytics" });
  }
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
  } catch (err) {
    console.error("ad-analytics:", err);
    res.status(500).json({ message: "Failed to fetch ad analytics" });
  }
});

// ─── AI helper: call Gemini (tries models in order, throws on all failures) ───

const GEMINI_MODELS = [
  "gemini-2.0-flash-lite",   // lowest quota cost, try first
  "gemini-2.0-flash",
  "gemini-1.5-flash-8b",     // smaller model, separate quota pool
  "gemini-1.5-pro",
];

async function geminiGenerate(prompt) {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");
  const { GoogleGenerativeAI } = require("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  let lastErr;
  for (const modelName of GEMINI_MODELS) {
    try {
      const model  = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (e) {
      lastErr = e;
      const msg = e?.message || "";
      // Only fall through to next model on quota/not-found errors
      if (msg.includes("429") || msg.includes("404") || msg.includes("not found")) continue;
      throw e; // non-quota error — surface immediately
    }
  }
  throw lastErr;
}

// ─── AI: Classify posts via Gemini Flash ─────────────────────────────────────

const AI_CATEGORIES = [
  "Event & Invitation", "Company Announcement", "Product",
  "Wishes & Celebrations", "Achievement", "Educational Content",
  "Customer Success", "Recruitment & Careers",
];

// Shared bucket: both AI routes bill against the same paid Gemini quota, so a
// caller cannot dodge the limit by alternating between them.
const aiLimit = rateLimit({ name: "linkedin-ai", windowMs: 60 * 1000, max: 10 });

router.post("/ai-classify", aiLimit, async (req, res) => {
  const { posts } = req.body || {};
  if (!posts?.length) return res.json({ classifications: {}, aiPowered: false });

  if (!process.env.GEMINI_API_KEY) {
    return res.json({ classifications: {}, aiPowered: false,
      message: "GEMINI_API_KEY not configured — using keyword classifier" });
  }

  try {
    const classifications = {};
    const BATCH = 15;

    for (let i = 0; i < posts.length; i += BATCH) {
      const batch = posts.slice(i, i + BATCH);
      const prompt =
        `Classify each LinkedIn post into exactly one category:\n` +
        AI_CATEGORIES.map((n, j) => `${j+1}. ${n}`).join("\n") +
        `\n\nPosts:\n` +
        batch.map(p => `[${p.post_id}] "${(p.text_preview || "").slice(0, 180)}"`).join("\n\n") +
        `\n\nReply ONLY with valid JSON (no other text): {"post_id1": "Category Name", ...}`;

      try {
        const text  = await geminiGenerate(prompt);
        const match = text.match(/\{[\s\S]*\}/);
        if (match) Object.assign(classifications, JSON.parse(match[0]));
      } catch { /* skip malformed batch */ }
    }

    res.json({ classifications, aiPowered: true });
  } catch (err) {
    const isQuota = (err?.message || "").includes("429");
    res.json({
      classifications: {},
      aiPowered: false,
      message: isQuota
        ? "Gemini quota exceeded — using keyword classifier instead"
        : "AI classification unavailable — using keyword classifier instead",
    });
  }
});

// ─── AI: Generate insights via Gemini Flash ───────────────────────────────────

router.get("/ai-insights", aiLimit, async (req, res) => {
  try {
    const orgId  = req.query.orgId;
    const days   = parseInt(req.query.days || "30");
    const cutoff = new Date(Date.now() - days * 864e5).toISOString().split("T")[0];

    let pQ = supabase.from("linkedin_post_analytics").select("*").gte("post_date", cutoff).order("post_date");
    let fQ = supabase.from("linkedin_follower_stats").select("*").gte("date", cutoff).order("date");
    if (orgId) { pQ = pQ.eq("org_id", orgId); fQ = fQ.eq("org_id", orgId); }
    else { const h = await hiddenIds(); pQ = withoutHidden(pQ, h); fQ = withoutHidden(fQ, h); }

    const [{ data: posts }, { data: followers }] = await Promise.all([pQ, fQ]);
    const pp = posts || [], ff = followers || [];

    if (!process.env.GEMINI_API_KEY) {
      return res.json({ aiPowered: false, posts: pp, followers: ff });
    }

    const totalEng = pp.reduce((s,p) => s+(p.reactions||0)+(p.clicks||0)+(p.comments||0)+(p.shares||0), 0);
    const totalImp = pp.reduce((s,p) => s+(p.impressions||0), 0);
    // Followers per page first, then added up: the rows of several pages are
    // interleaved by date, so "last row minus first row" would compare two
    // different pages.
    const byOrg = {};
    for (const r of ff) {
      if (!byOrg[r.org_id]) byOrg[r.org_id] = { first: r.total_followers || 0, last: 0 };
      byOrg[r.org_id].last = r.total_followers || 0;
    }
    const latestF  = Object.values(byOrg).reduce((s, o) => s + o.last, 0);
    const firstF   = Object.values(byOrg).reduce((s, o) => s + o.first, 0);
    const topPost  = [...pp].sort((a,b) => (b.impressions||0)-(a.impressions||0))[0];

    const prompt =
      `You are a LinkedIn marketing analytics expert. Analyze this data and generate 5 specific, data-driven insights.\n\n` +
      `Data (last ${days} days):\n` +
      `- Posts published: ${pp.length}\n` +
      `- Total impressions: ${totalImp}\n` +
      `- Total engagements: ${totalEng}\n` +
      `- Avg engagements/post: ${pp.length ? (totalEng/pp.length).toFixed(1) : 0}\n` +
      `- Engagement rate: ${totalImp ? ((totalEng/totalImp)*100).toFixed(2) : 0}%\n` +
      `- Current followers: ${latestF} (${latestF-firstF >= 0 ? "+" : ""}${latestF-firstF} in period)\n` +
      `- Top post: ${topPost?.impressions || 0} impressions — "${(topPost?.text_preview||"N/A").slice(0, 120)}"\n\n` +
      `Return a JSON array ONLY (no markdown, no code blocks, no extra text):\n` +
      `[{"type":"performance|warning|growth|opportunity|timing","icon":"emoji","color":"#hex","title":"Max 8 words","text":"2 sentences with specific numbers","action":"One specific recommended action"}]\n\n` +
      `Color guide: performance=#10B981, warning=#F59E0B, growth=#0077B5, opportunity=#8B5CF6, timing=#6366F1`;

    const text  = await geminiGenerate(prompt);
    const match = text.match(/\[[\s\S]*?\]/);
    const insights = match ? JSON.parse(match[0]) : [];
    res.json({ aiPowered: true, insights, posts: pp, followers: ff });
  } catch (err) {
    const isQuota = (err?.message || "").includes("429");
    // Return rule-based fallback instead of crashing
    res.json({
      aiPowered: false,
      insights: [],
      posts: [],
      followers: [],
      message: isQuota
        ? "Gemini quota exceeded — showing rule-based insights"
        : "AI insights unavailable — showing rule-based insights",
    });
  }
});

// ─── Import historical follower data from LinkedIn CSV/Excel export ───────────
const multer = require("multer");
const XLSX   = require("xlsx");
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post("/import-followers", upload.single("file"), async (req, res) => {
  try {
    const { orgId, orgName } = req.body;
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    if (!orgId)   return res.status(400).json({ error: "orgId is required" });

    // Parse workbook (handles both .csv and .xlsx)
    const wb    = XLSX.read(req.file.buffer, { type: "buffer", cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const raw   = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });

    // Find the header row (the row that contains "Date")
    let headerIdx = -1;
    let headers   = [];
    for (let i = 0; i < raw.length; i++) {
      const row = raw[i] || [];
      const idx = row.findIndex(c => String(c).toLowerCase().trim() === "date");
      if (idx !== -1) { headerIdx = i; headers = row.map(c => String(c).toLowerCase().trim()); break; }
    }
    if (headerIdx === -1) return res.status(400).json({ error: "Could not find a 'Date' column in the file. Please export directly from LinkedIn Analytics → Followers → Export." });

    // Detect organic/paid/total columns
    const dateCol    = headers.findIndex(h => h === "date");
    const organicCol = headers.findIndex(h => h.includes("organic"));
    const paidCol    = headers.findIndex(h => h.includes("paid") || h.includes("sponsor"));
    const newTotalCol= headers.findIndex(h => (h.includes("new") || h.includes("total")) && !h.includes("organic") && !h.includes("paid"));

    // Parse data rows
    const dataRows = raw.slice(headerIdx + 1).filter(r => r && String(r[dateCol] || "").trim());

    const parsed = dataRows.map(row => {
      const dateISO = parseExportDate(row[dateCol]);
      if (!dateISO) return null;
      const organic = Math.abs(parseInt(organicCol >= 0 ? row[organicCol] : (newTotalCol >= 0 ? row[newTotalCol] : 0)) || 0);
      const paid    = Math.abs(parseInt(paidCol    >= 0 ? row[paidCol]    : 0) || 0);
      return { date: dateISO, organic, paid };
    }).filter(Boolean).sort((a, b) => a.date > b.date ? 1 : -1);

    if (!parsed.length) return res.status(400).json({ error: "No valid data rows found. Ensure the file has Date + follower columns." });

    // The export lists new followers per day. Turn it into running totals…
    let runOrg = 0, runPaid = 0;
    const daily = parsed.map(r => {
      runOrg  += r.organic;
      runPaid += r.paid;
      return { date: r.date, runOrg, runPaid, runTotal: runOrg + runPaid };
    });

    // …and pin them to a follower count the sync has read from LinkedIn.
    // Sync rows carry organic = total. The anchor is the sync row closest to
    // the end of the export, preferring one inside the exported range where
    // the two agree on the same day; the running total on that day is set
    // equal to it and every other day shifts by the same amount. Anchoring to
    // the newest sync row regardless of date, as this used to do, pushed the
    // whole export up by the followers gained since it ended.
    const { data: syncRows } = await supabase
      .from("linkedin_follower_stats")
      .select("date, total_followers, organic_followers")
      .eq("org_id", orgId)
      .order("date", { ascending: true });
    const syncDates = new Set();
    const anchors   = [];
    for (const r of syncRows || []) {
      if ((r.total_followers || 0) > 0 && r.organic_followers === r.total_followers) {
        syncDates.add(r.date);
        anchors.push(r);
      }
    }
    const firstDay = daily[0].date;
    const lastDay  = daily.at(-1).date;
    const dayNum   = d => Math.round(new Date(d + "T00:00:00Z").getTime() / 864e5);
    const anchor   = anchors
      .map(r => ({ r, score: Math.abs(dayNum(r.date) - dayNum(lastDay)) + (r.date >= firstDay && r.date <= lastDay ? 0 : 10000) }))
      .sort((a, b) => a.score - b.score)[0]?.r || null;
    let offset = 0;
    if (anchor) {
      const at = [...daily].reverse().find(d => d.date <= anchor.date) || daily[0];
      offset = anchor.total_followers - at.runTotal;
    }

    // Days the sync has already measured keep the measured count.
    const upsertRows = daily
      .filter(r => !syncDates.has(r.date))
      .map(r => ({
        date:              r.date,
        org_id:            orgId,
        org_name:          orgName || orgId,
        organic_followers: r.runOrg,
        paid_followers:    r.runPaid,
        total_followers:   Math.max(0, r.runTotal + offset),
      }));

    let inserted = 0;
    for (let i = 0; i < upsertRows.length; i += 100) {
      const batch = upsertRows.slice(i, i + 100);
      const { error } = await supabase
        .from("linkedin_follower_stats")
        .upsert(batch, { onConflict: "date,org_id" });
      if (!error) inserted += batch.length;
      else console.error("import-followers upsert error:", error.message);
    }

    const knownTotal = anchor?.total_followers || 0;
    res.json({
      success:   true,
      inserted,
      dateRange: { from: daily[0]?.date, to: daily.at(-1)?.date },
      offset,
      knownTotal,
      anchorDate: anchor?.date || null,
      keptSyncDays: daily.length - upsertRows.length,
    });
  } catch (e) {
    console.error("import-followers error:", e);
    res.status(500).json({ error: "Failed to import follower data" });
  }
});

// ─── Deduplication helper ─────────────────────────────────────────────────────
// Groups follower_stats by (date, org_id), keeps the row with the highest
// total_followers (or latest id on tie), deletes the rest.

async function dedupFollowerStats() {
  const { data: allRows, error } = await supabase
    .from("linkedin_follower_stats")
    .select("id, date, org_id, total_followers")
    .order("date", { ascending: true });

  if (error || !allRows) {
    console.error("dedupFollowerStats select:", error);
    return { deleted: 0, error: error?.message };
  }

  const groups = {};
  for (const row of allRows) {
    const key = `${row.date}__${row.org_id}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  }

  const toDelete = [];
  for (const rows of Object.values(groups)) {
    if (rows.length <= 1) continue;
    // Keep the row with the highest total; on a tie keep the id that sorts last
    // as a string, since ids are UUIDs and would subtract to NaN.
    rows.sort((a, b) =>
      (b.total_followers - a.total_followers) || String(b.id).localeCompare(String(a.id))
    );
    toDelete.push(...rows.slice(1).map(r => r.id));
  }

  if (!toDelete.length) return { deleted: 0 };

  let deleted = 0;
  const BATCH = 100;
  for (let i = 0; i < toDelete.length; i += BATCH) {
    const { error: delErr } = await supabase
      .from("linkedin_follower_stats")
      .delete()
      .in("id", toDelete.slice(i, i + BATCH));
    if (!delErr) deleted += toDelete.slice(i, i + BATCH).length;
    else console.error("dedup delete error:", delErr.message);
  }

  return { deleted };
}

// ─── Dedup endpoint ───────────────────────────────────────────────────────────

router.post("/dedup-followers", async (req, res) => {
  try {
    const result = await dedupFollowerStats();
    res.json({ success: true, ...result });
  } catch (e) {
    console.error("dedup-followers:", e);
    res.status(500).json({ error: "Failed to deduplicate follower stats" });
  }
});

module.exports = router;
