const path = require('path');
const fs = require('fs/promises');
const multer = require('multer');
const { storageDir } = require('./fileStorage');

const maxBytes = Math.max(1, Number(process.env.MAX_UPLOAD_MB) || 8) * 1024 * 1024;
const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);

function uploadFor(folder) {
  const root = path.resolve(storageDir, 'uploads', folder);
  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, callback) => callback(null, root),
      filename: (_req, file, callback) => {
        const ext = ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' })[file.mimetype];
        callback(null, `${Date.now()}-${require('crypto').randomUUID()}${ext || ''}`);
      }
    }),
    limits: { fileSize: maxBytes, files: 1 },
    fileFilter: (_req, file, callback) => {
      if (allowed.has(file.mimetype)) return callback(null, true);
      return callback(Object.assign(new Error('Only JPEG, PNG, and WebP images are allowed.'), { status: 400 }));
    }
  });
}

function publicImagePath(file) {
  return file ? `/uploads/${path.basename(path.dirname(file.path))}/${path.basename(file.path)}` : null;
}

async function verifyImage(req, res, next) {
  if (!req.file) return next();
  try {
    const handle = await fs.open(req.file.path, 'r');
    const buffer = Buffer.alloc(12);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    await handle.close();
    const bytes = buffer.subarray(0, bytesRead);
    const valid = (req.file.mimetype === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
      || (req.file.mimetype === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
      || (req.file.mimetype === 'image/webp' && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP');
    if (!valid) {
      await fs.unlink(req.file.path);
      return res.status(400).json({ success: false, error: 'The uploaded file does not match a supported image format.' });
    }
    return next();
  } catch (error) { return next(error); }
}

module.exports = { uploadFor, publicImagePath, verifyImage };