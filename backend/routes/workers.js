const express = require('express');
const { readCollection } = require('../utils/fileStorage');
const { authenticate, allowRoles } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(authenticate, allowRoles('admin'));
router.get('/', async (_req, res, next) => {
  try { res.json({ success: true, data: { workers: await readCollection('workers') } }); } catch (error) { next(error); }
});
module.exports = router;