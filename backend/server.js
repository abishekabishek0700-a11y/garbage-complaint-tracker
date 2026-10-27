require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { initializeStorage, storageDir } = require('./utils/fileStorage');
const { authenticate, allowRoles } = require('./middleware/authMiddleware');
const authRoutes = require('./routes/auth');
const { router: complaintRoutes } = require('./routes/complaints');
const adminRoutes = require('./routes/admin');
const workerRoutes = require('./routes/workers');
const feedbackRoutes = require('./routes/feedback');
const notificationRoutes = require('./routes/notifications');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET.includes('replace-with')) {
  console.error('JWT_SECRET must be set to a random secret of at least 32 characters. Copy .env.example to .env and change it.');
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
const allowedFrontendOrigins = new Set([
  'http://localhost:8501',
  'http://127.0.0.1:8501',
  ...(process.env.FRONTEND_ORIGINS || '').split(','),
  process.env.FRONTEND_ORIGIN || ''
].map((origin) => origin.trim()).filter(Boolean));
app.use(cors({ origin: (origin, callback) => callback(null, !origin || allowedFrontendOrigins.has(origin)) }));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use((req, _res, next) => { req.body = req.body || {}; next(); });
const authWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({
    success: false,
    error: 'Too many registration or login attempts. Wait a few minutes before trying again.'
  })
});
app.use('/api/auth', (req, res, next) => req.method === 'POST' ? authWriteLimiter(req, res, next) : next());

app.get('/health', (_req, res) => res.json({ success: true, data: { status: 'ok' } }));
app.use('/api/auth', authRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/workers', workerRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/notifications', notificationRoutes);
app.get('/api/files/uploads/:folder/:filename', authenticate, async (req, res, next) => {
  try {
    if (!['complaints', 'cleaning_evidence'].includes(req.params.folder) || !/^[\w.-]+\.(jpg|png|webp)$/i.test(req.params.filename)) return res.status(404).json({ success: false, error: 'Image not found.' });
    const { readCollection } = require('./utils/fileStorage');
    const complaints = await readCollection('complaints');
    const reference = `/uploads/${req.params.folder}/${req.params.filename}`;
    const linked = complaints.some((item) => req.user.role === 'admin' || (item.citizenId === req.user.id && (item.imagePath === reference || (item.evidence || []).some((image) => image.path === reference))) || (item.workerId === req.user.id && (item.imagePath === reference || (item.evidence || []).some((image) => image.path === reference))));
    if (!linked) return res.status(403).json({ success: false, error: 'You cannot access this image.' });
    return res.sendFile(path.join(storageDir, 'uploads', req.params.folder, req.params.filename), (error) => { if (error) next(error); });
  } catch (error) { return next(error); }
});
app.use((_req, res) => res.status(404).json({ success: false, error: 'Endpoint not found.' }));
app.use((error, _req, res, _next) => {
  const status = error.status || (error.name === 'MulterError' ? 400 : 500);
  if (status >= 500) console.error(error);
  res.status(status).json({ success: false, error: status === 500 ? 'Unexpected server error.' : error.message });
});

const port = Number(process.env.PORT) || 5000;
initializeStorage().then(() => app.listen(port, () => console.log(`Garbage Complaint Tracker API listening on http://localhost:${port}`)))
  .catch((error) => { console.error('Could not initialize local storage:', error); process.exit(1); });

module.exports = app;