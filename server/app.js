const express = require("express");
const db = require("./db");
const app = express();
const useragent = require("express-useragent");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
require("dotenv").config();

app.use(cookieParser());
app.use(useragent.express());
app.use(express.json());

function findForwardUrlFromDatabase(hosturl) {
  return new Promise((resolve, reject) => {
    var selectquery = `SELECT linkId, forwardToUrl FROM links WHERE hostUrl = ?`;
    db.get(selectquery, [hosturl], (err, row) => {
      // catch errors
      if (err) {
        console.error("Database Error:", err.message);
        reject(err);
        return;
      }

      // make sure we got a result
      if (row) {
        resolve({
          linkId: row.linkId,
          forwardToUrl: row.forwardToUrl,
        });
      } else {
        console.warn("Short link not found!");
        resolve(null);
      }
    });
  });
}

function saveClickToDatabase(linkId, clickInfo) {
  return new Promise((resolve, reject) => {
    insertquery = `INSERT INTO link_stats (linkId, ip, userAgent, referrer, language, browser, platform, os) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(
      insertquery,
      linkId,
      clickInfo.ip,
      clickInfo.userAgent,
      clickInfo.referrer,
      clickInfo.language,
      clickInfo.browser,
      clickInfo.platform,
      clickInfo.os,
      function (err) {
        if (err) {
          console.error("Insert Error:", err.message);
          reject(err);
          return;
        }
        resolve(this.lastID);
      }
    );
  });
}

function addUserToDatabase(username, passwordHash) {
  return new Promise((resolve, reject) => {
    insertquery = `INSERT INTO users (username, passwordHash) VALUES (?, ?)`;
    db.run(insertquery, username, passwordHash);
  });
}

function getHashFromUser(userId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT passwordHash FROM users WHERE userId = ?`,
      userId,
      (err, row) => {
        if (err) {
          console.error("Database Error:", err.message);
          reject(err);
          return;
        }

        if (row) {
          resolve({
            passwordHash: row.passwordHash,
          });
        } else {
          console.warn("user not found!");
          resolve(null);
        }
      }
    );
  });
}

app.get("/", (req, res) => {
  res.send("Link shortening app is " + "running on this server");
  res.end();
});

app.get("/api/users", (req, res) => {
  db.all(`SELECT * FROM users`, [], (err, rows) => {
    if (err) {
      res.status(500).send(err.message);
      return;
    }
    res.json(rows);
  });
});

app.get("/api/links", (req, res) => {
  db.all(`SELECT * FROM links`, [], (err, rows) => {
    if (err) {
      res.status(500).send(err.message);
      return;
    }
    res.json(rows);
  });
});

// Get all of the linkstat entries for a given linkid
app.get("/api/links/:linkid/rawdata", (req, res) => {
  const linkid = req.params.linkid;
  db.all(`SELECT * FROM link_stats WHERE linkId = ?`, [linkid], (err, rows) => {
    if (err) {
      res.status(500).send(err.message);
      return;
    }
    if (rows) {
      res.json(rows);
    } else {
      res.status(200).send("No data or server error");
      res.json(rows);
    }
  });
});

// Get the actual stats of the given link
app.get("/api/links/:linkid/stats", (req, res) => {
  const linkid = req.params.linkid;
  db.all(`SELECT * FROM link_stats WHERE linkId = ?`, [linkid], (err, rows) => {
    console.log(linkid);
    if (err) {
      res.status(500).send(err.message);
      return;
    }
    if (rows.length === 0) {
      console.warn("! ------ No linkstats row data returned.");
    }

    const totalClicks = rows.length;
    const browserCounts = {};
    const languageCounts = {};
    const platformCounts = {};
    const osCounts = {};
    const ipSet = new Set();

    for (const row of rows) {
      if (row.browser) {
        browserCounts[row.browser] = (browserCounts[row.browser] || 0) + 1;
      }
      if (row.language) {
        languageCounts[row.language] = (languageCounts[row.language] || 0) + 1;
      }
      if (row.platform) {
        platformCounts[row.browser] = (platformCounts[row.browser] || 0) + 1;
      }
      if (row.os) {
        osCounts[row.os] = (osCounts[row.os] || 0) + 1;
      }
      if (row.ip) {
        ipSet.add(row.ip);
      }
    }

    const uniqueIpCiount = ipSet.size;

    res.json({
      totalClicks,
      uniqueIpCiount,
      broswerBreakdown: browserCounts,
      platformBreakdown: platformCounts,
      osBreakdown: osCounts,
    });
  });
});

app.get("/url/:hosturl", async (req, res) => {
  const hosturl = req.params.hosturl;

  console.log("hosturl:", hosturl);

  console.log("Before DB lookup");
  const linkData = await findForwardUrlFromDatabase(hosturl);
  const { linkId, forwardToUrl } = linkData;

  console.log("After DB lookup, forwardurl:", forwardToUrl);

  if (!forwardToUrl) {
    console.log("Forward URL not found, sending 404");
    res.status(404).send("Not found");
    return;
  }

  const clickInfo = {
    timestamp: new Date(),
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    referrer: req.headers["referer"] || null,
    language: req.headers["accept-language"],
    broser: req.useragent.browser,
    platform: req.useragent.platform,
    os: req.useragent.os,
  };

  await saveClickToDatabase(linkId, clickInfo);

  console.log("Redirecting to", forwardToUrl);
  res.redirect(forwardToUrl);
});

// Create user and put it into user table
app.post("/api/register", (req, res) => {
  const saltRounds = 10;

  bcrypt.genSalt(saltRounds, (err, salt) => {
    if (err) {
      console.error("Salt generation failed");
      return;
    }

    const password = req.query["password"];
    console.log(password);
    bcrypt.hash(password, salt, (err, hash) => {
      if (err) {
        console.error("Password Hashing failed");
        res.status(400).send({ error: "Error creating password hash" });
      }

      const username = req.query["username"];
      addUserToDatabase(username, hash);

      res.status(200).send();

      console.log("hashed password:", hash);
    });
  });
});

// Login user and give them json web token
app.post("/api/login", async (req, res) => {
  // req.body is more secure compared to query/params
  const { userId, password: userInputPassword } = req.body;

  // find hash from user id
  const userRecord = await getHashFromUser(userId);
  if (!userRecord) return res.status(404).send("User not found");

  const storedHashPassword = userRecord.passwordHash;

  const match = await bcrypt.compare(userInputPassword, storedHashPassword);

  if (match) {
    console.log("Passwords match! now to authenticate the user");
  } else {
    console.log("Passwords do not match, no authentication");
    res.status(401).send("Invalid login credentials");
    return;
  }

  const token = jwt.sign({ userId: userRecord.id }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });

  res.cookie("token", token, {
    httpOnly: true,
    secure: false,
    sameSite: "Strict",
    maxAge: 3600000,
  });

  res.status(200).send("Login Successful");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, console.log(`Server started on port ${PORT}`));
