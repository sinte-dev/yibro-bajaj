// Security middleware for the site. Everything here uses only Node and
// Express built-ins — no extra packages to install or keep updated.
//
// What's in here:
//   securityHeaders  — CSP and the other standard response headers
//   loginLimiter     — slows down password guessing on /api/admin/login
//   writeLimiter     — a looser cap on admin write requests
//   csrfToken        — issues a per-session token
//   requireCsrf      — rejects state-changing requests without that token

const crypto = require('crypto');

// ---------- response headers ----------

// Content-Security-Policy is tuned to exactly what the two pages load:
// our own /styles.css, /app.js, /admin.js, Google Fonts, and listing
// photos from our own /uploads. 'unsafe-inline' is needed for style-src
// only because the front-end uses a few inline style="" attributes;
// script-src stays strict, which is the part that matters for XSS.
function buildCsp() {
  // `npm run dev` loads the live-reload client from port 35729 and keeps a
  // WebSocket open to it. That's a different origin, so it has to be named
  // explicitly — and only in dev. `npm start` never takes this branch, so
  // the production policy stays strict.
  const dev = process.env.LIVE_RELOAD === '1';
  const lrHttp = dev ? ' http://localhost:35729 http://127.0.0.1:35729' : '';
  const lrWs = dev ? ' ws://localhost:35729 ws://127.0.0.1:35729' : '';

  return [
    "default-src 'self'",
    "script-src 'self'" + lrHttp,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self'" + lrHttp + lrWs,
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'"
  ].join('; ');
}

const CSP = buildCsp();

function securityHeaders(req, res, next) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

  // Never let a browser or CDN cache admin pages or API responses —
  // the public listing JSON changes as soon as a listing is edited.
  if (req.path.startsWith('/api') || req.path.startsWith('/admin')) {
    res.setHeader('Cache-Control', 'no-store');
  }

  // Tell browsers to stick to HTTPS, but only once we know we're
  // actually behind it — sending this over plain HTTP in development
  // would lock localhost into https:// in the browser's HSTS cache.
  if (process.env.TRUST_PROXY_HTTPS === '1' && req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
}

// ---------- rate limiting ----------

// A plain in-memory counter per client IP. Good enough for a single
// small server; if this ever runs on more than one instance, each
// instance keeps its own count, which is still a useful brake.
function createRateLimiter(options) {
  const windowMs = options.windowMs;
  const max = options.max;
  const errorCode = options.errorCode || 'too_many_requests';
  const hits = new Map(); // ip -> { count, resetAt }

  // Drop expired entries every so often so the map can't grow forever.
  const sweep = setInterval(() => {
    const now = Date.now();
    hits.forEach((v, k) => { if (v.resetAt <= now) hits.delete(k); });
  }, windowMs);
  if (sweep.unref) sweep.unref();

  function middleware(req, res, next) {
    const ip = req.ip || (req.connection && req.connection.remoteAddress) || 'unknown';
    const now = Date.now();
    let entry = hits.get(ip);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(ip, entry);
    }

    entry.count += 1;

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: errorCode, retryAfterSeconds: retryAfter });
    }
    next();
  }

  // Called after a successful login so a legitimate admin who fat-fingered
  // the password a few times isn't left with a counter ticking against them.
  middleware.reset = function (req) {
    const ip = req.ip || (req.connection && req.connection.remoteAddress) || 'unknown';
    hits.delete(ip);
  };

  return middleware;
}

// 10 password attempts per IP per 15 minutes. A human who forgot the
// password still gets plenty of tries; a script gets nowhere.
const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  errorCode: 'too_many_attempts'
});

// A much looser cap, just so a stuck script or a stolen session can't
// hammer the JSON file with writes.
const writeLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  errorCode: 'too_many_requests'
});

// ---------- CSRF ----------

// SameSite=lax already blocks most cross-site request forgery, but it is
// a browser-side defence and it doesn't cover every case (notably plain
// cross-site form POSTs in older browsers). A per-session token, sent
// back in a header the front-end controls, closes the gap.

function csrfToken(req) {
  if (!req.session) return '';
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  }
  return req.session.csrfToken;
}

function safeCompare(a, b) {
  const bufA = Buffer.from(String(a || ''));
  const bufB = Buffer.from(String(b || ''));
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function requireCsrf(req, res, next) {
  // GET/HEAD/OPTIONS don't change anything, so they don't need a token.
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();

  const supplied = req.get('X-CSRF-Token') || (req.body && req.body._csrf) || '';
  const expected = req.session && req.session.csrfToken;

  if (!expected || !safeCompare(supplied, expected)) {
    return res.status(403).json({ error: 'bad_csrf_token' });
  }
  next();
}

// ---------- origin check ----------

// Belt-and-braces alongside the CSRF token: if the browser tells us the
// request came from another site, don't process it at all.
function sameOriginOnly(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();

  const origin = req.get('Origin');
  if (!origin) return next(); // non-browser client (curl, a script) — the CSRF token still applies

  const host = req.get('Host');
  let originHost = '';
  try { originHost = new URL(origin).host; } catch (e) { originHost = ''; }

  if (!originHost || originHost !== host) {
    return res.status(403).json({ error: 'bad_origin' });
  }
  next();
}

module.exports = {
  securityHeaders,
  buildCsp,
  createRateLimiter,
  loginLimiter,
  writeLimiter,
  csrfToken,
  requireCsrf,
  sameOriginOnly
};
