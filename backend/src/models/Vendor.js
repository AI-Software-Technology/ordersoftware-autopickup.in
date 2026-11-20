const { defineModel, str, num, reqStr, reqNum, createdAt } = require('./defineModel');

// "Vendor" = Party / Customer
module.exports = defineModel('Vendor', 'vendors', {
  vendor_code: { type: String, required: true, unique: true },
  company_name: reqStr(),
  contact_person: reqStr(),
  mobile: str(''),
  alt_mobile: str(),
  email: str(),
  gstin: str(),
  aadhaar_no: str(),
  billing_address: reqStr(),
  delivery_address: str(),
  city: reqStr(),
  state: reqStr(),
  pincode: str(),
  assigned_sales_person_id: reqNum(),
  created_by_id: reqNum(),
  // Advance / excess cash held for this party. Adjustable against future orders.
  credit_balance: num(0),
  status: str('active'),
  notes: str(),
  created_at: createdAt(),
  updated_by_id: num(),
  updated_at: str(),
}, [{ assigned_sales_person_id: 1 }, { company_name: 1 }]);
