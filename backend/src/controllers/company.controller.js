const { Company, Order } = require('../models');
const { logActivity } = require('../utils/audit');
const { toId } = require('../utils/helpers');
const { resolveFileInput, deleteUploaded } = require('../utils/uploads');

exports.list = async (_req, res) => {
  const companies = await Company.rows({}, { sort: { id: 1 } });
  res.json({ companies });
};

exports.create = async (req, res) => {
  const { name, code, logo_url, gst_number, address, city, state, pincode, mobile, email, bank_name, account_no, ifsc_code, branch, terms } = req.body;
  if (!name || !gst_number || !code || !String(name).trim() || !String(gst_number).trim() || !String(code).trim()) {
    return res.status(400).json({ error: 'Company Name, Code, and GSTIN are required' });
  }
  if (logo_url && !/^(data:image\/(png|jpe?g|webp|gif);base64,|https?:\/\/|\/uploads\/)/i.test(String(logo_url))) {
    return res.status(400).json({ error: 'Logo must be an uploaded image or an http(s) link' });
  }
  if (logo_url && String(logo_url).length > 3 * 1024 * 1024) {
    return res.status(400).json({ error: 'Logo image is too large (max ~2 MB)' });
  }
  if (await Company.exists({ code: String(code).trim() })) {
    return res.status(400).json({ error: `Company code "${code}" already exists` });
  }

  // base64 upload -> file on disk, DB keeps only the path
  const logoPath = await resolveFileInput(logo_url || '', 'companies', req);

  const company = await Company.insert({
    name: String(name).trim(), code: String(code).trim(), logo_url: logoPath || '', gst_number: String(gst_number).trim().toUpperCase(), address: address || '', city: city || '', state: state || '',
    pincode: pincode || '', mobile: mobile || '', email: email || '', bank_name: bank_name || '',
    account_no: account_no || '', ifsc_code: ifsc_code || '', branch: branch || '', terms: terms || '',
  });

  await logActivity(req.user.id, 'COMPANY_CREATED', 'company', code, `Created company ${name}`);
  res.json({ id: company.id, message: 'Company created successfully' });
};

exports.update = async (req, res) => {
  const id = toId(req.params.id);
  const existing = await Company.row({ id });
  if (!existing) return res.status(404).json({ error: 'Company not found' });

  const { name, gst_number } = req.body;
  if (name !== undefined && !String(name).trim()) return res.status(400).json({ error: 'Company name cannot be empty' });
  if (gst_number !== undefined && !String(gst_number).trim()) return res.status(400).json({ error: 'GSTIN cannot be empty' });

  // logo_url: image data URL (uploaded file) or http(s) link. Empty string removes the logo.
  const logo = req.body.logo_url;
  if (logo && !/^(data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,|https?:\/\/|\/uploads\/)/i.test(String(logo))) {
    return res.status(400).json({ error: 'Logo must be an uploaded image or an http(s) link' });
  }
  if (logo && String(logo).length > 3 * 1024 * 1024) {
    return res.status(400).json({ error: 'Logo image is too large (max ~2 MB)' });
  }

  // Only update the fields that were actually sent (the old code wrote `undefined` over missing ones)
  const fields = ['name', 'logo_url', 'gst_number', 'address', 'city', 'state', 'pincode', 'mobile', 'email',
    'bank_name', 'account_no', 'ifsc_code', 'branch', 'terms', 'status'];
  const set = {};
  for (const f of fields) if (req.body[f] !== undefined && req.body[f] !== null) set[f] = typeof req.body[f] === 'string' && f !== 'logo_url' ? req.body[f].trim() : req.body[f];

  // base64 upload -> file on disk, DB keeps only the path
  if (set.logo_url) set.logo_url = await resolveFileInput(set.logo_url, 'companies', req);

  await Company.updateOne({ id }, { $set: set });

  // logo replaced or removed -> delete old file from disk
  if (set.logo_url !== undefined && existing.logo_url && existing.logo_url !== set.logo_url) {
    await deleteUploaded(existing.logo_url);
  }

  await logActivity(req.user.id, 'COMPANY_UPDATED', 'company', req.params.id, `Updated billing company ${set.name || existing.name}`);
  res.json({ message: 'Company updated successfully' });
};

// Delete a billing company only if no order / invoice was ever raised on it
exports.remove = async (req, res) => {
  const id = toId(req.params.id);
  const company = id === null ? null : await Company.row({ id });
  if (!company) return res.status(404).json({ error: 'Company not found' });

  const used = await Order.countDocuments({ company_id: id });
  if (used > 0) {
    return res.status(400).json({
      error: `Cannot delete "${company.name}": ${used} order(s) were billed under it. Orders and invoices must keep their company.`,
    });
  }
  await Company.deleteOne({ id });
  await deleteUploaded(company.logo_url);
  await logActivity(req.user.id, 'COMPANY_DELETED', 'company', company.code, `Deleted billing company ${company.name}`);
  res.json({ message: 'Company deleted successfully' });
};
