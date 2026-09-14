// =====================================================
// Google Ads → Sieger portal sync (Google Apps Script)
// =====================================================
// Bound to the Google Sheet that holds the Google Ads exports. Reads the
// "Campaign_analysis" and "Keyword_analysis" tabs and upserts them into the
// portal's database through the portal API.
//
// INCREMENTAL: the script remembers a fingerprint of every row it has sent.
// A run sends only rows that are new or whose figures changed since they were
// last sent — Google's retroactive conversion attribution changes a row's
// fingerprint, so those corrections go through on their own. The first run,
// or a run after "resyncAll", sends everything.
//
// The history lives in a separate, small spreadsheet the script creates for
// itself ("Google Ads sync state") and remembers by id in the script
// properties. It is NOT kept in this workbook: the exports here already sit
// near Google's 10-million-cell limit, and the first attempt to add a hidden
// history tab failed for exactly that reason.
//
// AUTOMATIC: run "installTriggers" once from the editor. It schedules both
// syncs to run every hour and removes any older triggers for them, so running
// it again never doubles up. "uninstallTriggers" removes them.
//
// Setup, once:
//   1. Portal → Admin Panel → API Keys → create a key acting as an admin, with
//      "read-only" UNTICKED, named e.g. "Google Sheets sync". Copy it.
//   2. Script editor → Project Settings → Script Properties → add
//      PORTAL_API_KEY with that value. The key never sits in the code.
//   3. Run "syncAll" once from the editor to authorise the script and load
//      the history, then run "installTriggers".
//
// Failures are logged (Executions page) and, when a batch fails, emailed to
// the account that owns the triggers.

const PORTAL_API = "https://mkttickets.siegerspintech.com/api/google-ads/import";
const BATCH_SIZE = 500;            // rows per request; the API accepts up to 5000
const TIME_BUDGET_MS = 300000;     // stop early rather than hit the 6-minute limit
const SYNC_EVERY_HOURS = 1;        // schedule installed by installTriggers

// One entry per sheet: where the rows come from, how each becomes an API row,
// which columns make up the natural key, and which hidden tab keeps history.
const KINDS = {
  campaign: {
    api: "campaign-analysis",
    sheet: "Campaign_analysis",
    stateSheet: "_sync_campaign",
    keyFields: ["account_id", "campaign", "report_date"],
    toRow: (r) => {
      if (!r[2] || !r[5]) return null;
      const reportDate = toReportDate_(r[5]);
      if (!reportDate) return null;
      return {
        account_id: String(r[0] || ""),
        account_name: String(r[1] || ""),
        campaign: String(r[2] || ""),
        status: String(r[3] || ""),
        channel_type: String(r[4] || ""),
        report_date: reportDate,
        clicks: Number(r[6]) || 0,
        impressions: Number(r[7]) || 0,
        ctr: Number(r[8]) || 0,
        avg_cpc: Number(r[9]) || 0,
        cost: Number(r[10]) || 0,
        conversions: Number(r[11]) || 0,
        cost_per_conversion: Number(r[12]) || 0,
        conversion_rate: Number(r[13]) || 0,
      };
    },
  },
  keyword: {
    api: "keyword-analysis",
    sheet: "Keyword_analysis",
    stateSheet: "_sync_keyword",
    keyFields: ["account_id", "campaign", "ad_group", "keyword", "report_date"],
    toRow: (r) => {
      if (!r[7]) return null;
      const reportDate = toReportDate_(r[7]);
      if (!reportDate) return null;
      return {
        account_id: String(r[0] || ""),
        account_name: String(r[1] || ""),
        campaign: String(r[2] || ""),
        campaign_budget: Number(r[3]) || 0,
        ad_group: String(r[4] || ""),
        keyword: String(r[5] || ""),
        match_type: String(r[6] || ""),
        report_date: reportDate,
        clicks: Number(r[8]) || 0,
        impressions: Number(r[9]) || 0,
        ctr: Number(r[10]) || 0,
        avg_cpc: Number(r[11]) || 0,
        cost: Number(r[12]) || 0,
        conversions: Number(r[13]) || 0,
        cost_per_conversion: Number(r[14]) || 0,
      };
    },
  },
};

// ---------------------------------------------------------------
// Entry points (these are what triggers and the editor call)
// ---------------------------------------------------------------

function syncCampaignAnalysis() { syncKind_("campaign"); }
function syncKeywordAnalysis()  { syncKind_("keyword"); }

function syncAll() {
  syncKind_("campaign");
  syncKind_("keyword");
}

