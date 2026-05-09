const fs = require("fs");

const path = require("path");

const usersPath = path.join(
  __dirname,
  "../database/users.json"
);


// ======================================
// READ USERS
// ======================================
function readUsers() {

  try {

    // CREATE FILE IF MISSING
    if (
      !fs.existsSync(usersPath)
    ) {

      fs.writeFileSync(
        usersPath,
        "[]"
      );
    }

    const data =
      fs.readFileSync(
        usersPath,
        "utf8"
      );

    return JSON.parse(data);

  } catch (error) {

    console.log(
      "READ USERS ERROR:",
      error
    );

    return [];
  }
}


// ======================================
// WRITE USERS
// ======================================
function writeUsers(users) {

  try {

    fs.writeFileSync(
      usersPath,

      JSON.stringify(
        users,
        null,
        2
      )
    );

  } catch (error) {

    console.log(
      "WRITE USERS ERROR:",
      error
    );
  }
}


module.exports = {
  readUsers,
  writeUsers,
};