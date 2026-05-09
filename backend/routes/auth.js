const express = require(
  "express"
);

const {
  readUsers,
  writeUsers,
} = require(
  "../services/userService"
);

const router =
  express.Router();


// ======================================
// LOGIN
// ======================================
router.post(
  "/login",
  (req, res) => {
    try {
      const {
        email,
        password,
      } = req.body;

      const users =
        readUsers();

      const user =
        users.find(
          (u) =>
            u.email
              ?.trim()
              .toLowerCase() ===
              email
                ?.trim()
                .toLowerCase() &&
            u.password
              ?.trim() ===
              password?.trim()
        );

      // INVALID
      if (!user) {
        return res
          .status(401)
          .json({
            message:
              "Invalid credentials",
          });
      }

      // DISABLED
      if (
        user.active ===
        false
      ) {
        return res
          .status(403)
          .json({
            message:
              "User disabled by admin",
          });
      }

      // UPDATE ACTIVITY
      const updatedUsers =
        users.map((u) => {
          if (
            u.id === user.id
          ) {
            return {
              ...u,

              lastLogin:
                new Date().toLocaleString(),

              activityCount:
                (u.activityCount ||
                  0) + 1,
            };
          }

          return u;
        });

      writeUsers(
        updatedUsers
      );

      // UPDATED USER
      const updatedUser =
        updatedUsers.find(
          (u) =>
            u.id ===
            user.id
        );

      res.json({
        message:
          "Login successful",

        user: updatedUser,
      });
    } catch (error) {
      console.log(error);

      res
        .status(500)
        .json({
          message:
            "Login failed",
        });
    }
  }
);


// ======================================
// GET TEAM MEMBERS
// ======================================
router.get(
  "/team-members",
  (req, res) => {
    try {
      const users =
        readUsers();

      const members =
        users.filter(
          (u) =>
            u.role ===
              "Team Member" &&
            u.active !==
              false
        );

      res.json(
        members
      );
    } catch (error) {
      console.log(error);

      res
        .status(500)
        .json({
          message:
            "Failed to fetch team members",
        });
    }
  }
);


// ======================================
// GET ACTIVE USERS
// ======================================
router.get(
  "/active-users",
  (req, res) => {
    try {
      const users =
        readUsers();

      const activeUsers =
        users.filter(
          (u) =>
            u.active !==
            false
        );

      res.json(
        activeUsers
      );
    } catch (error) {
      console.log(error);

      res
        .status(500)
        .json({
          message:
            "Failed to fetch active users",
        });
    }
  }
);


// ======================================
// GET USERS BY DIVISION
// ======================================
router.get(
  "/division/:division",
  (req, res) => {
    try {
      const users =
        readUsers();

      const filtered =
        users.filter(
          (u) =>
            u.division ===
              req.params
                .division &&
            u.active !==
              false
        );

      res.json(
        filtered
      );
    } catch (error) {
      console.log(error);

      res
        .status(500)
        .json({
          message:
            "Failed to fetch division users",
        });
    }
  }
);


// ======================================
// USER ACTIVITY SUMMARY
// ======================================
router.get(
  "/activity-summary",
  (req, res) => {
    try {
      const users =
        readUsers();

      const summary =
        users.map(
          (u) => ({
            id: u.id,

            name: u.name,

            role: u.role,

            division:
              u.division,

            activityCount:
              u.activityCount ||
              0,

            lastLogin:
              u.lastLogin ||
              "Never",

            active:
              u.active !==
              false,
          })
        );

      res.json(
        summary
      );
    } catch (error) {
      console.log(error);

      res
        .status(500)
        .json({
          message:
            "Failed to fetch activity summary",
        });
    }
  }
);

module.exports =
  router;