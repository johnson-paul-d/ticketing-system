const express = require("express");

const router = express.Router();

const supabase = require("../config/supabase");

router.post("/mkt-ticket", async (req, res) => {

  try {

    console.log("Salesforce Data:", req.body);

    const {
      Title__c,
      Description__c,
      Priority__c,
      Division__c,
      Due_Date__c
    } = req.body;

    const { data, error } = await supabase
      .from("tickets")
      .insert([
        {
          title: Title__c,
          description: Description__c,
          priority: Priority__c,
          division: Division__c,
          due_date: Due_Date__c
        }
      ])
      .select();

    if (error) {
      throw error;
    }

    res.status(200).json({
      success: true,
      ticket: data
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