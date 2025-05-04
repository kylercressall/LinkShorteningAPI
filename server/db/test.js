const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const dbPath = path.resolve(__dirname, "../db/database.sqlite");

if (!fs.existsSync(dbPath)) {
  console.error("Database file not found at:", dbPath);
  process.exit(1);
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Failed to open database:", err.message);
    process.exit(1);
  }
});

const linkid = 9;
const userid = 7;

db.all(
  `
  SELECT * 
  FROM link_stats 
  JOIN links ON links.linkId = link_stats.linkId
  WHERE link_stats.linkId = ? AND links.userOwner = ?
  `,
  [linkid, userid],
  (err, rows) => {
    if (err) {
      console.error("Query error:", err.message);
    } else if (rows.length === 0) {
      console.log("No results found.");
    } else {
      console.log("Query results:", rows);
    }

    db.close();
  }
);
