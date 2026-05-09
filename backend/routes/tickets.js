const express = require("express");

const multer = require("multer");

const { v4: uuidv4 } = require("uuid");

const {
  readTickets,
  writeTickets,
} = require("../services/excelService");

const {
  readUsers,
} = require("../services/userService");

const sendMail = require(
  "../services/mailService"
);

const router = express.Router();


// ======================================
// MULTER CONFIG
// ======================================
const storage = multer.diskStorage({
  destination: function (
    req,
    file,
    cb
  ) {
    cb(null, "uploads/");
  },

  filename: function (
    req,
    file,
    cb
  ) {
    cb(
      null,
      Date.now() +
        "-" +
        file.originalname
    );
  },
});

const upload = multer({
  storage,
});


// ======================================
// GET ALL TICKETS
// ======================================
router.get("/", (req, res) => {
  try {
    const tickets = readTickets();

    res.json(tickets);
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message:
        "Failed to fetch tickets",
    });
  }
});


// ======================================
// GET SINGLE TICKET
// ======================================
router.get("/:id", (req, res) => {
  try {
    const tickets = readTickets();

    const ticket = tickets.find(
      (t) =>
        t.id === req.params.id
    );

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
        "Failed to fetch ticket",
    });
  }
});


// ======================================
// CREATE TICKET
// ======================================
router.post(
  "/",
  upload.single("attachment"),
  (req, res) => {
    try {
      const tickets =
        readTickets();

      const newTicket = {
        id: uuidv4(),

        title:
          req.body.title || "",

        description:
          req.body.description ||
          "",

        priority:
          req.body.priority ||
          "Medium",

        category:
          req.body.category ||
          "",

        division:
          req.body.division ||
          "CPS",

        dueDate:
          req.body.dueDate || "",

        status: "Open",

        assigned:
          "Unassigned",

        attachment: req.file
          ? req.file.filename
          : "",

        createdBy:
          req.body.createdBy ||
          "",

        createdByName:
          req.body.createdByName ||
          "",

        createdAt:
          new Date().toLocaleString(),

        updatedAt:
          new Date().toLocaleString(),

        resolvedAt: "",

        comments:
          JSON.stringify([]),

        dueDateHistory:
          JSON.stringify([]),

        history: JSON.stringify([
          {
            action:
              "Ticket Created",

            changedBy:
              req.body
                .createdByName ||
              "System",

            time:
              new Date().toLocaleString(),
          },
        ]),
      };

      tickets.push(newTicket);

      writeTickets(tickets);

      if (req.io) {
        req.io.emit(
          "ticketCreated",
          newTicket
        );
      }

      res.json({
        message:
          "Ticket created",

        ticket: newTicket,
      });
    } catch (error) {
      console.log(error);

      res.status(500).json({
        message:
          "Failed to create ticket",
      });
    }
  }
);


