const express = require('express');
const { readCollection, updateCollection } = require('../utils/fileStorage');
const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(authenticate);
router.get('/', async (req, res, next) => {
  try {
    const items = await readCollection('notifications');
    res.json({ success: true, data: { notifications: req.user.role === 'admin' ? items : items.filter((item) => item.userId === req.user.id) } });
  } catch (error) { next(error); }
});
router.patch('/:id/read', async (req, res, next) => {
  try {
    let updated;
    await updateCollection('notifications', async (items) => {
      const index = items.findIndex((item) => item.id === req.params.id);
      if (index < 0 || (req.user.role !== 'admin' && items[index].userId !== req.user.id)) throw Object.assign(new Error('Notification not found.'), { status: 404 });
      updated = { ...items[index], read: true };
      items[index] = updated;
      return { items };
    });
    res.json({ success: true, data: { notification: updated } });
  } catch (error) { next(error); }
});
module.exports = router;