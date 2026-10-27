const categories = ['Roadside garbage', 'Overflowing dustbins', 'Illegal dumping', 'Plastic waste', 'Drainage waste', 'Other'];
const statuses = ['Submitted', 'Verified', 'Assigned', 'In Progress', 'Resolved', 'Rejected'];

function text(value, field, max = 2000) {
  if (typeof value !== 'string' || !value.trim()) throw Object.assign(new Error(`${field} is required.`), { status: 400 });
  const result = value.trim();
  if (result.length > max) throw Object.assign(new Error(`${field} must be ${max} characters or fewer.`), { status: 400 });
  return result;
}

function email(value) {
  const result = text(value, 'Email', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw Object.assign(new Error('Enter a valid email address.'), { status: 400 });
  return result;
}

function enumValue(value, allowed, field) {
  if (!allowed.includes(value)) throw Object.assign(new Error(`Choose a valid ${field}.`), { status: 400 });
  return value;
}

module.exports = { categories, statuses, text, email, enumValue };