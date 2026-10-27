const express = require('express');
const crypto = require('crypto');
const { readCollection, updateCollection } = require('../utils/fileStorage');
const { text } = require('../utils/validation');
const { authenticate, allowRoles } = require('../middleware/authMiddleware');

const router = express.Router();
router.get('/', authenticate, async (req, res, next) => {
  try {
    const items = await readCollection('feedback');
    res.json({ success: true, data: { feedback: req.user.role === 'admin' ? items : items.filter((item) => item.citizenId === req.user.id) } });
  } catch (error) { next(error); }
});
router.post('/', authenticate, allowRoles('citizen'), async (req, res, next) => {
  try {
    const rating = Number(req.body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw Object.assign(new Error('Rating must be between 1 and 5.'), { status: 400 });
    const comment = req.body.comment ? text(req.body.comment, 'Comment', 1000) : '';
    const complaints = await readCollection('complaints');
    const complaint = complaints.find((item) => item.id === req.body.complaintId && item.citizenId === req.user.id);
    if (!complaint) throw Object.assign(new Error('Complaint not found.'), { status: 404 });
    if (complaint.status !== 'Resolved') throw Object.assign(new Error('Feedback is available after a complaint is resolved.'), { status: 400 });
    let feedback;
    await updateCollection('feedback', async (items) => {
      if (items.some((item) => item.complaintId === complaint.id)) throw Object.assign(new Error('Feedback has already been submitted for this complaint.'), { status: 409 });
      feedback = { id: crypto.randomUUID(), complaintId: complaint.id, citizenId: req.user.id, citizenName: req.user.name, rating, comment, createdAt: new Date().toISOString() };
      return { items: [feedback, ...items] };
    });
    res.status(201).json({ success: true, data: { feedback } });
  } catch (error) { next(error); }
});
module.exports = router;
