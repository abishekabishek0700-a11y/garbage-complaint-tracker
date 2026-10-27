const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs/promises');
const { readCollection, updateCollection, storageDir } = require('../utils/fileStorage');
const { text, enumValue, categories, statuses } = require('../utils/validation');
const { authenticate, allowRoles } = require('../middleware/authMiddleware');
const { uploadFor, verifyImage } = require('../utils/fileStorageUploads');

const router = express.Router();
const complaintUpload = uploadFor('complaints');
const notify = async (userId, complaintId, message) => updateCollection('notifications', async (items) => ({ items: [...items, { id: crypto.randomUUID(), userId, complaintId, message, read: false, createdAt: new Date().toISOString() }] }));
const safeComplaint = (complaint) => ({ ...complaint, imageUrl: complaint.imagePath ? `/api/files${complaint.imagePath}` : null, evidence: (complaint.evidence || []).map((item) => ({ ...item, imageUrl: `/api/files${item.path}` })) });

router.post('/', authenticate, allowRoles('citizen'), complaintUpload.single('photo'), verifyImage, async (req, res, next) => {
  try {
    const title = text(req.body.title, 'Title', 120);
    const description = text(req.body.description, 'Description', 3000);
    const category = enumValue(req.body.category, categories, 'category');
    const address = text(req.body.address, 'Address', 500);
    const location = text(req.body.location || address, 'Location', 500);
    const now = new Date().toISOString();
    const complaint = {
      id: `GCT-${new Date().getFullYear()}-${crypto.randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`,
      citizenId: req.user.id, citizenName: req.user.name, title, description, category, address, location,
      status: 'Submitted', createdAt: now, updatedAt: now,
      imagePath: req.file ? `/uploads/complaints/${path.basename(req.file.path)}` : null,
      workerId: null, workerName: null, rejectionReason: null, workNotes: '', evidence: [],
      statusHistory: [{ status: 'Submitted', note: 'Complaint submitted by citizen.', actor: req.user.name, at: now }]
    };
    await updateCollection('complaints', async (items) => ({ items: [complaint, ...items] }));
    await notify(req.user.id, complaint.id, `Your complaint ${complaint.id} has been submitted.`);
    res.status(201).json({ success: true, data: { complaint: safeComplaint(complaint) } });
  } catch (error) { next(error); }
});

router.get('/', authenticate, async (req, res, next) => {
  try {
    let complaints = await readCollection('complaints');
    if (req.user.role === 'citizen') complaints = complaints.filter((item) => item.citizenId === req.user.id);
    if (req.user.role === 'worker') complaints = complaints.filter((item) => item.workerId === req.user.id);
    const { status, category, search, from, to } = req.query;
    if (status) complaints = complaints.filter((item) => item.status === status);
    if (category) complaints = complaints.filter((item) => item.category === category);
    if (search) { const term = String(search).toLowerCase(); complaints = complaints.filter((item) => `${item.id} ${item.title} ${item.description} ${item.address} ${item.citizenName}`.toLowerCase().includes(term)); }
    if (from) complaints = complaints.filter((item) => item.createdAt >= new Date(from).toISOString());
    if (to) complaints = complaints.filter((item) => item.createdAt.slice(0, 10) <= String(to));
    res.json({ success: true, data: { complaints: complaints.map(safeComplaint) } });
  } catch (error) { next(error); }
});

router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const item = (await readCollection('complaints')).find((complaint) => complaint.id === req.params.id);
    if (!item) return res.status(404).json({ success: false, error: 'Complaint not found.' });
    if (req.user.role === 'citizen' && item.citizenId !== req.user.id) return res.status(403).json({ success: false, error: 'You cannot view this complaint.' });
    if (req.user.role === 'worker' && item.workerId !== req.user.id) return res.status(403).json({ success: false, error: 'This complaint is not assigned to you.' });
    res.json({ success: true, data: { complaint: safeComplaint(item) } });
  } catch (error) { next(error); }
});

router.get('/:id/history', authenticate, async (req, res, next) => {
  try {
    const item = (await readCollection('complaints')).find((complaint) => complaint.id === req.params.id);
    if (!item) return res.status(404).json({ success: false, error: 'Complaint not found.' });
    if (req.user.role === 'citizen' && item.citizenId !== req.user.id) return res.status(403).json({ success: false, error: 'You cannot view this history.' });
    if (req.user.role === 'worker' && item.workerId !== req.user.id) return res.status(403).json({ success: false, error: 'This complaint is not assigned to you.' });
    res.json({ success: true, data: { history: item.statusHistory || [] } });
  } catch (error) { next(error); }
});

