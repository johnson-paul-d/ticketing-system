const express = require("express");

const router = express.Router();

// Import your Ticket model
const Ticket = require("../models/Ticket");

router.post("/mkt-ticket", async (req, res) => {

  try {

    console.log("Salesforce Query:", req.query);

    const {
      Title__c,
      Description__c,
      Priority__c,
      Division__c,
      Due_Date__c
    } = req.query;

    // Create ticket in DB
    const ticket = await Ticket.create({

      title: Title__c,

      description: Description__c,

      priority: Priority__c,

      division: Division__c,

      dueDate: Due_Date__c,

      source: "Salesforce"

    });

    console.log("Ticket Created:", ticket);

    res.status(200).json({
      success: true,
      ticket
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      success: false,
      error: err.message
    });

  }

});

module.exports = router;