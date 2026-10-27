const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { updateCollection } = require('./fileStorage');
const { email, text } = require('./validation');

async function bootstrapAdminFromEnvironment() {
  const configuredEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const configuredPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const configuredName = process.env.BOOTSTRAP_ADMIN_NAME;
  if (!configuredEmail && !configuredPassword && !configuredName) return false;

  try {
    if (!configuredEmail || !configuredPassword) {
      throw new Error('Set both BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD, or remove all BOOTSTRAP_ADMIN variables.');
    }
    const adminEmail = email(configuredEmail);
    const adminName = text(configuredName || 'Administrator', 'Admin name', 100);
    if (configuredPassword.length < 10 || configuredPassword.length > 128) {
      throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be 10 to 128 characters.');
    }

    let created = false;
    await updateCollection('users', async (users) => {
      const existing = users.find((user) => String(user.email || '').toLowerCase() === adminEmail);
      if (existing) {
        if (existing.role !== 'admin') {
          throw new Error('Bootstrap email already belongs to a non-admin account; no account was changed.');
        }
        return { items: users };
      }

      const admin = {
        id: crypto.randomUUID(),
        name: adminName,
        email: adminEmail,
        address: 'Administration',
        role: 'admin',
        passwordHash: await bcrypt.hash(configuredPassword, 12),
        createdAt: new Date().toISOString()
      };
      created = true;
      return { items: [...users, admin] };
    });
    return created;
  } finally {
    delete process.env.BOOTSTRAP_ADMIN_EMAIL;
    delete process.env.BOOTSTRAP_ADMIN_NAME;
    delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
  }
}

module.exports = bootstrapAdminFromEnvironment;