-- Links table:
--  id primary key
--  host url, extension after kylercressall.dev
--  forward to url
--  user owner id

-- Link stats table:
--  id primary KEY
--  link id foreign key
--  ip
--  user-agent
--  

-- Users table:
--  primary key id
--  passwordHash
--  created_on date
--  

-- users stored with a hashed password
CREATE TABLE IF NOT EXISTS users (
  userId INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT,
  passwordHash TEXT,
  creationDate DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- links hostUrl (addition after localhost.com/:x) forwards to forwardToUrl
CREATE TABLE IF NOT EXISTS links (
  linkId INTEGER PRIMARY KEY AUTOINCREMENT,
  hostUrl TEXT,
  forwardToUrl TEXT,
  userOwner INTEGER,
  creationDate DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (userOwner) REFERENCES users(userId)
);

-- Link stat is created every time a user clicks on the link
CREATE TABLE IF NOT EXISTS link_stats (
  statId INTEGER PRIMARY KEY AUTOINCREMENT,
  linkId INTEGER,
  timeStamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  ip TEXT,
  userAgent TEXT,
  browser TEXT,
  platform TEXT,
  referrer TEXT,
  language TEXT,
  os TEXT,
  FOREIGN KEY (linkId) REFERENCES links(linkId)
);
