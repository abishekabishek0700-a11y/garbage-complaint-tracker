require('dotenv').config();
const readline = require('readline/promises');
const { stdin: input, stdout: output } = require('process');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { initializeStorage, readCollection, updateCollection } = require('../utils/fileStorage');

async function main() {
  await initializeStorage();
  if (!input.isTTY) throw new Error('Run this command in an interactive terminal so the password can be entered without echo.');
  const rl = readline.createInterface({ input, output });
  try {
    const name = (await rl.question('Admin name: ')).trim();
    const email = (await rl.question('Admin email: ')).trim().toLowerCase();
    output.write('Admin password (10+ characters): ');
    const writeToOutput = rl._writeToOutput;
    rl._writeToOutput = (text) => {
      if (text.includes('\n')) output.write('\n');
    };
    let password;
    try { password = await rl.question(''); } finally { rl._writeToOutput = writeToOutput; }
    if (!name || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 10 || password.length > 128) throw new Error('Invalid name, email, or password length.');
    const user = { id: crypto.randomUUID(), name, email, address: 'Administration', role: 'admin', passwordHash: await bcrypt.hash(password, 12), createdAt: new Date().toISOString() };
    await updateCollection('users', async (items) => {
      if (items.some((item) => item.role === 'admin')) throw new Error('An administrator already exists. This command only creates the initial admin.');
      if (items.some((item) => item.email.toLowerCase() === email)) throw new Error('An account with this email already exists.');
      return { items: [...items, user] };
    });
    console.log(`Admin account created for ${email}.`);
  } finally { rl.close(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });