const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const db = require('../db');
const uploads = require('../uploads');
const { requireAdmin } = require('../auth');
const { hashPassword, verifyPassword } = require('../password');
const security = require('../security');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 3 * 1024 * 1024, // 3MB per photo — plenty for a browser-compressed JPEG
    files: uploads.MAX_IMAGES
  }
});

function uid() {
  return 'v' + crypto.randomBytes(6).toString('hex');
}

const MAX_BANK_ACCOUNTS = 5;
const MAX_TITLE = 80;
const MAX_DESC = 1500;
const MAX_CONTACT = 40;
const MAX_PRICE = 100000000; // 100M ETB — far above any real listing, but stops absurd input

const TYPES = ['motorcycle', 'bajaj', 'other'];
const CONDITIONS = ['new', 'used-excellent', 'used-good', 'used-fair'];

function str(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function oneOf(value, allowed, fallback) {
  return allowed.indexOf(value) === -1 ? fallback : value;
}

function intInRange(value, min, max) {
  const n = Math.floor(Number(value));
  if (!isFinite(n) || n < min) return min;
  return Math.min(n, max);
}

// Bank accounts arrive as a JSON string (listings, sent as multipart) or
// as a real array (settings, sent as JSON). Either way, only the three
// fields below are kept, everything is trimmed and length-capped, and
// rows with no account number are dropped.
function sanitizeBankAccounts(raw) {
  let arr = raw;
  if (typeof arr === 'string') {
    try { arr = JSON.parse(arr); } catch (e) { return []; }
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((a) => ({
      bank: String((a && a.bank) || '').trim().slice(0, 60),
      accountName: String((a && a.accountName) || '').trim().slice(0, 80),
      accountNumber: String((a && a.accountNumber) || '').trim().slice(0, 40)
    }))
    .filter((a) => a.accountNumber)
    .slice(0, MAX_BANK_ACCOUNTS);
}

// Pulls the listing fields out of a request body, with every value
// type-checked, trimmed and bounded. Returns null plus an error code if
// something required is missing or out of range.
function readListingFields(body, existing) {
  const title = str(body.title, MAX_TITLE);
  const price = Math.floor(Number(body.price || 0));

  if (!title) return { error: 'title_required' };
  if (!price || !isFinite(price) || price <= 0) return { error: 'price_required' };
  if (price > MAX_PRICE) return { error: 'price_out_of_range' };

  const currentYear = new Date().getFullYear();
  let year = str(body.year, 4);
  if (year) {
    const y = Number(year);
    if (!isFinite(y) || y < 1950 || y > currentYear + 1) year = '';
    else year = String(Math.floor(y));
  }

  return {
    fields: {
      type: oneOf(body.type, TYPES, 'other'),
      title,
      year,
      price,
      mileageKm: intInRange(body.mileageKm || 0, 0, 2000000),
      condition: oneOf(body.condition, CONDITIONS, 'used-good'),
      description: str(body.description, MAX_DESC),
      phone: str(body.phone, MAX_CONTACT),
      whatsapp: str(body.whatsapp, MAX_CONTACT),
      telegram: str(body.telegram, MAX_CONTACT),
      // A request that says nothing about bank accounts leaves the ones
      // already on the listing alone; sending an empty list clears them.
      bankAccounts: body.bankAccounts === undefined
        ? ((existing && existing.bankAccounts) || [])
        : sanitizeBankAccounts(body.bankAccounts)
    }
  };
}

// Rejects anything that isn't actually an image. Without this, a request
// made outside the admin page could upload an HTML or SVG file that would
// then be served from our own origin under /uploads/.
function checkImageBuffers(buffers) {
  return buffers.every((b) => uploads.isSupportedImage(b));
}

// ---------- auth ----------

router.post('/login', security.sameOriginOnly, security.requireCsrf, security.loginLimiter, (req, res) => {
  const password = (req.body && req.body.password) || '';
  const storedHash = db.getAdminPasswordHash();

  if (storedHash) {
    if (!verifyPassword(password, storedHash)) {
      return res.status(401).json({ error: 'wrong_password' });
    }
  } else {
    // Nobody has changed the password from the admin panel yet — check
    // against .env like before. A successful login here migrates it
    // into data/db.json (hashed) so it can be changed from now on.
    const expected = process.env.ADMIN_PASSWORD || 'yibro2026';
    if (password !== expected) {
      return res.status(401).json({ error: 'wrong_password' });
    }
    db.setAdminPasswordHash(hashPassword(password));
  }

  // New session id on every successful login, so a session id an attacker
  // planted in the browser beforehand can't become an admin session.
  security.loginLimiter.reset(req);
  return req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'server_error' });
    req.session.isAdmin = true;
    const token = security.csrfToken(req);
    return req.session.save(() => res.json({ ok: true, csrfToken: token }));
  });
});

