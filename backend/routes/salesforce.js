const express = require("express");

const router = express.Router();

router.post("/mkt-ticket", async (req, res) => {

  try {

    console.log("Salesforce Data Received:");

    console.log(req.query);

    res.status(200).json({
      success: true,
      received: req.query
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