const express = require("express");

const router = express.Router();

router.post("/mkt-ticket", async (req, res) => {

  try {

    console.log("HEADERS:", req.headers);

    console.log("BODY:", req.body);

    console.log("QUERY:", req.query);

    console.log("RAW BODY TYPE:", typeof req.body);

    res.status(200).json({
      success: true
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