router.post('/logout', security.sameOriginOnly, security.requireCsrf, (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', (req, res) => {
  // Issuing the token here is what lets the admin page send it back on
  // login and on every write afterwards.
  const token = security.csrfToken(req);
  res.json({ isAdmin: !!(req.session && req.session.isAdmin), csrfToken: token });
});

// ---------- everything below requires a logged-in admin ----------
router.use(security.sameOriginOnly);
router.use(security.requireCsrf);
router.use(requireAdmin);
router.use(security.writeLimiter);

router.put('/settings', (req, res) => {
  const allowed = ['businessName', 'tagline', 'location', 'phone', 'whatsapp', 'telegram'];
  const patch = {};
  allowed.forEach((key) => {
    if (typeof req.body[key] === 'string') patch[key] = str(req.body[key], 120);
  });
  if (req.body.bankAccounts !== undefined) {
    patch.bankAccounts = sanitizeBankAccounts(req.body.bankAccounts);
  }
  const settings = db.updateSettings(patch);
  res.json(settings);
});

router.put('/password', (req, res) => {
  const currentPassword = (req.body && req.body.currentPassword) || '';
  const newPassword = (req.body && req.body.newPassword) || '';
  const storedHash = db.getAdminPasswordHash();

  const currentOk = storedHash
    ? verifyPassword(currentPassword, storedHash)
    : currentPassword === (process.env.ADMIN_PASSWORD || 'yibro2026');

  if (!currentOk) return res.status(401).json({ error: 'wrong_current_password' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'password_too_short' });
  if (newPassword.length > 200) return res.status(400).json({ error: 'password_too_long' });

  db.setAdminPasswordHash(hashPassword(newPassword));
  res.json({ ok: true });
});

router.post('/listings', upload.array('images', uploads.MAX_IMAGES), (req, res) => {
  const body = req.body || {};
  const files = req.files || [];

  const parsed = readListingFields(body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  if (files.length < 1) return res.status(400).json({ error: 'at_least_one_photo_required' });
  if (files.length > uploads.MAX_IMAGES) {
    return res.status(400).json({ error: 'too_many_photos', max: uploads.MAX_IMAGES });
  }

  const buffers = files.map((f) => f.buffer);
  if (!checkImageBuffers(buffers)) return res.status(400).json({ error: 'not_an_image' });

  const id = uid();
  const images = uploads.writeListingImages(id, buffers);

  const listing = Object.assign({ id }, parsed.fields, {
    images,
    createdAt: Date.now()
  });

  db.addListing(listing);
  res.status(201).json(listing);
});

router.put('/listings/:id', upload.array('images', uploads.MAX_IMAGES), (req, res) => {
  const id = req.params.id;
  if (!uploads.isValidId(id)) return res.status(404).json({ error: 'not_found' });

  const existing = db.getListing(id);
  if (!existing) return res.status(404).json({ error: 'not_found' });

  const body = req.body || {};
  const parsed = readListingFields(body, existing);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  let keepUrls = [];
  try {
    keepUrls = JSON.parse(body.keepImages || '[]');
    if (!Array.isArray(keepUrls)) keepUrls = [];
  } catch (e) {
    keepUrls = [];
  }
  keepUrls = keepUrls.slice(0, uploads.MAX_IMAGES);

  const keptBuffers = uploads.readExistingImages(id, keepUrls);
  const newFiles = req.files || [];
  const newBuffers = newFiles.map((f) => f.buffer);
  if (!checkImageBuffers(newBuffers)) return res.status(400).json({ error: 'not_an_image' });

  const allBuffers = keptBuffers.concat(newBuffers);

  if (allBuffers.length < 1) return res.status(400).json({ error: 'at_least_one_photo_required' });
  if (allBuffers.length > uploads.MAX_IMAGES) {
    return res.status(400).json({ error: 'too_many_photos', max: uploads.MAX_IMAGES });
  }

  const images = uploads.writeListingImages(id, allBuffers);

  const updated = db.updateListing(id, Object.assign({}, parsed.fields, { images }));

  res.json(updated);
});

router.delete('/listings/:id', (req, res) => {
  const id = req.params.id;
  if (!uploads.isValidId(id)) return res.status(404).json({ error: 'not_found' });
  const removed = db.deleteListing(id);
  if (!removed) return res.status(404).json({ error: 'not_found' });
  uploads.removeListingDir(id);
  res.json({ ok: true });
});

module.exports = router;
