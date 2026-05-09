const XLSX = require("xlsx");

const path = require("path");

const fs = require("fs");

const filePath = path.join(
  __dirname,
  "../database/tickets.xlsx"
);

// ======================================
// READ TICKETS
// ======================================
const readTickets = () => {
  try {
    if (!fs.existsSync(filePath)) {
      return [];
    }

    const workbook =
      XLSX.readFile(filePath);

    const sheet =
      workbook.Sheets["Tickets"];

    if (!sheet) {
      return [];
    }

    return XLSX.utils.sheet_to_json(
      sheet
    );
  } catch (error) {
    console.log(
      "READ ERROR:",
      error
    );

    return [];
  }
};

// ======================================
// WRITE LOCK
// ======================================
let isWriting = false;

// ======================================
// SAFE WRITE
// ======================================
const writeTickets = async (
  tickets
) => {
  // WAIT IF WRITING
  while (isWriting) {
    await new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          100
        )
    );
  }

  isWriting = true;

  try {
    const workbook =
      XLSX.utils.book_new();

    const worksheet =
      XLSX.utils.json_to_sheet(
        tickets
      );

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "Tickets"
    );

    // TEMP FILE
const tempPath =
  filePath.replace(
    ".xlsx",
    "_temp.xlsx"
  );

    XLSX.writeFile(
      workbook,
      tempPath
    );

    // REPLACE ORIGINAL
    if (
      fs.existsSync(filePath)
    ) {
      fs.unlinkSync(filePath);
    }

    fs.renameSync(
      tempPath,
      filePath
    );

    console.log(
      "EXCEL UPDATED"
    );
  } catch (error) {
    console.log(
      "WRITE ERROR:",
      error
    );
  } finally {
    isWriting = false;
  }
};

module.exports = {
  readTickets,
  writeTickets,
};