// ======================================
// UPDATE TICKET
// ======================================
router.put("/:id", async (req, res) => {
  try {
    const tickets =
      readTickets();

    const index =
      tickets.findIndex(
        (t) =>
          t.id === req.params.id
      );

    if (index === -1) {
      return res.status(404).json({
        message:
          "Ticket not found",
      });
    }

    const oldTicket =
      tickets[index];

    // ======================================
    // DELETE RESTRICTION
    // ======================================
    if (
      req.body.deleteRequest &&
      req.body.role !==
        "Admin"
    ) {
      return res.status(403).json({
        message:
          "Only admin can delete tickets",
      });
    }

    // ======================================
    // APPROVAL FLOW
    // ======================================
    if (
      req.body.status ===
        "Resolved" &&
      req.body.role !==
        "Admin"
    ) {
      req.body.status =
        "Waiting For Approval";

      await sendMail({
to:
  process.env.ADMIN_EMAIL
    .split(","),

        subject:
          "Ticket Waiting For Approval",

        text: `
Ticket:
${oldTicket.title}

Resolved By:
${req.body.changedBy}

Please review and approve.
`,
      });
    }

    // ======================================
    // ONLY ADMIN CAN COMPLETE
    // ======================================
    if (
      req.body.status ===
        "Completed" &&
      req.body.role !==
        "Admin"
    ) {
      return res.status(403).json({
        message:
          "Only admin can complete tickets",
      });
    }

    // ======================================
    // HISTORY
    // ======================================
    let history = [];

    try {
      history = JSON.parse(
        oldTicket.history ||
          "[]"
      );
    } catch {
      history = [];
    }

    // ======================================
    // DUE DATE HISTORY
    // ======================================
    let dueDateHistory =
      [];

    try {
      dueDateHistory =
        JSON.parse(
          oldTicket.dueDateHistory ||
            "[]"
        );
    } catch {
      dueDateHistory = [];
    }

    // ======================================
    // TRACK CHANGES
    // ======================================
    Object.keys(req.body).forEach(
      (field) => {
        if (
          oldTicket[field] !==
          req.body[field]
        ) {
          history.push({
            action: `${field} changed`,

            field,

            oldValue:
              oldTicket[field],

            newValue:
              req.body[field],

            changedBy:
              req.body
                .changedBy ||
              "System",

            time:
              new Date().toLocaleString(),
          });

          if (
            field ===
            "dueDate"
          ) {
            dueDateHistory.push({
              oldDate:
                oldTicket.dueDate,

              newDate:
                req.body
                  .dueDate,

              changedBy:
                req.body
                  .changedBy ||
                "System",

              time:
                new Date().toLocaleString(),
            });
          }
        }
      }
    );

    // ======================================
    // RESOLUTION TIME
    // ======================================
    let resolvedAt =
      oldTicket.resolvedAt;

    if (
      req.body.status ===
        "Completed" &&
      oldTicket.status !==
        "Completed"
    ) {
      resolvedAt =
        new Date().toLocaleString();
    }

    // ======================================
    // UPDATE TICKET
    // ======================================
   // ======================================
// UPDATE TICKET
// ======================================
const updatedTicket = {
  ...oldTicket,
  ...req.body,

  resolvedAt,

  updatedAt:
    new Date().toLocaleString(),

  history:
    JSON.stringify(history),

  dueDateHistory:
    JSON.stringify(
      dueDateHistory
    ),
};

tickets[index] =
  updatedTicket;


// ======================================
// SAVE FIRST
// ======================================
writeTickets(tickets);


// ======================================
// ASSIGNMENT EMAIL
// ======================================
try {

  if (
    req.body.assigned &&
    req.body.assigned !==
      oldTicket.assigned &&
    req.body.assigned !==
      "Unassigned"
  ) {

    const users =
      readUsers();

    const assignedUser =
      users.find(
        (u) =>
          u.name ===
          req.body.assigned
      );

    if (
      assignedUser?.email
    ) {

      await sendMail({
        to:
          assignedUser.email,

        subject:
          `New Ticket Assigned - ${updatedTicket.title}`,

        text: `
A ticket has been assigned to you.

Ticket:
${updatedTicket.title}

Ticket ID:
${updatedTicket.id}

Priority:
${updatedTicket.priority}

Assigned By:
${req.body.changedBy}

Status:
${updatedTicket.status}

Open Ticket:
https://mktg-ticketing-system.vercel.app/tickets/${updatedTicket.id}
        `,
      });

      console.log(
        "Assignment email sent"
      );
    }
  }

} catch (mailError) {

  console.log(
    "ASSIGNMENT MAIL ERROR:",
    mailError
  );
}
writeTickets(tickets);
    if (req.io) {
      req.io.emit(
        "ticketUpdated",
        tickets[index]
      );
    }

    res.json({
      message:
        "Ticket updated",

      ticket:
        tickets[index],
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message:
        "Failed to update ticket",
    });
  }
});


// ======================================
// DELETE TICKET
// ======================================
router.delete("/:id", (req, res) => {
  try {
    const tickets =
      readTickets();

    if (
      req.body.role !==
      "Admin"
    ) {
      return res.status(403).json({
        message:
          "Only admin can delete tickets",
      });
    }

    const filtered =
      tickets.filter(
        (t) =>
          t.id !==
          req.params.id
      );

    writeTickets(filtered);

    if (req.io) {
      req.io.emit(
        "ticketDeleted",
        req.params.id
      );
    }

    res.json({
      message:
        "Ticket deleted",
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message:
        "Delete failed",
    });
  }
});


