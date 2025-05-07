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
        console.log("Data created for linkid:", linkId);
        resolve(this.lastID);
      }
    );
  });
}

function addUserToDatabase(username, passwordHash) {
  return new Promise((resolve, reject) => {
    insertquery = `INSERT INTO users (username, passwordHash) VALUES (?, ?)`;
    db.run(insertquery, username, passwordHash);
    resolve(username);
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

function requireAuth(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.status(401).send("No token provided");

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    console.log(req.user);
    next();
  } catch (err) {
    return res.status(403).send("Invalid token");
  }
}

function getIdFromHost(hosturl) {
  return new Promise((resolve, reject) => {
    console.log("Finding linkId from hosturl:", hosturl);
    db.get(
      `SELECT linkId FROM links WHERE hostUrl = ?`,
      [hosturl],
      (err, row) => {
        if (row) {
          console.log("linkid found:", this.linkId);
          resolve(row.linkId);
        } else {
          console.log("Link not found");
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
  // don't give out owner id's and creation dates
  db.all(`SELECT linkId, hostUrl, forwardToUrl FROM links`, [], (err, rows) => {
    if (err) {
      res.status(500).send(err.message);
      return;
    }
    res.json(rows);
  });
});

// Get all of the linkstat entries for a given linkid
app.get("/api/links/:hostname/rawdata", requireAuth, async (req, res) => {
  const hostname = req.params.hostname;
  const linkid = await getIdFromHost(hostname);
  const userid = req.user.userId;

  if (!linkid) {
    return res.status(404).json({ error: "Short link not found" });
  }

  db.all(
    `SELECT * FROM link_stats JOIN links ON link_stats.linkId = links.linkId WHERE link_statslinkId = ? AND links.userOwner = ?`,
    [linkid, userid],
    (err, rows) => {
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
    }
  );
});

// Get the actual stats of the given link
app.get("/api/links/:hostname/stats", requireAuth, async (req, res) => {
  const hostname = req.params.hostname;
  const linkid = await getIdFromHost(hostname);
  const userid = req.user.userId;

  console.log("userid:", userid);
  console.log("hostname:", hostname);
  console.log("linkid:", linkid);

  if (!linkid) {
    return res.status(404).json({ error: "Short link not found" });
  }

  // check the user has access first
  db.get(
    `SELECT * FROM links where linkId = ? AND userOwner = ?`,
    [linkid, userid],
    (err, row) => {
      if (err) return res.status(500).send(err.message);

      if (!row) return res.status(403).json({ error: "Access denied" });

      // if they have access then run the query
      db.all(
        `SELECT * 
        FROM link_stats 
        JOIN links
        ON links.linkId = link_stats.linkId
        WHERE link_stats.linkId = ? AND links.userOwner = ?`,
        [linkid, userid],
        (err, rows) => {
          if (err) {
            res.status(500).send(err.message);
            return;
          }
          if (rows.length === 0) {
            console.log(rows);
            res.status(401).json({
              error:
                "Link has not been clicked, access denied, or link doesn't exist under current user",
            });
            return;
          }

          const totalClicks = rows.length;
          const browserCounts = {};
          const languageCounts = {};
          const platformCounts = {};
          const osCounts = {};
          const ipSet = new Set();

          for (const row of rows) {
            if (row.browser) {
              browserCounts[row.browser] =
                (browserCounts[row.browser] || 0) + 1;
            }
            if (row.language) {
              languageCounts[row.language] =
                (languageCounts[row.language] || 0) + 1;
            }
            if (row.platform) {
              platformCounts[row.browser] =
                (platformCounts[row.browser] || 0) + 1;
            }
            if (row.os) {
              osCounts[row.os] = (osCounts[row.os] || 0) + 1;
            }
            if (row.ip) {
              ipSet.add(row.ip);
            }
          }

          const uniqueIpCount = ipSet.size;

          res.json({
            totalClicks,
            uniqueIpCount,
            broswerBreakdown: browserCounts,
            platformBreakdown: platformCounts,
            osBreakdown: osCounts,
          });
        }
      );
    }
  );
});

app.get("/:hosturl", async (req, res) => {
  const hosturl = req.params.hosturl;

  console.log("hosturl:", hosturl);

  console.log("Before DB lookup");
  const linkData = await findForwardUrlFromDatabase(hosturl);

  if (!linkData) {
    res.status(401).json({ error: "Link not found" });
    return;
  }

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
  const { username, password } = req.body;
  const saltRounds = 10;

  if (!username || !password) {
    return res.status(400).send("Requires a username and password");
  }

  bcrypt.genSalt(saltRounds, (err, salt) => {
    if (err) {
      console.error("Salt generation failed");
      return;
    }

    bcrypt.hash(password, salt, (err, hash) => {
      if (err) {
        console.error("Password Hashing failed");
        return res.status(400).send({ error: "Error creating password hash" });
      }

      addUserToDatabase(username, hash)
        .then(() => {
          return res.status(200).send("User created!");
        })
        .catch((err) => {
          console.error("Database error:", err.message);
          return res.status(500).send("Failed to register user");
        });

      console.log("hashed password:", hash);
    });
  });
});

// Login user and give them json web token
app.post("/api/login", async (req, res) => {
  // req.body is more secure compared to query/params
  const { userId, password } = req.body;

  // find hash from user id
  const userRecord = await getHashFromUser(userId);
  if (!userRecord) return res.status(404).send("User not found");

  const storedHashPassword = userRecord.passwordHash;

  const match = await bcrypt.compare(password, storedHashPassword);

  if (match) {
    console.log("Passwords match! now to authenticate the user");
  } else {
    console.log("Passwords do not match, no authentication");
    res.status(401).send("Invalid login credentials");
    return;
  }

  const token = jwt.sign({ userId: userId }, process.env.JWT_SECRET, {
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

// Create link using logged in user
app.post("/api/createlink", requireAuth, async (req, res) => {
  const userid = req.user.userId;
  const { hostUrl, forwardToUrl } = req.body;

  if (!userid)
    return res.status(401).send("You must be logged in to create a link");
  if (!hostUrl || !forwardToUrl)
    return res.status(400).send("Hosturl or forwardToUrl is null");

  db.get(`SELECT * FROM links WHERE hostUrl = ?`, [hostUrl], (err, row) => {
    if (err) return res.status(500).send("Database error");
    if (row) return res.status(409).send("hostUrl already exists");

    db.run(
      `INSERT INTO links (hostUrl, forwardToUrl, userOwner) VALUES (?, ?, ?)`,
      [hostUrl, forwardToUrl, userid],
      function (err) {
        if (err) {
          console.log(err);
          return res.status(500).send("Insert failed");
        } else return res.status(201).send("Link created successfully!");
      }
    );
  });

  return res.status(200);
});

app.post("/api/editlink/", requireAuth, async (req, res) => {
  const { hosturl, newhosturl, newurl } = req.body;
  const linkid = await getIdFromHost(hosturl);
  const userid = req.user.userId;

  // make sure user owns the link
  try {
    const link = await new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM links WHERE linkId = ? AND userOwner = ?`,
        [linkid, userid],
        (err, row) => {
          if (err) return reject(err);
          if (!row) return resolve(null); // accept empty/null it means it didn't change
          resolve(row);
        }
      );
    });

    if (!link)
      return res.status(403).send("Link not found or not owned by user");

    // Grab the data if found in the row, and decide on final updates
    const finalHostUrl = newhosturl?.trim() || link.hostUrl;
    const finalForwardUrl = newurl?.trim() || link.forwardToUrl;

    // make sure there isn't a link with the new hosturl
    if (finalHostUrl !== link.hostUrl) {
      const existing = await new Promise((resolve, reject) => {
        db.get(
          `SELECT linkId FROM links WHERE hostUrl = ?`,
          [finalHostUrl],
          (err, row) => {
            if (err) return reject(err);
            resolve(row);
          }
        );
      });
      if (existing) {
        return res.status(400).send("Host URL already in use");
      }
    }
    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE links SET hostUrl = ?, forwardToUrl = ? WHERE linkid = ? AND userOwner = ?`,
        [finalHostUrl, finalForwardUrl, linkid, userid],
        function (err) {
          if (err) return reject(err);
          resolve();
        }
      );
    });

    res.status(200).send("Link updated successfully");
  } catch (err) {
    console.error("Edit link error:", err.message);
    res.status(500).send("Server error");
  }

  // make sure newhostname isn't already taken, its unique and not empty

  // make sure newurl isn't empty

  // then checking with the userid update the host/url if applicable

  return res.status(200).send("Link updated successfully.");
});

app.post("/api/deletelink/", requireAuth, async (req, res) => {
  const { hosturl } = req.body;
  const linkid = await getIdFromHost(hosturl);
  const userid = req.user.userId;

  console.log("Delete started:", { hosturl, linkid, userid });

  if (!hosturl) {
    return res.status(400).send("Missing hosturl");
  }

  try {
    const link = await new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM links WHERE linkId = ? AND userOwner = ?`,
        [linkid, userid],
        (err, row) => {
          if (err) return reject(err);
          if (!row) return resolve(null); // accept empty/null it means it didn't change
          resolve(row);
        }
      );
    });

    if (!link)
      return res.status(403).send("Link not found or not owned by user");

    await new Promise((resolve, reject) => {
      db.run(
        `DELETE FROM links WHERE linkid = ? AND userOwner = ?`,
        [linkid, userid],
        function (err) {
          if (err) return reject(err);
          resolve();
        }
      );
    });
  } catch (err) {
    console.error("Edit link error:", err.message);
    res.status(500).send("Server error");
  }

  res.status(200).send("Link deleted successfully");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, console.log(`Server started on port ${PORT}`));
