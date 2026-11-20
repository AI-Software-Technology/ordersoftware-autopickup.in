const { defineModel, str, reqStr, createdAt } = require('./defineModel');

module.exports = defineModel('Company', 'companies', {
  name: reqStr(),
  code: { type: String, required: true, unique: true },
  logo_url: str(''),
  gst_number: reqStr(),
  address: str(''),
  city: str(''),
  state: str(''),
  pincode: str(''),
  mobile: str(''),
  email: str(''),
  bank_name: str(''),
  account_no: str(''),
  ifsc_code: str(''),
  branch: str(''),
  terms: str(''),
  status: str('active'),
  created_at: createdAt(),
});
