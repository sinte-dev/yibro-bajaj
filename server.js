require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const multer = require('multer');

const security = require('./src/security');
const publicRoutes = require('./src/routes/public');
const adminRoutes = require('./src/routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// Don't advertise what the server is built with.
app.disable('x-powered-by');

// Needed before the session middleware so req.secure and req.ip reflect
// what the proxy in front of us saw, not the proxy itself.
if (process.env.TRUST_PROXY_HTTPS === '1') {
  app.set('trust proxy', 1);
}

app.use(security.securityHeaders);

// Dev-only: auto-refresh the browser when files in public/ change, the
// way the VS Code "Live Server" extension does. Only runs via `npm run
// dev` (see dev.js) — `npm start` never touches this code path.
if (process.env.LIVE_RELOAD === '1') {
  const fs = require('fs');
  const livereload = require('livereload');

  const liveReloadServer = livereload.createServer({
    exts: ['html', 'css', 'js'],
    delay: 100
  });
  liveReloadServer.watch(path.join(__dirname, 'public'));

  // connect-livereload can't inject into pages served by express.static,
  // because static streams the file with sendFile instead of writing a
  // string body — so the script tag never appeared and the browser never
  // reloaded. Serving the two HTML pages here, with the tag inserted, is
  // what actually makes live reload work.
  const LR_TAG =
    '<script src="http://localhost:35729/livereload.js?snipver=1"></script>';

  const devPages = { '/': 'index.html', '/index.html': 'index.html', '/admin.html': 'admin.html' };

  app.get(Object.keys(devPages), (req, res, next) => {
    const file = path.join(__dirname, 'public', devPages[req.path]);
    fs.readFile(file, 'utf8', (err, html) => {
      if (err) return next();
      res.type('html').set('Cache-Control', 'no-store')
        .send(html.replace('</body>', LR_TAG + '</body>'));
    });
  });

  console.log('Live reload on — edit anything in public/ and the browser will refresh itself.');
}

// In production these are not warnings, they're stop-the-server problems:
// a live site with the shipped default password is an open admin panel.
const configProblems = [];
if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === 'yibro2026') {
  configProblems.push('ADMIN_PASSWORD is unset or still the shipped default.');
}
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 24) {
  configProblems.push('SESSION_SECRET is unset or too short (use 24+ random characters).');
}

if (configProblems.length) {
  if (IS_PROD) {
    console.error('Refusing to start in production:');
    configProblems.forEach((m) => console.error('  - ' + m));
    console.error('Fix these in your .env file and start again.');
    process.exit(1);
  }
  configProblems.forEach((m) => console.warn('Warning: ' + m + ' Fine for local dev, not for a live site.'));
}

// Small bodies only — nothing this API accepts as JSON is large, and a
// low cap means a junk request can't tie up memory. Photos go through
// multer, which has its own per-file and per-request limits.
app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: false, limit: '64kb' }));

app.use(
  session({
    name: 'yibro.sid',
    secret: process.env.SESSION_SECRET || 'dev-only-insecure-secret',
    resave: false,
    saveUninitialized: false,
    rolling: true, // each request pushes the expiry out, so an active admin isn't logged out mid-edit
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000, // an abandoned session expires instead of lasting forever
      path: '/',
      // Only require HTTPS for the cookie once we know we're actually
      // being served over it — most small hosts terminate TLS in front
      // of the app, so trust the proxy's forwarded protocol.
      secure: IS_PROD && process.env.TRUST_PROXY_HTTPS === '1'
    }
  })
);

// Static site (public/index.html, public/admin.html, css/js, and
// uploaded listing photos under public/uploads/).
// Uploaded photos are user-supplied files served from our own origin, so
// they get the strictest treatment: never sniffed, never inline-rendered.
app.use('/uploads', (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; sandbox");
  next();
});

app.use(express.static(path.join(__dirname, 'public'), {
  dotfiles: 'ignore',
  index: ['index.html'],
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('admin.html')) res.setHeader('Cache-Control', 'no-store');
  }
}));

app.use('/api', publicRoutes);
app.use('/api/admin', adminRoutes);

// Multer and other errors thrown inside route handlers land here —
// without this, they'd otherwise produce an HTML stack trace instead
// of the JSON the front-end code expects.
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'photo_too_large' });
    }
    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: 'too_many_photos' });
    }
    return res.status(400).json({ error: 'upload_failed' });
  }
  // Log the detail for us, return nothing useful to the caller — stack
  // traces and file paths shouldn't reach the browser.
  console.error(err);
  res.status(500).json({ error: 'server_error' });
});

app.listen(PORT, () => {
  console.log(`Yibro Bajaj server running at http://localhost:${PORT}`);
});
