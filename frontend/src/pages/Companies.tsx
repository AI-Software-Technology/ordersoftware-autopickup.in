import React, { useState, useEffect } from 'react';
import { Building, Edit2, Plus, RefreshCw, X, CheckCircle2, Trash2 } from 'lucide-react';
import { Company } from '../types.js';
import { apiFetch } from '../lib/api.js';
import { getToken } from '../lib/session.js';
import { confirmAndDelete } from '../lib/deleteApi.js';
import { StateSelect } from '../components/StateSelect.js';
import { stateForCity } from '../lib/india.js';

// Shrinks an uploaded logo to max 400px and returns a PNG data URL (keeps transparency, small payload)
function fileToLogoDataUrl(file: File, maxSize = 400): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Please choose an image file (PNG, JPG, WEBP)'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the file'));
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = () => reject(new Error('This image cannot be opened'));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * scale));
        c.height = Math.max(1, Math.round(img.naturalHeight * scale));
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/png'));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export const Companies: React.FC = () => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [saving, setSaving] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [stateByUser, setStateByUser] = useState(true);

  const handleDeleteCompany = async (c: Company) => {
    if (await confirmAndDelete(`/api/companies/${c.id}`, `Delete billing company "${c.name}"? This cannot be undone.`)) fetchCompanies();
  };

  const isNew = editingCompany !== null && editingCompany.id === 0;

  const openNew = () => {
    setLogoError(null);
    setStateByUser(false);
    setEditingCompany({
      id: 0, name: '', code: '', logo_url: '', gst_number: '', address: '', city: '', state: '', pincode: '',
      mobile: '', email: '', bank_name: '', account_no: '', ifsc_code: '', branch: '', terms: '', status: 'active'
    });
  };

  const openEdit = (c: Company) => {
    setLogoError(null);
    setStateByUser(false);
    setEditingCompany({ ...c });
  };

  const handleLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !editingCompany) return;
    try {
      setLogoError(null);
      const dataUrl = await fileToLogoDataUrl(file);
      setEditingCompany(prev => (prev ? { ...prev, logo_url: dataUrl } : prev));
    } catch (err: any) {
      setLogoError(err.message || 'Logo upload failed');
    }
  };

  const fetchCompanies = async () => {
    setLoading(true);
    try {
      const token = getToken();
      const res = await apiFetch('/api/companies', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const j = await res.json();
        setCompanies(j.companies || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCompany) return;
    setSaving(true);
    try {
      const token = getToken();
      const res = await apiFetch(isNew ? '/api/companies' : `/api/companies/${editingCompany.id}`, {
        method: isNew ? 'POST' : 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(editingCompany)
      });
      if (res.ok) {
        setEditingCompany(null);
        fetchCompanies();
      } else {
        const j = await res.json();
        alert(j.error || (isNew ? 'Could not add company' : 'Update failed'));
      }
    } catch (err) {
      console.error(err);
      alert('Network error while saving');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6   mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Building className="w-6 h-6 text-amber-500" />
            Billing Entities & Invoicing Companies
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Configure the two billing companies used for generating GST invoices, order slips, and bank account remittance details.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start">
          <button
            onClick={fetchCompanies}
            className="p-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 flex items-center gap-1.5"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </button>
          <button
            onClick={openNew}
            className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold text-xs rounded-lg shadow-xs transition flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Company</span>
          </button>
        </div>
      </div>

      {/* Companies Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {companies.map(c => (
          <div key={c.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between space-y-5">
            <div>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  {c.logo_url ? (
                    <img src={c.logo_url} alt={c.name} className="w-14 h-14 rounded-xl object-contain bg-white border border-slate-200 shadow-xs" />
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-slate-900 text-amber-400 font-bold flex items-center justify-center text-lg shadow-xs">
                      {c.code}
                    </div>
                  )}
                  <div>
                    <span className="font-mono text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                      {c.code}
                    </span>
                    <h3 className="font-bold text-slate-900 text-base mt-1">{c.name}</h3>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                <button
                  onClick={() => openEdit(c)}
                  className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
                  title="Edit Company Details"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDeleteCompany(c)}
                  className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                  title="Delete Company"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                </div>
              </div>

              <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
                <p><strong>GSTIN:</strong> <span className="font-mono font-bold text-slate-900">{c.gst_number}</span></p>
                <p><strong>Registered Address:</strong> {c.address}, {c.city}, {c.state} - {c.pincode}</p>
                <p><strong>Official Contact:</strong> {c.mobile} | {c.email}</p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 text-xs space-y-1">
                <p className="font-bold text-slate-800 text-[11px] uppercase tracking-wide">Bank Account Remittance Details</p>
                <div className="grid grid-cols-2 gap-2 text-slate-600 mt-1">
                  <div>Bank: <strong className="text-slate-800">{c.bank_name}</strong></div>
                  <div>Account: <strong className="font-mono text-slate-800">{c.account_no}</strong></div>
                  <div>IFSC: <strong className="font-mono text-slate-800">{c.ifsc_code}</strong></div>
                  <div>Branch: <strong className="text-slate-800">{c.branch}</strong></div>
                </div>
              </div>

              {c.terms && (
                <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-500">
                  <p className="font-semibold text-slate-700 mb-0.5">Default Invoicing Terms:</p>
                  <p className="line-clamp-2">{c.terms}</p>
                </div>
              )}
            </div>

            <div className="pt-2 border-t flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" /> Active Billing Entity
              </span>
              <button
                onClick={() => openEdit(c)}
                className="text-amber-600 hover:text-amber-700 font-semibold"
              >
                Edit Company & Logo →
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* EDIT COMPANY MODAL */}
      {editingCompany && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-slate-900">{isNew ? 'Add New Billing Company' : 'Edit Company Information'}</h3>
              <button onClick={() => setEditingCompany(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            <form onSubmit={handleSaveCompany} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">Company Trade Name *</label>
                <input
                  type="text"
                  required
                  value={editingCompany.name}
                  onChange={(e) => setEditingCompany({ ...editingCompany, name: e.target.value })}
                  className="w-full p-2 bg-slate-50 border rounded-lg font-bold"
                />
              </div>

              {isNew && (
                <div>
                  <label className="block font-semibold mb-1">Company Code * <span className="font-normal text-slate-400">(short unique code, e.g. CMP-C)</span></label>
                  <input
                    type="text"
                    required
                    maxLength={12}
                    value={editingCompany.code}
                    onChange={(e) => setEditingCompany({ ...editingCompany, code: e.target.value.toUpperCase().replace(/\s+/g, '-') })}
                    className="w-full p-2 bg-slate-50 border rounded-lg font-mono uppercase"
                    placeholder="CMP-C"
                  />
                </div>
              )}

              {/* Company logo */}
              <div className="p-3 bg-slate-50 rounded-xl border space-y-2">
                <p className="font-bold text-slate-800">Company Logo</p>
                <div className="flex items-center gap-3">
                  {editingCompany.logo_url ? (
                    <img src={editingCompany.logo_url} alt="Logo preview" className="w-16 h-16 rounded-lg object-contain bg-white border border-slate-200" />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-slate-900 text-amber-400 font-bold flex items-center justify-center">
                      {editingCompany.code}
                    </div>
                  )}
                  <div className="flex flex-col gap-1.5">
                    <label className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg font-semibold cursor-pointer w-fit">
                      {editingCompany.logo_url ? 'Change logo' : 'Upload logo'}
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={handleLogoFile} />
                    </label>
                    {editingCompany.logo_url && (
                      <button
                        type="button"
                        onClick={() => setEditingCompany({ ...editingCompany, logo_url: '' })}
                        className="text-rose-600 hover:text-rose-700 font-semibold text-left w-fit"
                      >
                        Remove logo
                      </button>
                    )}
                    <p className="text-[10px] text-slate-400">PNG / JPG / WEBP. Shown on order slips and invoices.</p>
                  </div>
                </div>
                {logoError && <p className="text-rose-600 font-semibold">{logoError}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">GSTIN *</label>
                  <input
                    type="text"
                    required
                    value={editingCompany.gst_number}
                    onChange={(e) => setEditingCompany({ ...editingCompany, gst_number: e.target.value })}
                    className="w-full p-2 bg-slate-50 border rounded-lg font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Mobile Contact</label>
                  <input
                    type="text"
                    value={editingCompany.mobile}
                    onChange={(e) => setEditingCompany({ ...editingCompany, mobile: e.target.value })}
                    className="w-full p-2 bg-slate-50 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Email</label>
                  <input
                    type="email"
                    value={editingCompany.email}
                    onChange={(e) => setEditingCompany({ ...editingCompany, email: e.target.value })}
                    className="w-full p-2 bg-slate-50 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">City</label>
                  <input
                    type="text"
                    value={editingCompany.city || ''}
                    onChange={(e) => {
                      const city = e.target.value;
                      const guess = stateForCity(city);
                      setEditingCompany({
                        ...editingCompany,
                        city,
                        state: !stateByUser && guess ? guess : editingCompany.state
                      });
                    }}
                    className="w-full p-2 bg-slate-50 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">State</label>
                  <StateSelect
                    value={editingCompany.state || ''}
                    onChange={(st) => { setStateByUser(true); setEditingCompany({ ...editingCompany, state: st }); }}
                    className="w-full p-2 bg-slate-50 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Pincode</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={editingCompany.pincode || ''}
                    onChange={(e) => setEditingCompany({ ...editingCompany, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                    className="w-full p-2 bg-slate-50 border rounded-lg font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">Full Address</label>
                <textarea
                  rows={2}
                  value={editingCompany.address}
                  onChange={(e) => setEditingCompany({ ...editingCompany, address: e.target.value })}
                  className="w-full p-2 bg-slate-50 border rounded-lg"
                />
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border space-y-2">
                <p className="font-bold text-slate-800">Bank Remittance Information</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-medium text-slate-500 mb-0.5">Bank Name</label>
                    <input
                      type="text"
                      value={editingCompany.bank_name}
                      onChange={(e) => setEditingCompany({ ...editingCompany, bank_name: e.target.value })}
                      className="w-full p-1.5 bg-white border rounded"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-500 mb-0.5">Account Number</label>
                    <input
                      type="text"
                      value={editingCompany.account_no}
                      onChange={(e) => setEditingCompany({ ...editingCompany, account_no: e.target.value })}
                      className="w-full p-1.5 bg-white border rounded font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-500 mb-0.5">IFSC Code</label>
                    <input
                      type="text"
                      value={editingCompany.ifsc_code}
                      onChange={(e) => setEditingCompany({ ...editingCompany, ifsc_code: e.target.value })}
                      className="w-full p-1.5 bg-white border rounded font-mono uppercase"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-500 mb-0.5">Branch</label>
                    <input
                      type="text"
                      value={editingCompany.branch}
                      onChange={(e) => setEditingCompany({ ...editingCompany, branch: e.target.value })}
                      className="w-full p-1.5 bg-white border rounded"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">Terms & Conditions</label>
                <textarea
                  rows={3}
                  value={editingCompany.terms || ''}
                  onChange={(e) => setEditingCompany({ ...editingCompany, terms: e.target.value })}
                  className="w-full p-2 bg-slate-50 border rounded-lg font-sans"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button type="button" onClick={() => setEditingCompany(null)} className="px-4 py-2">Cancel</button>
                <button type="submit" disabled={saving} className="px-5 py-2 bg-amber-500 text-slate-950 font-bold rounded-lg disabled:opacity-50">{saving ? 'Saving...' : isNew ? 'Add Company' : 'Save Changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
