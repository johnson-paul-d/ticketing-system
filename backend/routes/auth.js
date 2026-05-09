const express = require("express");

const router = express.Router();

const User = require("../models/User");


// ==============================
// LOGIN
// ==============================
router.post("/login", async (req, res) => {

  try {

    const {
      email,
      password,
    } = req.body;

    const user =
      await User.findOne({
        email,
      });

    if (!user) {

      return res.status(401).json({
        message:
          "Invalid email",
      });
    }

    if (
      user.password !== password
    ) {

      return res.status(401).json({
        message:
          "Invalid password",
      });
    }

    res.json(user);

  } catch (error) {

    console.log(error);

    res.status(500).json({
      message:
        "Login failed",
    });
  }
});


// ==============================
// TEAM MEMBERS
// IMPORTANT FIX
// ==============================
router.get(
  "/team-members",
  async (req, res) => {

    try {

      const users =
        await User.find({
          role: "Agent",
        }).select(
          "name email role"
        );

      res.json(users);

    } catch (error) {

      console.log(error);

      res.status(500).json({
        message:
          "Failed to fetch team members",
      });
    }
  }
);


// ==============================
// GET USER BY ID
// KEEP THIS BELOW TEAM-MEMBERS
// ==============================
router.get("/:id", async (req, res) => {

  try {

    const user =
      await User.findById(
        req.params.id
      );

    if (!user) {

      return res.status(404).json({
        message:
          "User not found",
      });
    }

    res.json(user);

  } catch (error) {

    console.log(error);

    res.status(500).json({
      message:
        "Failed to fetch user",
    });
  }
});


module.exports = router;