// ======================================
// DELETE TICKET
// ======================================
router.delete(
  "/:id",
  async (req, res) => {

    try {

      const { id } =
        req.params;

      const {
        deletedBy,
        role,
      } = req.body;

      let tickets =
        readTickets();

      const ticket =
        tickets.find(
          (t) =>
            t.id == id
        );

      if (!ticket) {
        return res
          .status(404)
          .json({
            message:
              "Ticket not found",
          });
      }

      // REMOVE
      tickets =
        tickets.filter(
          (t) =>
            t.id != id
        );

      await writeTickets(
        tickets
      );

      // EMAIL ADMIN
      try {

        await sendMail({
to:
  process.env.ADMIN_EMAIL
    .split(","),

          subject:
            `Ticket Deleted - ${ticket.title}`,

          html: `
            <h2>Ticket Deleted</h2>

            <p>
              <strong>Title:</strong>
              ${ticket.title}
            </p>

            <p>
              <strong>ID:</strong>
              ${ticket.id}
            </p>

            <p>
              <strong>Deleted By:</strong>
              ${deletedBy}
            </p>

            <p>
              <strong>Role:</strong>
              ${role}
            </p>

            <p>
              <strong>Status:</strong>
              ${ticket.status}
            </p>
          `,
        });

      } catch (mailError) {

        console.log(
          "DELETE MAIL ERROR:",
          mailError
        );
      }

      res.json({
        success: true,
      });

    } catch (error) {

      console.log(error);

      res.status(500).json({
        message:
          "Delete failed",
      });
    }
  }
);


// ======================================
// ADD COMMENT
// ======================================
router.post(
  "/:id/comment",
  (req, res) => {
    try {
      const tickets =
        readTickets();

      const index =
        tickets.findIndex(
          (t) =>
            t.id ===
            req.params.id
        );

      if (index === -1) {
        return res
          .status(404)
          .json({
            message:
              "Ticket not found",
          });
      }

      const oldTicket =
        tickets[index];

      let comments = [];

      try {
        comments = JSON.parse(
          oldTicket.comments ||
            "[]"
        );
      } catch {
        comments = [];
      }

      comments.push({
        id: uuidv4(),

        user:
          req.body.user,

        role:
          req.body.role,

        message:
          req.body.message,

        time:
          new Date().toLocaleString(),
      });

      let history = [];

      try {
        history = JSON.parse(
          oldTicket.history ||
            "[]"
        );
      } catch {
        history = [];
      }

      history.push({
        action:
          "Comment Added",

        changedBy:
          req.body.user,

        time:
          new Date().toLocaleString(),
      });

      tickets[index] = {
        ...oldTicket,

        comments:
          JSON.stringify(comments),

        history:
          JSON.stringify(history),

        updatedAt:
          new Date().toLocaleString(),
      };

      writeTickets(tickets);

      if (req.io) {
        req.io.emit(
          "commentAdded",
          tickets[index]
        );
      }

      res.json({
        message:
          "Comment added",
      });
    } catch (error) {
      console.log(error);

      res.status(500).json({
        message:
          "Failed to add comment",
      });
    }
  }
);


// ======================================
// ATTACHMENT
// ======================================
router.put(
  "/:id/attachment",
  upload.single("attachment"),
  (req, res) => {
    try {
      const tickets =
        readTickets();

      const index =
        tickets.findIndex(
          (t) =>
            t.id ===
            req.params.id
        );

      if (index === -1) {
        return res
          .status(404)
          .json({
            message:
              "Ticket not found",
          });
      }

      if (!req.file) {
        return res
          .status(400)
          .json({
            message:
              "No file uploaded",
          });
      }

      const oldTicket =
        tickets[index];

      let history = [];

      try {
        history = JSON.parse(
          oldTicket.history ||
            "[]"
        );
      } catch {
        history = [];
      }

      history.push({
        action:
          "Attachment Updated",

        field:
          "attachment",

        oldValue:
          oldTicket.attachment ||
          "",

        newValue:
          req.file.filename,

        changedBy:
          req.body
            .changedBy ||
          "System",

        time:
          new Date().toLocaleString(),
      });

      tickets[index] = {
        ...oldTicket,

        attachment:
          req.file.filename,

        updatedAt:
          new Date().toLocaleString(),

        history:
          JSON.stringify(history),
      };

      writeTickets(tickets);

      if (req.io) {
        req.io.emit(
          "ticketUpdated",
          tickets[index]
        );
      }

      res.json({
        message:
          "Attachment uploaded",

        ticket:
          tickets[index],
      });
    } catch (error) {
      console.log(error);

      res.status(500).json({
        message:
          "Upload failed",
      });
    }
  }
);

module.exports = router;