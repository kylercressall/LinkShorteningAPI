const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const db = new sqlite3.Database("./db/database.sqlite");

const singleSql = fs.readFileSync("./db/runsingle.sql", "utf8");

db.run(singleSql);
