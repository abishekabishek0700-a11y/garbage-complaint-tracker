const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { readCollection, updateCollection } = require('../utils/fileStorage');
const { text, enumValue, statuses } = require('../utils/validation');
const { authenticate, allowRoles } = require('../middleware/authMiddleware');
const { notify, safeComplaint } = require('./complaints');

const router = express.Router();
router.use(authenticate, allowRoles('admin'));

async function audit(actor, action, targetId, details = {}) {
  await updateCollection('audit_logs', async (items) => ({ items: [{ id: crypto.randomUUID(), actorId: actor.id, actorName: actor.name, action, targetId, details, at: new Date().toISOString() }, ...items] }));
}

router.get('/stats', async (_req, res, next) => {
  try {
    const complaints = await readCollection('complaints');
    const counts = Object.fromEntries(statuses.map((status) => [status, complaints.filter((item) => item.status === status).length]));
    res.json({ success: true, data: { total: complaints.length, pending: counts.Submitted + counts.Verified + counts.Assigned, inProgress: counts['In Progress'], resolved: counts.Resolved, rejected: counts.Rejected, byStatus: counts, byCategory: Object.fromEntries([...new Set(complaints.map((item) => item.category))].map((category) => [category, complaints.filter((item) => item.category === category).length])) } });
  } catch (error) { next(error); }
});

router.patch('/complaints/:id/status', async (req, res, next) => {
  try {
    const status = enumValue(req.body.status, statuses, 'status');
    const note = status === 'Rejected' ? text(req.body.reason, 'Rejection reason', 1000) : (req.body.note ? text(req.body.note, 'Update note', 1000) : `Status updated to ${status}.`);
    let updated;
    await updateCollection('complaints', async (items) => {
      const index = items.findIndex((item) => item.id === req.params.id);
      if (index < 0) throw Object.assign(new Error('Complaint not found.'), { status: 404 });
      updated = { ...items[index], status, rejectionReason: status === 'Rejected' ? note : null, updatedAt: new Date().toISOString(), statusHistory: [...items[index].statusHistory, { status, note, actor: req.user.name, at: new Date().toISOString() }] };
      items[index] = updated; return { items };
    });
    await notify(updated.citizenId, updated.id, `Complaint ${updated.id} is now ${status}${status === 'Rejected' ? `: ${note}` : '.'}`);
    await audit(req.user, `complaint.${status.toLowerCase().replaceAll(' ', '_')}`, updated.id, { note });
    res.json({ success: true, data: { complaint: safeComplaint(updated) } });
  } catch (error) { next(error); }
});

router.patch('/complaints/:id/assign', async (req, res, next) => {
  try {
    const workerId = text(req.body.workerId, 'Worker', 100);
    const workers = await readCollection('workers');
    const worker = workers.find((item) => item.id === workerId && item.active);
    if (!worker) throw Object.assign(new Error('Choose an active worker.'), { status: 400 });
    let updated;
    await updateCollection('complaints', async (items) => {
      const index = items.findIndex((item) => item.id === req.params.id);
      if (index < 0) throw Object.assign(new Error('Complaint not found.'), { status: 404 });
      updated = { ...items[index], workerId: worker.id, workerName: worker.name, status: 'Assigned', updatedAt: new Date().toISOString(), statusHistory: [...items[index].statusHistory, { status: 'Assigned', note: `Assigned to ${worker.name}.`, actor: req.user.name, at: new Date().toISOString() }] };
      items[index] = updated; return { items };
    });
    await notify(updated.citizenId, updated.id, `A worker has been assigned to complaint ${updated.id}.`);
    await audit(req.user, 'complaint.assigned', updated.id, { workerId: worker.id });
    res.json({ success: true, data: { complaint: safeComplaint(updated) } });
  } catch (error) { next(error); }
});

router.get('/workers', async (_req, res, next) => {
  try { res.json({ success: true, data: { workers: await readCollection('workers') } }); } catch (error) { next(error); }
});
router.post('/workers', async (req, res, next) => {
  try {
    const name = text(req.body.name, 'Name', 100);
    const email = text(req.body.email, 'Email', 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Object.assign(new Error('Enter a valid email address.'), { status: 400 });
    if (typeof req.body.password !== 'string' || req.body.password.length < 10 || req.body.password.length > 128) throw Object.assign(new Error('Worker password must be 10 to 128 characters.'), { status: 400 });
    const user = { id: crypto.randomUUID(), name, email, address: text(req.body.area, 'Area', 200), role: 'worker', passwordHash: await bcrypt.hash(req.body.password, 12), createdAt: new Date().toISOString() };
    await updateCollection('users', async (items) => {
      if (items.some((item) => item.email === email)) throw Object.assign(new Error('An account with this email already exists.'), { status: 409 });
      return { items: [...items, user] };
    });
    const worker = { id: user.id, userId: user.id, name, email, phone: text(req.body.phone, 'Phone', 40), area: user.address, active: true, createdAt: new Date().toISOString() };
    await updateCollection('workers', async (items) => ({ items: [worker, ...items] }));
    await audit(req.user, 'worker.created', worker.id);
    res.status(201).json({ success: true, data: { worker } });
  } catch (error) { next(error); }
});
router.patch('/workers/:id', async (req, res, next) => {
  try {
    let updated;
    await updateCollection('workers', async (items) => {
      const index = items.findIndex((item) => item.id === req.params.id);
      if (index < 0) throw Object.assign(new Error('Worker not found.'), { status: 404 });
      updated = { ...items[index], ...(req.body.name !== undefined ? { name: text(req.body.name, 'Name', 100) } : {}), ...(req.body.phone !== undefined ? { phone: text(req.body.phone, 'Phone', 40) } : {}), ...(req.body.area !== undefined ? { area: text(req.body.area, 'Area', 200) } : {}), ...(req.body.active !== undefined ? { active: Boolean(req.body.active) } : {}) };
      items[index] = updated; return { items };
    });
    await audit(req.user, 'worker.updated', updated.id);
    res.json({ success: true, data: { worker: updated } });
  } catch (error) { next(error); }
});
router.get('/feedback', async (_req, res, next) => {
  try { res.json({ success: true, data: { feedback: await readCollection('feedback') } }); } catch (error) { next(error); }
});
router.get('/audit', async (_req, res, next) => {
  try { res.json({ success: true, data: { auditLogs: await readCollection('audit_logs') } }); } catch (error) { next(error); }
});
router.get('/report.csv', async (_req, res, next) => {
  try {
    const items = await readCollection('complaints');
    const fields = ['id', 'title', 'category', 'status', 'citizenName', 'address', 'location', 'workerName', 'createdAt', 'updatedAt', 'rejectionReason'];
    const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const csv = [fields.join(','), ...items.map((item) => fields.map((field) => quote(item[field])).join(','))].join('\r\n');
    await audit(req.user, 'report.exported', 'all', { rows: items.length });
    res.type('text/csv').attachment('garbage-complaints.csv').send(csv);
  } catch (error) { next(error); }
});

module.exports = router;