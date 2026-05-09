const fs = require("fs");

const path = require("path");

const filePath = path.join(
  __dirname,
  "../database/users.json"
);

const readUsers = () => {
  try {
    if (
      !fs.existsSync(filePath)
    ) {
      fs.writeFileSync(
        filePath,
        JSON.stringify([])
      );
    }

    const data =
      fs.readFileSync(
        filePath,
        "utf-8"
      );

    return JSON.parse(data);
  } catch (error) {
    console.log(
      "READ USERS ERROR:",
      error
    );

    return [];
  }
};

const writeUsers = (
  users
) => {
  fs.writeFileSync(
    filePath,
    JSON.stringify(
      users,
      null,
      2
    )
  );
};

module.exports = {
  readUsers,
  writeUsers,
};