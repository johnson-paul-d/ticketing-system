const express = require("express");

const router = express.Router();

const Ticket = require("../models/Ticket");


// =====================================
// GET ALL TICKETS
// =====================================
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


// =====================================
// GET SINGLE TICKET
// SUPPORTS UUID + MONGO _id
// =====================================
router.get("/:id", async (req, res) => {

  try {

    const ticketId =
      req.params.id;

    console.log(
      "Fetching ticket:",
      ticketId
    );

    let ticket = null;

    // =====================================
    // TRY UUID FIELD
    // =====================================
    ticket =
      await Ticket.findOne({
        id: ticketId,
      });

    // =====================================
    // TRY MONGO _id
    // =====================================
    if (!ticket) {

      try {

        ticket =
          await Ticket.findById(
            ticketId
          );

      } catch (err) {

        console.log(
          "Not Mongo ObjectId"
        );
      }
    }

    // =====================================
    // NOT FOUND
    // =====================================
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


// =====================================
// CREATE TICKET
// =====================================
router.post("/", async (req, res) => {

  try {

    const ticket =
      await Ticket.create(
        req.body
      );

    req.io.emit(
      "ticketCreated",
      ticket
    );

    res.status(201).json(
      ticket
    );

  } catch (error) {

    console.log(error);

    res.status(500).json({
      message:
        "Failed to create ticket",
    });
  }
});


// =====================================
// UPDATE TICKET
// SUPPORTS UUID + MONGO _id
// =====================================
router.put("/:id", async (req, res) => {

  try {

    const ticketId =
      req.params.id;

    console.log(
      "Updating ticket:",
      ticketId
    );

    let ticket = null;

    // =====================================
    // TRY UUID FIELD
    // =====================================
    ticket =
      await Ticket.findOne({
        id: ticketId,
      });

    // =====================================
    // TRY MONGO _id
    // =====================================
    if (!ticket) {

      try {

        ticket =
          await Ticket.findById(
            ticketId
          );

      } catch (err) {

        console.log(
          "Not Mongo ObjectId"
        );
      }
    }

    // =====================================
    // NOT FOUND
    // =====================================
    if (!ticket) {

      return res.status(404).json({
        message:
          "Ticket not found",
      });
    }

    // =====================================
    // UPDATE FIELDS
    // =====================================
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


// =====================================
// DELETE TICKET
// SUPPORTS UUID + MONGO _id
// =====================================
router.delete("/:id", async (req, res) => {

  try {

    const ticketId =
      req.params.id;

    console.log(
      "Deleting ticket:",
      ticketId
    );

    let ticket = null;

    // =====================================
    // TRY UUID FIELD
    // =====================================
    ticket =
      await Ticket.findOne({
        id: ticketId,
      });

    // =====================================
    // TRY MONGO _id
    // =====================================
    if (!ticket) {

      try {

        ticket =
          await Ticket.findById(
            ticketId
          );

      } catch (err) {

        console.log(
          "Not Mongo ObjectId"
        );
      }
    }

    // =====================================
    // NOT FOUND
    // =====================================
    if (!ticket) {

      return res.status(404).json({
        message:
          "Ticket not found",
      });
    }

    await ticket.deleteOne();

    req.io.emit(
      "ticketDeleted",
      ticketId
    );

    res.json({
      message:
        "Ticket deleted successfully",
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