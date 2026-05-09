const express = require("express");

const { v4: uuidv4 } = require("uuid");

const {
  readUsers,
  writeUsers,
} = require("../services/userService");

const router = express.Router();


// GET ALL USERS
router.get("/", (req, res) => {
  try {
    const users = readUsers();

    res.json(users);
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message:
        "Failed to fetch users",
    });
  }
});


// CREATE USER
router.post("/", (req, res) => {
  try {
    const users = readUsers();

    const newUser = {
      id: uuidv4(),

      name:
        req.body.name || "",

      email:
        req.body.email || "",

      password:
        req.body.password || "",

      role:
        req.body.role ||
        "User",

      division:
        req.body.division ||
        "CPS",

      active: true,

      createdAt:
        new Date().toLocaleString(),

      lastLogin: "",

      activityCount: 0,
    };

    users.push(newUser);

    writeUsers(users);

    res.json({
      message:
        "User created successfully",

      user: newUser,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message:
        "Failed to create user",
    });
  }
});


// UPDATE USER
router.put("/:id", (req, res) => {
  try {
    const users = readUsers();

    const index =
      users.findIndex(
        (u) =>
          u.id ===
          req.params.id
      );

    if (index === -1) {
      return res.status(404).json({
        message:
          "User not found",
      });
    }

    users[index] = {
      ...users[index],
      ...req.body,
    };

    writeUsers(users);

    res.json({
      message:
        "User updated successfully",

      user: users[index],
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message:
        "Failed to update user",
    });
  }
});


// DELETE USER
router.delete("/:id", (req, res) => {
  try {
    const users = readUsers();

    const filteredUsers =
      users.filter(
        (u) =>
          u.id !==
          req.params.id
      );

    writeUsers(
      filteredUsers
    );

    res.json({
      message:
        "User deleted successfully",
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message:
        "Failed to delete user",
    });
  }
});


// RESET PASSWORD
router.put(
  "/reset-password/:id",
  (req, res) => {
    try {
      const users =
        readUsers();

      const index =
        users.findIndex(
          (u) =>
            u.id ===
            req.params.id
        );

      if (
        index === -1
      ) {
        return res.status(404).json({
          message:
            "User not found",
        });
      }

      users[index].password =
        req.body.password;

      writeUsers(
        users
      );

      res.json({
        message:
          "Password reset successful",
      });
    } catch (error) {
      console.log(
        error
      );

      res.status(500).json({
        message:
          "Failed to reset password",
      });
    }
  }
);

module.exports = router;