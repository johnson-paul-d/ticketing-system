const express = require("express");

const router = express.Router();

const {
  readUsers,
  writeUsers,
} = require("../services/userService");

const { v4: uuidv4 } =
  require("uuid");


// ======================================
// GET USERS
// ======================================
router.get("/", (req, res) => {

  try {

    const users =
      readUsers();

    res.json(users);

  } catch (error) {

    console.log(error);

    res.status(500).json({
      message:
        "Failed to fetch users",
    });
  }
});


// ======================================
// CREATE USER
// ======================================
router.post("/", (req, res) => {

  try {

    const users =
      readUsers();

    const newUser = {
      id: uuidv4(),

      name:
        req.body.name,

      email:
        req.body.email,

      password:
        req.body.password,

      role:
        req.body.role,

      division:
        req.body.division,

      active: true,

      activityCount: 0,

      lastLogin: "Never",
    };

    users.push(newUser);

    writeUsers(users);

    res.json(newUser);

  } catch (error) {

    console.log(error);

    res.status(500).json({
      message:
        "Failed to create user",
    });
  }
});


// ======================================
// UPDATE USER
// ======================================
router.put("/:id", (req, res) => {

  try {

    const users =
      readUsers();

    const updatedUsers =
      users.map((u) => {

        if (
          u.id ===
          req.params.id
        ) {

          return {
            ...u,
            ...req.body,
          };
        }

        return u;
      });

    writeUsers(
      updatedUsers
    );

    res.json({
      message:
        "User updated",
    });

  } catch (error) {

    console.log(error);

    res.status(500).json({
      message:
        "Failed to update user",
    });
  }
});

module.exports = router;