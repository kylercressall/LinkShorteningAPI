const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("../db/database.sqlite");

const tablesSql = fs.readFileSync("./db/tables.sql", "utf8");

db.serialize(() => {
  db.run("PRAGMA foreign_keys = ON");

  db.exec(tablesSql, (err) => {
    if (err) {
      console.error("Error running tables.sql:", err.message);
    } else {
      console.log("Tables created successfully from SQL file.");
    }
  });
});

module.exports = db;
