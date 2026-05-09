const express = require("express");

const router = express.Router();

const Ticket = require("../models/Ticket");


// ==============================
// GET ALL TICKETS
// ==============================
router.get("/", async (req, res) => {

  try {

    const tickets =
      await Ticket.find().sort({
        createdAt: -1,
      });

    res.json(tickets);

  } catch (error) {

    console.log(error);

    res.status(500).json({
      message:
        "Failed to fetch tickets",
    });
  }
});


// ==============================
// GET SINGLE TICKET
// IMPORTANT FIX
// ==============================
router.get("/:id", async (req, res) => {

  try {

    console.log(
      "Fetching ticket:",
      req.params.id
    );

    const ticket =
      await Ticket.findOne({
        id: req.params.id,
      });

    if (!ticket) {

      return res.status(404).json({
        message:
          "Ticket not found",
      });
    }

    res.json(ticket);

  } catch (error) {

    console.log(error);

    res.status(500).json({
      message:
        "Server error",
    });
  }
});


// ==============================
// CREATE TICKET
// ==============================
router.post("/", async (req, res) => {

  try {

    const ticket =
      await Ticket.create(req.body);

    req.io.emit(
      "ticketCreated",
      ticket
    );

    res.status(201).json(ticket);

  } catch (error) {

    console.log(error);

    res.status(500).json({
      message:
        "Failed to create ticket",
    });
  }
});


// ==============================
// UPDATE TICKET
// ==============================
router.put("/:id", async (req, res) => {

  try {

    const ticket =
      await Ticket.findOne({
        id: req.params.id,
      });

    if (!ticket) {

      return res.status(404).json({
        message:
          "Ticket not found",
      });
    }

    Object.assign(
      ticket,
      req.body
    );

    await ticket.save();

    req.io.emit(
      "ticketUpdated",
      ticket
    );

    res.json(ticket);

  } catch (error) {

    console.log(error);

    res.status(500).json({
      message:
        "Failed to update ticket",
    });
  }
});


// ==============================
// DELETE TICKET
// ==============================
router.delete("/:id", async (req, res) => {

  try {

    const ticket =
      await Ticket.findOneAndDelete({
        id: req.params.id,
      });

    if (!ticket) {

      return res.status(404).json({
        message:
          "Ticket not found",
      });
    }

    req.io.emit(
      "ticketDeleted",
      ticket.id
    );

    res.json({
      message:
        "Ticket deleted",
    });

  } catch (error) {

    console.log(error);

    res.status(500).json({
      message:
        "Failed to delete ticket",
    });
  }
});


module.exports = router;