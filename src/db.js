// Small JSON-file "database". Good enough for a single small dealership
// site with a handful of admins and no concurrent-write pressure.
// If this ever needs to scale up (many staff editing at once, thousands
// of listings), swap this file's internals for a real database — the
// route handlers only call the functions exported here, so nothing
// upstream would need to change.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const DEFAULT_DB = {
  settings: {
    businessName: 'Yibro Bajaj',
    tagline: 'Bajaj three-wheelers and motorcycles, ready for the road.',
    location: 'Finote Selam, Amhara',
    phone: '+251911223344',
    whatsapp: '+251911223344',
    telegram: 'yibrobajaj',
    // Bank / mobile-money accounts a buyer can pay into. Each entry:
    // { bank, accountName, accountNumber }. Used as the default on any
    // listing that doesn't carry its own accounts.
    bankAccounts: []
  },
  // passwordHash starts out empty — the server falls back to the
  // ADMIN_PASSWORD env var until the first successful login, or a
  // password change, fills this in. See src/routes/admin.js.
  admin: {
    passwordHash: null
  },
  listings: []
};

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2));
  }
}

function readDb() {
  ensureDb();
  const raw = fs.readFileSync(DB_FILE, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.settings) parsed.settings = { ...DEFAULT_DB.settings };
    if (!Array.isArray(parsed.settings.bankAccounts)) parsed.settings.bankAccounts = [];
    if (!parsed.admin || typeof parsed.admin !== 'object') parsed.admin = { passwordHash: null };
    if (!Array.isArray(parsed.listings)) parsed.listings = [];
    return parsed;
  } catch (e) {
    // Corrupted file — don't crash the server, start fresh but keep
    // the broken file around under a different name so nothing is lost.
    const backupPath = DB_FILE + '.corrupted.' + Date.now();
    fs.copyFileSync(DB_FILE, backupPath);
    fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2));
    console.error('data/db.json was corrupted; backed up to', backupPath, 'and reset.');
    return JSON.parse(JSON.stringify(DEFAULT_DB));
  }
}

function writeDb(db) {
  ensureDb();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function getSettings() {
  return readDb().settings;
}

function updateSettings(patch) {
  const db = readDb();
  db.settings = { ...db.settings, ...patch };
  writeDb(db);
  return db.settings;
}

function getAdminPasswordHash() {
  return readDb().admin.passwordHash;
}

function setAdminPasswordHash(hash) {
  const db = readDb();
  db.admin = { passwordHash: hash };
  writeDb(db);
}

function getListings() {
  return readDb().listings;
}

function getListing(id) {
  return readDb().listings.find((l) => l.id === id) || null;
}

function addListing(listing) {
  const db = readDb();
  db.listings.push(listing);
  writeDb(db);
  return listing;
}

function updateListing(id, patch) {
  const db = readDb();
  const idx = db.listings.findIndex((l) => l.id === id);
  if (idx === -1) return null;
  db.listings[idx] = { ...db.listings[idx], ...patch };
  writeDb(db);
  return db.listings[idx];
}

function deleteListing(id) {
  const db = readDb();
  const idx = db.listings.findIndex((l) => l.id === id);
  if (idx === -1) return false;
  db.listings.splice(idx, 1);
  writeDb(db);
  return true;
}

module.exports = {
  getSettings,
  updateSettings,
  getAdminPasswordHash,
  setAdminPasswordHash,
  getListings,
  getListing,
  addListing,
  updateListing,
  deleteListing
};
