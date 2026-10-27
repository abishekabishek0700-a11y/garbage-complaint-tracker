const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { readCollection, updateCollection } = require('../utils/fileStorage');
const { text, email } = require('../utils/validation');
const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();
const safeUser = ({ passwordHash, ...user }) => user;
const tokenFor = (user) => jwt.sign({ id: user.id, role: user.role, name: user.name }, process.env.JWT_SECRET, { expiresIn: process.env.TOKEN_EXPIRES_IN || '12h' });

router.post('/register', async (req, res, next) => {
  try {
    if (req.body.role && req.body.role !== 'citizen') throw Object.assign(new Error('Public registration is only available for citizens.'), { status: 400 });
    const name = text(req.body.name, 'Name', 100);
    const address = text(req.body.address, 'Address', 300);
    const userEmail = email(req.body.email);
    if (typeof req.body.password !== 'string' || req.body.password.length < 10 || req.body.password.length > 128) throw Object.assign(new Error('Password must be 10 to 128 characters.'), { status: 400 });
    let created;
    await updateCollection('users', async (users) => {
      if (users.some((user) => user.email === userEmail)) throw Object.assign(new Error('An account with this email already exists.'), { status: 409 });
      created = { id: crypto.randomUUID(), name, email: userEmail, address, role: 'citizen', passwordHash: await bcrypt.hash(req.body.password, 12), createdAt: new Date().toISOString() };
      return { items: [...users, created] };
    });
    res.status(201).json({ success: true, data: { user: safeUser(created), token: tokenFor(created) } });
  } catch (error) { next(error); }
});

router.post('/login', async (req, res, next) => {
  try {
    const userEmail = email(req.body.email);
    const users = await readCollection('users');
    const user = users.find((item) => item.email === userEmail);
    if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.passwordHash))) return res.status(401).json({ success: false, error: 'Email or password is incorrect.' });
    if (user.role === 'worker') {
      const worker = (await readCollection('workers')).find((item) => item.userId === user.id && item.active);
      if (!worker) return res.status(403).json({ success: false, error: 'This worker account is inactive.' });
    }
    res.json({ success: true, data: { user: safeUser(user), token: tokenFor(user) } });
  } catch (error) { next(error); }
});

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = (await readCollection('users')).find((item) => item.id === req.user.id);
    if (!user) return res.status(401).json({ success: false, error: 'Account no longer exists.' });
    res.json({ success: true, data: { user: safeUser(user) } });
  } catch (error) { next(error); }
});

module.exports = router;