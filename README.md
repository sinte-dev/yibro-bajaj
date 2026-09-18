# Yibro Bajaj — motorcycle & Bajaj sales site (Node.js version)

A small full-stack app:

- **Public site** (`/`) — anyone can browse listings, search, filter by type and
  price, and reach you by phone, WhatsApp, or Telegram. No account needed.
- **Admin panel** (`/admin.html`) — password-protected. Add, edit, and delete
  listings (1–4 photos each). Changes save straight to the server and are
  live on the public site immediately — no downloading or re-uploading files.

Everything is stored on the server: listing data in `data/db.json`, photos in
`public/uploads/<listing-id>/`.

## Running it locally

Requires [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
cp .env.example .env
# open .env and change ADMIN_PASSWORD and SESSION_SECRET
npm start
```

Then open:
- `http://localhost:3000/` — the public site
- `http://localhost:3000/admin.html` — the admin panel (log in with the
  password you set in `.env`)

While developing, `npm run dev` restarts the server automatically when you
edit a file.

## Configuration (`.env`)

| Variable          | What it does                                            |
|-------------------|----------------------------------------------------------|
| `ADMIN_PASSWORD`  | Starting password to log into `/admin.html`. Only used until someone changes the password from inside the admin panel (Password tab) — after that, the panel's stored password takes over and this is ignored. |
| `SESSION_SECRET`  | Random string used to sign login cookies. **Change this.**|
| `PORT`            | Port to listen on (most hosts set this for you).         |

If you don't set `ADMIN_PASSWORD`, it defaults to `yibro2026` — fine for
trying things out locally, not for a real deployment.

### Changing the admin password

Log into `/admin.html` and open the **Password** tab — enter your current
password and a new one (8+ characters). This is stored (hashed, not
plain text) in `data/db.json`, so it survives restarts and works the same
on any host.

**Locked out?** Stop the server, open `data/db.json`, and set
`"admin": { "passwordHash": null }`. Restart, and the `ADMIN_PASSWORD`
from your `.env` will work again as a fresh starting password — logging
in with it re-saves it into `data/db.json` just like on first setup.

## Deploying it

This is a normal Node/Express app, so it runs anywhere Node apps run. A few
common options, roughly easiest to most hands-on:

- **Render / Railway / Fly.io** — connect your GitHub repo (or upload the
  folder), set the `ADMIN_PASSWORD` and `SESSION_SECRET` environment
  variables in their dashboard, and it builds and runs `npm start`
  automatically. This is the least setup for a small business site.
- **A VPS (DigitalOcean, Hetzner, etc.)** — install Node, copy the project
  over, `npm install --production`, then run it with a process manager like
  [pm2](https://pm2.keymetrics.io/) (`pm2 start server.js --name yibro`) so
  it restarts if it crashes or the server reboots. Put Nginx in front for
  your domain and HTTPS (e.g. via [Certbot](https://certbot.eff.org/)).
- **A shared cPanel host with "Node.js App" support** — many hosts in
  Ethiopia and elsewhere offer this. Point it at `server.js`, set the
  environment variables in its Node.js app settings, and it handles the
  rest.

Whichever you choose, two things matter for `public/uploads/` to keep
working:
1. The disk your app writes to needs to **persist** between deploys/restarts
   (a normal VPS or a host with a persistent volume — not every "serverless"
   platform keeps files you write at runtime, so check before relying on one).
2. If you're behind a reverse proxy / load balancer that terminates HTTPS
   (common on most hosts), set `TRUST_PROXY_HTTPS=1` in your environment so
   login cookies are marked secure correctly.

## How photos work

When you upload a photo in the admin panel, your browser resizes and
compresses it before sending it — the server just saves the bytes it
receives to `public/uploads/<listing-id>/image-1.jpg`, `image-2.jpg`, etc.
Editing a listing's photos rewrites that folder cleanly each time (no
leftover files), and deleting a listing removes its whole folder.

## Project layout

```
server.js              — starts the app
src/
  db.js                 — reads/writes data/db.json
  uploads.js             — saves/removes listing photos on disk
  auth.js                — checks the admin session
  password.js            — hashes/verifies the admin password
  routes/
    public.js            — GET /api/listings, GET /api/settings
    admin.js              — login/logout + listing, settings & password CRUD
public/
  index.html, app.js      — the public site
  admin.html, admin.js    — the admin panel
  styles.css              — shared styling for both
  uploads/                — listing photos live here (auto-managed)
data/
  db.json                 — all listings, business settings, and the admin password hash
```

## Upgrading later

- **More than one admin?** Everyone can share the one password for now.
  If you need separate logins per staff member, that's a bigger change
  (a users table, individual passwords) — ask and it can be added.
- **Outgrowing the JSON file?** `src/db.js` is the only file that touches
  `data/db.json` — swapping it for a real database (Postgres, SQLite, etc.)
  later wouldn't require changing any route code.

## Tests

```bash
npm install
npm test
```

Starts the server on port 3100 with throwaway credentials, seeds two
listings, then drives the real `index.html` and `admin.html` in a headless
DOM: listings render, a listing opens, the bank panel appears, the copy
button copies, the language switch works, login works, bank rows keep what
you typed across re-renders, settings and edits save and persist. The last
file checks the security behaviour (CSRF, origin, upload type, path
traversal, login throttling) — it runs last on purpose, because tripping
the login rate limiter would break the other tests' logins.

## Security

What the server does on its own:

- **Admin password** is stored scrypt-hashed in `data/db.json`, never in
  plain text. Login comparison is timing-safe.
- **Login throttling** — 10 attempts per IP per 15 minutes, then HTTP 429.
- **Session hardening** — HttpOnly, SameSite=Lax cookie, 8-hour rolling
  expiry, and a fresh session id issued on every successful login.
- **CSRF protection** — every write request must carry the per-session
  `X-CSRF-Token` header, and browser requests from another origin are
  rejected outright.
- **Security headers** — Content-Security-Policy (scripts restricted to
  this origin), `nosniff`, `X-Frame-Options: DENY`, a referrer policy, and
  HSTS once `TRUST_PROXY_HTTPS=1`.
- **Upload safety** — uploads are checked against real image magic bytes,
  always written as `image-N.jpg` inside the listing's own folder, and
  served with a sandboxed CSP so a crafted file can't execute on this
  origin. Listing ids and kept-photo filenames are pattern-validated, so a
  request can't reach outside `public/uploads/`.
- **Input bounds** — title, description, contact and bank fields are
  trimmed and length-capped; type, condition, year, price and mileage are
  range-checked; JSON bodies are capped at 64 KB.
- **Fail-fast config** — with `NODE_ENV=production`, the server refuses to
  start if `ADMIN_PASSWORD` is the shipped default or `SESSION_SECRET` is
  missing or too short.

What still needs you:

- **Serve it over HTTPS.** Without TLS, the admin password and session
  cookie travel in clear text and none of the above helps. Set
  `TRUST_PROXY_HTTPS=1` once HTTPS is in front of the app.
- **Back up `data/db.json` and `public/uploads/`.** They are the whole
  site; nothing else stores a copy.
- Sessions live in the server's memory, so restarting logs admins out.
  That's fine for one small server; it would need a session store if this
  ever runs on more than one instance.
- Bank account numbers on listings are public by design — treat them as
  published information and confirm every transfer yourself.
