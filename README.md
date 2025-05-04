# Link Shortening App

by Kyler Cressall

This link shortening app uses sqlite to store links, the url they forward to, and logs statistics on when links are clicked.

## Features:

Users

- username and bcrypt hashed password
- can dynamically create users with /api/register
- logs in users by comparing the password hashes
- stores an authentication cookie on their browser

Links

- hostUrl and forwardToUrl
- is owned by a user

Link Stats

- tracks when a shortened link is used
- time, ip, details from the header
- connected to a link (and owned by that user)
- /api/links/:hostname/stats authenticates user

TODO:

- add auth to /api/links/:hostname/rawdata
- modify/delete existing links (and require auth to do so)
- modify/delete users, usernames, passwords (when authenticated)
- clean up linkstats into something more usable by frontend and useful to owner