router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    if (!['citizen', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Workers are not allowed to delete complaints.' });
    }
    let deleted;
    await updateCollection('complaints', async (items) => {
      const index = items.findIndex((item) => item.id === req.params.id);
      if (index < 0) throw Object.assign(new Error('Complaint not found.'), { status: 404 });
      const complaint = items[index];
      if (req.user.role === 'citizen' && complaint.citizenId !== req.user.id) {
        throw Object.assign(new Error('You can delete only your own complaints.'), { status: 403 });
      }
      deleted = complaint;
      return { items: items.filter((item) => item.id !== complaint.id) };
    });

    await Promise.all([
      updateCollection('notifications', async (items) => ({ items: items.filter((item) => item.complaintId !== deleted.id) })),
      updateCollection('feedback', async (items) => ({ items: items.filter((item) => item.complaintId !== deleted.id) }))
    ]);

    const imagePaths = [deleted.imagePath, ...(deleted.evidence || []).map((item) => item.path)].filter(Boolean);
    await Promise.all(imagePaths.map(async (relativePath) => {
      const match = /^\/uploads\/(complaints|cleaning_evidence)\/([\w.-]+\.(?:jpg|png|webp))$/i.exec(relativePath);
      if (!match) return;
      const imageRoot = path.resolve(storageDir, 'uploads', match[1]);
      const imagePath = path.resolve(imageRoot, path.basename(match[2]));
      if (!imagePath.startsWith(`${imageRoot}${path.sep}`)) return;
      try { await fs.unlink(imagePath); } catch (error) { if (error.code !== 'ENOENT') console.error('Could not remove deleted complaint image:', error); }
    }));

    return res.json({ success: true, data: { id: deleted.id, message: 'Complaint deleted.' } });
  } catch (error) { return next(error); }
});

router.post('/:id/evidence', authenticate, allowRoles('worker'), uploadFor('cleaning_evidence').single('photo'), verifyImage, async (req, res, next) => {
  try {
    if (!req.file) throw Object.assign(new Error('Choose an image to upload.'), { status: 400 });
    const type = enumValue(req.body.type, ['before', 'after'], 'evidence type');
    let updated;
    await updateCollection('complaints', async (items) => {
      const index = items.findIndex((item) => item.id === req.params.id);
      if (index < 0) throw Object.assign(new Error('Complaint not found.'), { status: 404 });
      if (items[index].workerId !== req.user.id) throw Object.assign(new Error('This complaint is not assigned to you.'), { status: 403 });
      const item = { ...items[index], evidence: [...(items[index].evidence || []), { type, path: `/uploads/cleaning_evidence/${path.basename(req.file.path)}`, at: new Date().toISOString(), workerId: req.user.id }] };
      items[index] = item; updated = item; return { items };
    });
    res.status(201).json({ success: true, data: { complaint: safeComplaint(updated) } });
  } catch (error) { next(error); }
});

router.patch('/:id/task', authenticate, allowRoles('worker'), async (req, res, next) => {
  try {
    const status = enumValue(req.body.status, ['In Progress', 'Resolved'], 'task status');
    const note = req.body.note ? text(req.body.note, 'Work note', 1000) : '';
    let updated;
    await updateCollection('complaints', async (items) => {
      const index = items.findIndex((item) => item.id === req.params.id);
      if (index < 0) throw Object.assign(new Error('Complaint not found.'), { status: 404 });
      if (items[index].workerId !== req.user.id) throw Object.assign(new Error('This complaint is not assigned to you.'), { status: 403 });
      if (items[index].status === 'Resolved' || items[index].status === 'Rejected') throw Object.assign(new Error('This task is already closed.'), { status: 409 });
      if (status === 'Resolved' && !(items[index].evidence || []).some((image) => image.type === 'after')) throw Object.assign(new Error('Upload an after-cleaning photo before resolving this task.'), { status: 400 });
      const now = new Date().toISOString();
      updated = { ...items[index], status, workNotes: note || items[index].workNotes, updatedAt: now, statusHistory: [...items[index].statusHistory, { status, note: note || `Task marked ${status.toLowerCase()}.`, actor: req.user.name, at: now }] };
      items[index] = updated; return { items };
    });
    await notify(updated.citizenId, updated.id, `Complaint ${updated.id} is now ${updated.status}.`);
    res.json({ success: true, data: { complaint: safeComplaint(updated) } });
  } catch (error) { next(error); }
});

module.exports = { router, notify, safeComplaint };