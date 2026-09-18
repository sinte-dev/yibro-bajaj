const express = require('express');
const db = require('../db');

const router = express.Router();

// Returns every listing. The public page itself handles search/type/
// price filtering and sorting client-side — traffic and inventory for
// a single dealership are small enough that this is simpler than
// keeping two copies of the same filtering logic in sync.
router.get('/listings', (req, res) => {
  res.json(db.getListings());
});

router.get('/settings', (req, res) => {
  res.json(db.getSettings());
});

module.exports = router;