// Forgets the history so the next run sends every row again. Use after the
// database was restored from a backup, or if the portal's figures look stale.
function resyncAll() {
  const store = stateSpreadsheet_();
  Object.values(KINDS).forEach((k) => {
    const s = store.getSheetByName(k.stateSheet);
    if (s) s.clearContents();
  });
  Logger.log("Sync history cleared. The next run sends every row.");
}

// Schedules both syncs. Safe to run again: existing triggers for these
// functions are removed first.
function installTriggers() {
  uninstallTriggers();
  ScriptApp.newTrigger("syncCampaignAnalysis").timeBased().everyHours(SYNC_EVERY_HOURS).create();
  ScriptApp.newTrigger("syncKeywordAnalysis").timeBased().everyHours(SYNC_EVERY_HOURS).create();
  Logger.log(`Installed: both syncs run every ${SYNC_EVERY_HOURS} hour(s).`);
}

function uninstallTriggers() {
  const ours = ["syncCampaignAnalysis", "syncKeywordAnalysis", "syncAll"];
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (ours.indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
  });
}

// ---------------------------------------------------------------
// The sync itself
// ---------------------------------------------------------------

function syncKind_(name) {
  const kind = KINDS[name];
  const started = new Date();

  // Two overlapping runs (a slow hourly run plus a manual one) would race on
  // the history tab. The second simply waits, or gives up after a while.
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    Logger.log(`${name}: another sync is still running; skipped this run.`);
    return;
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(kind.sheet);
    if (!sheet) { Logger.log(`Sheet '${kind.sheet}' not found.`); return; }

    const values = sheet.getDataRange().getValues();
    if (values.length <= 1) { Logger.log(`${name}: no data.`); return; }

    // Current rows, keyed. A key repeated in the sheet keeps its last row, the
    // same rule the API applies.
    const current = new Map();
    values.slice(1).forEach((r) => {
      const row = kind.toRow(r);
      if (!row) return;
      current.set(keyOf_(kind, row), row);
    });

    // What was sent before, and what differs now.
    const history = readState_(ss, kind);
    const pending = [];
    current.forEach((row, key) => {
      const fp = fingerprint_(row);
      if (history.get(key) !== fp) pending.push({ key, fp, row });
    });

    Logger.log(`${name}: ${values.length - 1} sheet rows, ${current.size} unique, ${history.size} previously sent, ${pending.length} new or changed.`);
    if (!pending.length) return;

    // Send in batches; only rows the API confirmed get recorded, so a failed
    // or interrupted batch is simply retried next hour.
    const confirmed = [];
    const failures = [];
    const batches = Math.ceil(pending.length / BATCH_SIZE);
    let stoppedEarly = false;

    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      if (new Date() - started > TIME_BUDGET_MS) {
        stoppedEarly = true;
        Logger.log(`${name}: time budget reached at row ${i} of ${pending.length}; the rest goes next run.`);
        break;
      }
      const batch = pending.slice(i, i + BATCH_SIZE);
      const batchNo = Math.floor(i / BATCH_SIZE) + 1;
      try {
        const result = postBatch_(kind.api, batch.map((p) => p.row));
        const rejectedIdx = new Set((result.rejected || []).map((x) => x.index));
        batch.forEach((p, idx) => { if (!rejectedIdx.has(idx)) confirmed.push(p); });
        if (rejectedIdx.size) {
          Logger.log(`${name} batch ${batchNo}/${batches}: ${rejectedIdx.size} row(s) rejected, e.g. ${JSON.stringify(result.rejected[0])}`);
        }
        Logger.log(`${name} batch ${batchNo}/${batches}: ${result.upserted} upserted.`);
      } catch (err) {
        failures.push(`batch ${batchNo}/${batches}: ${err.message}`);
        Logger.log(`${name} batch ${batchNo}/${batches} FAILED: ${err.message}`);
      }
    }

    // Record what got through. Rows that vanished from the sheet keep their
    // history entry: nothing is deleted from the database, so nothing to
    // forget.
    confirmed.forEach((p) => history.set(p.key, p.fp));
    writeState_(ss, kind, history);

    const elapsed = Math.round((new Date() - started) / 1000);
    Logger.log(`${name}: done in ${elapsed}s — sent ${confirmed.length}, failed ${failures.length} batch(es)${stoppedEarly ? ", stopped early" : ""}.`);

    if (failures.length) notifyFailure_(name, failures);
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------
// History store (a separate spreadsheet)
// ---------------------------------------------------------------

const STATE_ID_PROPERTY = "SYNC_STATE_SPREADSHEET_ID";

// The spreadsheet that holds the history, created on first use and owned by
// whoever ran the script then. Its id is kept in the script properties, so it
// is found again from any trigger. Two columns per tab: key, fingerprint.
function stateSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(STATE_ID_PROPERTY);
  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (e) {
      Logger.log(`History spreadsheet ${id} is not reachable (${e.message}); creating a new one. Every row will be sent once more.`);
    }
  }
  const created = SpreadsheetApp.create("Google Ads sync state (do not edit)");
  props.setProperty(STATE_ID_PROPERTY, created.getId());
  Logger.log(`Created history spreadsheet: ${created.getUrl()}`);
  return created;
}

function readState_(ss, kind) {
  const map = new Map();
  const store = stateSpreadsheet_();
  let sheet = store.getSheetByName(kind.stateSheet);

  // First run after moving the history out of the main workbook: carry over
  // anything the earlier version managed to save in a hidden tab there, then
  // drop that tab so the big workbook stops paying for those cells.
  if (!sheet) {
    const legacy = ss.getSheetByName(kind.stateSheet);
    if (legacy && legacy.getLastRow() > 0) {
      legacy.getRange(1, 1, legacy.getLastRow(), 2).getValues().forEach((r) => {
        if (r[0]) map.set(String(r[0]), String(r[1]));
      });
      Logger.log(`${kind.stateSheet}: carried ${map.size} history rows over from the main workbook.`);
    }
    if (legacy) ss.deleteSheet(legacy);
    return map;
  }

  if (sheet.getLastRow() === 0) return map;
  sheet.getRange(1, 1, sheet.getLastRow(), 2).getValues().forEach((r) => {
    if (r[0]) map.set(String(r[0]), String(r[1]));
  });
  return map;
}

function writeState_(ss, kind, map) {
  const store = stateSpreadsheet_();
  let sheet = store.getSheetByName(kind.stateSheet);
  if (!sheet) {
    sheet = store.insertSheet(kind.stateSheet);
    // A fresh tab is 1000 x 26 cells; keep only what is used so the store
    // stays tiny however many tabs it grows.
    if (sheet.getMaxColumns() > 2) sheet.deleteColumns(3, sheet.getMaxColumns() - 2);
  }
  // The first spreadsheet ever created carries a default "Sheet1"; drop it
  // once a real tab exists so nobody wonders what it is for.
  const stray = store.getSheetByName("Sheet1");
  if (stray && store.getSheets().length > 1) store.deleteSheet(stray);

  const rows = [];
  map.forEach((fp, key) => rows.push([key, fp]));

  // Size the grid to the data: setValues cannot write past the last row.
  const need = Math.max(rows.length, 1);
  const have = sheet.getMaxRows();
  if (have < need) sheet.insertRowsAfter(have, need - have);
  else if (have > need) sheet.deleteRows(need + 1, have - need);

  sheet.clearContents();
  if (rows.length) sheet.getRange(1, 1, rows.length, 2).setValues(rows);
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function keyOf_(kind, row) {
  return kind.keyFields.map((f) => row[f]).join("|");
}

// A fast, stable digest of the row's values. Only change detection depends on
// it, so a (vanishingly unlikely) collision would at worst skip one update
// until the row changes again.
function fingerprint_(row) {
  const s = JSON.stringify(row);
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x9e3779b1) >>> 0;
  }
  return h1.toString(16) + h2.toString(16);
}

function toReportDate_(value) {
  const d = new Date(value);
  if (isNaN(d)) return null;
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function portalApiKey_() {
  const key = PropertiesService.getScriptProperties().getProperty("PORTAL_API_KEY");
  if (!key) throw new Error("Script property PORTAL_API_KEY is not set (Project Settings → Script Properties).");
  return key;
}

function postBatch_(api, rows) {
  const response = UrlFetchApp.fetch(`${PORTAL_API}/${api}`, {
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

function notifyFailure_(name, failures) {
  try {
    const to = Session.getEffectiveUser().getEmail();
    if (!to) return;
    MailApp.sendEmail(
      to,
      `Google Ads sync (${name}): ${failures.length} batch(es) failed`,
      `The hourly Google Ads → portal sync hit errors. Unsent rows are retried automatically next run.\n\n${failures.join("\n")}\n\nExecutions log: script editor → Executions.`
    );
  } catch (e) {
    Logger.log(`Could not send failure email: ${e.message}`);
  }
}
