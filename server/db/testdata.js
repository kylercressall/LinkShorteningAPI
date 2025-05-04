const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const db = new sqlite3.Database("./db/database.sqlite");

const tablesSql = fs.readFileSync("./db/tables.sql", "utf8");
const insertSql = fs.readFileSync("./db/insert.sql", "utf8");

db.serialize(() => {
  // db.run("DROP TABLE users;");
  // db.run("DROP TABLE links;");
  // db.run("DROP TABLE linkstats;");
  db.exec(tablesSql, (err) => {
    if (err) {
      console.error("Error running tables.sql:", err.message);
    } else {
      console.log("Tables created successfully from SQL file.");
    }
  });
  db.exec(insertSql, (err) => {
    if (err) {
      console.error("Error running insert.sql:", err.message);
    } else {
      console.log("Data successfully inserted into tables.");
    }
  });
});
