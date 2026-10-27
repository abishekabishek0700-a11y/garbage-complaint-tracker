const fs = require('fs/promises');
const path = require('path');

const storageDir = path.resolve(process.env.GCT_STORAGE_DIR || path.join(__dirname, '..', 'storage'));
const filenames = ['users', 'complaints', 'workers', 'notifications', 'feedback', 'schedules', 'audit_logs'];
const writeQueues = new Map();

async function initializeStorage() {
  await fs.mkdir(path.join(storageDir, 'uploads', 'complaints'), { recursive: true });
  await fs.mkdir(path.join(storageDir, 'uploads', 'cleaning_evidence'), { recursive: true });
  await Promise.all(filenames.map(async (name) => {
    const file = path.join(storageDir, `${name}.json`);
    try { await fs.access(file); } catch { await fs.writeFile(file, '[]\n', { flag: 'wx' }).catch((error) => { if (error.code !== 'EEXIST') throw error; }); }
  }));
}

function filePath(name) {
  if (!filenames.includes(name)) throw new Error('Unknown storage collection');
  return path.join(storageDir, `${name}.json`);
}

async function readCollection(name) {
  await initializeStorage();
  const raw = await fs.readFile(filePath(name), 'utf8');
  const value = JSON.parse(raw);
  if (!Array.isArray(value)) throw new Error(`Storage file ${name}.json must contain a JSON array`);
  return value;
}

async function writeCollection(name, value) {
  await initializeStorage();
  if (!Array.isArray(value)) throw new TypeError('Collections must be JSON arrays');
  const previous = writeQueues.get(name) || Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    const target = filePath(name);
    const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    await fs.rename(temp, target);
  });
  writeQueues.set(name, next);
  try { await next; } finally { if (writeQueues.get(name) === next) writeQueues.delete(name); }
}

async function updateCollection(name, updater) {
  const previous = writeQueues.get(name) || Promise.resolve();
  let result;
  const next = previous.catch(() => {}).then(async () => {
    const items = await readCollection(name);
    result = await updater(items);
    if (!Array.isArray(result.items)) throw new TypeError('Updater must return an items array');
    const target = filePath(name);
    const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temp, `${JSON.stringify(result.items, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    await fs.rename(temp, target);
  });
  writeQueues.set(name, next);
  try { await next; return result.value; } finally { if (writeQueues.get(name) === next) writeQueues.delete(name); }
}

module.exports = { storageDir, initializeStorage, readCollection, writeCollection, updateCollection };