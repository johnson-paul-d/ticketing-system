// =====================================================
// Google Ads → Sieger portal sync (Google Apps Script)
// =====================================================
// Bound to the Google Sheet that holds the Google Ads exports. Reads the
// "Campaign_analysis" and "Keyword_analysis" tabs and upserts them into the
// portal's database through the portal API. Re-running is safe: a row for the
// same campaign/keyword and date is updated, not duplicated, which is how
// Google's retroactive conversion attribution gets corrected.
//
// Setup, once:
//   1. Portal → Admin Panel → API Keys → create a key acting as an admin, with
//      "read-only" UNTICKED, named e.g. "Google Sheets sync". Copy it.
//   2. In this script editor: Project Settings → Script Properties → add
//      PORTAL_API_KEY with that value. The key never sits in the code.
//   3. Run syncCampaignAnalysis once from the editor to authorise UrlFetchApp,
//      then add time-driven triggers for both functions as before.
//
// The API validates every row, drops columns it does not know, and returns a
// count plus any rows it rejected. Both functions log that.

const PORTAL_API = "https://mkttickets.siegerspintech.com/api/google-ads/import";
const BATCH_SIZE = 500; // rows per request; the API accepts up to 5000
const TIME_BUDGET_MS = 330000; // stop before Apps Script's 6-minute limit

function portalApiKey_() {
  const key = PropertiesService.getScriptProperties().getProperty("PORTAL_API_KEY");
  if (!key) throw new Error("Script property PORTAL_API_KEY is not set (Project Settings → Script Properties).");
  return key;
}

function toReportDate_(value) {
  const d = new Date(value);
  if (isNaN(d)) return null;
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

// Posts one batch. Returns the parsed response, or throws with the server's
// message so the log says what was wrong rather than just the status code.
function postBatch_(kind, rows) {
  const response = UrlFetchApp.fetch(`${PORTAL_API}/${kind}`, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: `Bearer ${portalApiKey_()}` },
    payload: JSON.stringify(rows),
    muteHttpExceptions: true,
  });
  const status = response.getResponseCode();
  const text = response.getContentText();
  let body = {};
  try { body = JSON.parse(text); } catch (e) { /* non-JSON error page */ }
  if (status < 200 || status >= 300) {
    throw new Error(`HTTP ${status}: ${body.message || text.slice(0, 300)}`);
  }
  return body;
}

// Shared driver: dedupe within the sheet, batch, post, log.
function syncRows_(kind, rows) {
  const started = new Date();
  let upserted = 0;
  let rejected = 0;
  let failed = 0;
  const batches = Math.ceil(rows.length / BATCH_SIZE);

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    if (new Date() - started > TIME_BUDGET_MS) {
      Logger.log(`Approaching the time limit; stopped at row ${i} of ${rows.length}. Re-run to continue.`);
      break;
    }
    const batchNo = Math.floor(i / BATCH_SIZE) + 1;
    const batch = rows.slice(i, i + BATCH_SIZE);
    try {
      const result = postBatch_(kind, batch);
      upserted += result.upserted || 0;
      rejected += (result.rejected || []).length;
      if ((result.rejected || []).length) {
        Logger.log(`Batch ${batchNo}/${batches}: ${result.rejected.length} row(s) rejected, e.g. ${JSON.stringify(result.rejected[0])}`);
      }
      Logger.log(`Batch ${batchNo}/${batches}: OK (${result.upserted} upserted) | total ${upserted}`);
    } catch (err) {
      failed++;
      Logger.log(`Batch ${batchNo}/${batches} FAILED: ${err.message}`);
    }
  }

  const elapsed = Math.round((new Date() - started) / 1000);
  Logger.log(`${kind}: done in ${elapsed}s — upserted ${upserted}, rejected ${rejected}, failed batches ${failed}`);
}

function syncCampaignAnalysis() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Campaign_analysis");
  if (!sheet) { Logger.log("Sheet 'Campaign_analysis' not found."); return; }

  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) { Logger.log("No data found."); return; }

  const seen = new Set();
  const rows = [];
  values.slice(1).forEach((row) => {
    if (!row[2] || !row[5]) return;
    const reportDate = toReportDate_(row[5]);
    if (!reportDate) return;
    const key = `${row[0]}|${row[2]}|${reportDate}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({
      account_id: String(row[0] || ""),
      account_name: String(row[1] || ""),
      campaign: String(row[2] || ""),
      status: String(row[3] || ""),
      channel_type: String(row[4] || ""),
      report_date: reportDate,
      clicks: Number(row[6]) || 0,
      impressions: Number(row[7]) || 0,
      ctr: Number(row[8]) || 0,
      avg_cpc: Number(row[9]) || 0,
      cost: Number(row[10]) || 0,
      conversions: Number(row[11]) || 0,
      cost_per_conversion: Number(row[12]) || 0,
      conversion_rate: Number(row[13]) || 0,
    });
  });

  Logger.log(`Sheet rows: ${values.length - 1} | unique rows to upsert: ${rows.length}`);
  if (!rows.length) { Logger.log("No rows to process."); return; }
  syncRows_("campaign-analysis", rows);
}

function syncKeywordAnalysis() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Keyword_analysis");
  if (!sheet) { Logger.log("Sheet 'Keyword_analysis' not found."); return; }

  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) { Logger.log("No data found."); return; }

  const seen = new Set();
  const rows = [];
  values.slice(1).forEach((row) => {
    if (!row[7]) return;
    const reportDate = toReportDate_(row[7]);
    if (!reportDate) return;
    const key = `${row[0]}|${row[2]}|${row[4]}|${row[5]}|${reportDate}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({
      account_id: String(row[0] || ""),
      account_name: String(row[1] || ""),
      campaign: String(row[2] || ""),
      campaign_budget: Number(row[3]) || 0,
      ad_group: String(row[4] || ""),
      keyword: String(row[5] || ""),
      match_type: String(row[6] || ""),
      report_date: reportDate,
      clicks: Number(row[8]) || 0,
      impressions: Number(row[9]) || 0,
      ctr: Number(row[10]) || 0,
      avg_cpc: Number(row[11]) || 0,
      cost: Number(row[12]) || 0,
      conversions: Number(row[13]) || 0,
      cost_per_conversion: Number(row[14]) || 0,
    });
  });

  Logger.log(`Sheet rows: ${values.length - 1} | unique rows to upsert: ${rows.length}`);
  if (!rows.length) { Logger.log("No rows to process."); return; }
  syncRows_("keyword-analysis", rows);
}
