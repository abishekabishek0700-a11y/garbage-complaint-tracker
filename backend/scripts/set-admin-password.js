require('dotenv').config();
const readline = require('readline/promises');
const { stdin: input, stdout: output } = require('process');
const bcrypt = require('bcryptjs');
const { initializeStorage, updateCollection } = require('../utils/fileStorage');

async function askHidden(rl, label) {
  output.write(label);
  const writeToOutput = rl._writeToOutput;
  rl._writeToOutput = (text) => {
    if (text.includes('\n')) output.write('\n');
  };
  try {
    return await rl.question('');
  } finally {
    rl._writeToOutput = writeToOutput;
  }
}

async function main() {
  if (!input.isTTY) throw new Error('Run this command in an interactive terminal so passwords are not echoed.');
  await initializeStorage();
  const rl = readline.createInterface({ input, output });
  try {
    const email = (await rl.question('Existing admin email: ')).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
    const password = await askHidden(rl, 'New admin password (10-128 characters): ');
    const confirmation = await askHidden(rl, 'Confirm new password: ');
    if (password.length < 10 || password.length > 128) throw new Error('Password must be 10 to 128 characters.');
    if (password !== confirmation) throw new Error('Passwords do not match. No changes were made.');

    let updated = false;
    await updateCollection('users', async (users) => {
      const matches = users.filter((user) => user.role === 'admin' && user.email.toLowerCase() === email);
      if (matches.length === 0) throw new Error('No existing admin account has that email. No changes were made.');
      if (matches.length > 1) throw new Error('Multiple admin accounts use that email. No changes were made.');
      const passwordHash = await bcrypt.hash(password, 12);
      const items = users.map((user) => user.id === matches[0].id
        ? { ...user, passwordHash, passwordChangedAt: new Date().toISOString() }
        : user);
      updated = true;
      return { items };
    });
    if (updated) console.log(`Password updated for admin account ${email}.`);
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});