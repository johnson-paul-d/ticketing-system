const express = require("express");

const router = express.Router();

const supabase = require("../config/supabase");
const getISTTime = require("../utils/time");
const { rateLimit } = require("../utils/rateLimit");
const { emitScoped } = require("../utils/realtime");
const { ticketAudience } = require("../utils/ticketTeam");

// =====================================================
// SALESFORCE WEBHOOK
// =====================================================
// Salesforce posts here as an external system, so there is no JWT to verify.
// Access is a shared secret sent in x-webhook-secret instead. The route fails
// closed: with SALESFORCE_WEBHOOK_SECRET unset nothing is accepted, because the
// alternative is an anonymous write path into the tickets table.
const verifyWebhookSecret = (req, res, next) => {
  const expected = process.env.SALESFORCE_WEBHOOK_SECRET;

  if (!expected) {
    console.error(
      "SALESFORCE_WEBHOOK_SECRET is not set — rejecting Salesforce webhook. " +
        "Set it in the backend environment and send it as the x-webhook-secret header."
    );
    return res.status(503).json({ success: false, message: "Integration not configured" });
  }

  const provided = req.get("x-webhook-secret") || "";

  // Compare as fixed-length digests so the check can't be timed character by
  // character, and so differing lengths don't throw.
  const crypto = require("crypto");
  const hash = (v) => crypto.createHash("sha256").update(String(v)).digest();
  if (!crypto.timingSafeEqual(hash(provided), hash(expected))) {
    return res.status(401).json({ success: false, message: "Invalid webhook secret" });
  }

  next();
};

router.post(
  "/mkt-ticket",
  rateLimit({ name: "salesforce", windowMs: 60 * 1000, max: 60 }),
  // Salesforce sends text/plain; parse it here rather than mounting
  // express.text() globally, which would turn req.body into a String on every
  // route in the app.
  express.text({ type: ["text/plain", "application/json"], limit: "100kb" }),
  verifyWebhookSecret,
  async (req, res) => {
    try {
      let payload = req.body;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch {
          return res.status(400).json({ success: false, message: "Body is not valid JSON" });
        }
      }

      if (!payload || typeof payload !== "object") {
        return res.status(400).json({ success: false, message: "Body is not valid JSON" });
      }

      const { Title__c, Description__c, Priority__c, Division__c, Due_Date__c } = payload;

      if (!Title__c || typeof Title__c !== "string") {
        return res.status(400).json({ success: false, message: "Title__c is required" });
      }

      const now = getISTTime();

      const { data, error } = await supabase
        .from("tickets")
        .insert([
          {
            title: String(Title__c).slice(0, 500),
            description: Description__c ? String(Description__c) : null,
            priority: Priority__c || "Medium",
            division: Division__c || null,
            due_date: Due_Date__c || null,
            // Match the shape POST /api/tickets produces, so Salesforce rows
            // aren't a second-class variant the rest of the app mishandles.
            status: "Open",
            allotted_minutes: 0,
            created_by_name: "Salesforce",
            created_at: now,
            updated_at: now,
            tagged_users: [],
            timeline: [
              {
                type: "created",
                action: "Ticket created from Salesforce",
                user: "Salesforce",
                timestamp: now,
              },
            ],
          },
        ])
        .select();

      if (error) throw error;

      const ticket = data?.[0];

      // Keep connected clients in sync the same way the ticket routes do.
      // The row has no assignee or creator, so ticketAudience resolves it to
      // Marketing — which matches this endpoint's /mkt-ticket scope.
      const io = req.app.get("io");
      if (io && ticket) {
        emitScoped(io, "ticketCreated", ticket, await ticketAudience(ticket));
      }

      res.status(200).json({ success: true, id: ticket?.id || null });
    } catch (err) {
      console.error("SALESFORCE WEBHOOK ERROR:", err);
      res.status(500).json({ success: false, message: "Failed to create ticket" });
    }
  }
);

module.exports = router;
