import React, { useState, useEffect, useRef } from 'react';
import { Package, Search, Plus, Filter, RefreshCw, X, Tag, Upload, Link as LinkIcon, Edit, Eye, Trash2, CheckCircle2, ChevronLeft, ChevronRight, ChevronDown, Check } from 'lucide-react';
import { useAuth } from '../store/authStore.js';
import { Product } from '../types.js';
import { apiFetch } from '../lib/api.js';
import { getToken } from '../lib/session.js';
import { confirmAndDelete } from '../lib/deleteApi.js';

const PACKING_UNIT_OPTIONS = [
  '900 ML',
  '1 Litre',
  '1.5 Litre',
  '3 Litre',
  '3.5 Litre',
  '5 Litre',
  '7.5 Litre',
  '10 Litre',
  '20 Litre',
  '26 Litre',
  '50 KG',
  '180 KG',
  '210 Litre',
  '1 Piece',
  '12 Pieces',
  '1 Box',
  '1 Carton',
  '24 Bottles',
  'Drum',
  'Bucket',
  'Pouch',
  'Custom Pack',
];

const QUICK_PACKING_UNITS = ['900 ML', '1 Litre', '5 Litre', '20 Litre', '180 KG', '210 Litre', '1 Box'];

const parseUnitTokens = (raw: string): string[] =>
  raw
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);

const mergeUniqueUnits = (existing: string[], additions: string[]): string[] => {
  const next = [...existing];
  const seen = new Set(existing.map((u) => u.toLowerCase()));
  for (const unit of additions) {
    const clean = unit.trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      next.push(clean);
    }
  }
  return next;
};

export const Products: React.FC = () => {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filters
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Add / Edit Modal state
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Image mode: 'upload' | 'url'
  const [imageOption, setImageOption] = useState<'upload' | 'url'>('upload');
  const [imagePreview, setImagePreview] = useState<string>('');

  const [form, setForm] = useState({
    name: '',
    brand_id: '',
    category_id: '',
    unit: '',
    standard_rate: '',
    description: '',
    image_url: '',
    item_colour: 'Golden Yellow',
    status: 'active'
  });
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const [showUnitDropdown, setShowUnitDropdown] = useState(false);
  const unitDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showUnitDropdown) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (unitDropdownRef.current && !unitDropdownRef.current.contains(event.target as Node)) {
        setShowUnitDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showUnitDropdown]);

  const [actionLoading, setActionLoading] = useState(false);
  const [zoomImage, setZoomImage] = useState<string | null>(null);

  const fetchMasters = async () => {
    try {
      const token = getToken();
      const [bRes, cRes] = await Promise.all([
        apiFetch('/api/brands', { headers: { Authorization: `Bearer ${token}` } }),
        apiFetch('/api/categories', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (bRes.ok) {
        const j = await bRes.json();
        setBrands(j.brands || []);
      }
      if (cRes.ok) {
        const j = await cRes.json();
        setCategories(j.categories || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const token = getToken();
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (brandFilter) params.append('brand_id', brandFilter);
      if (categoryFilter) params.append('category_id', categoryFilter);

      const res = await apiFetch(`/api/products?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const j = await res.json();
        setProducts(j.products || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMasters();
    fetchProducts();
  }, [brandFilter, categoryFilter]);

  // Back to first page whenever the result set changes
  useEffect(() => {
    setPage(1);
  }, [search, brandFilter, categoryFilter, pageSize]);

  // Handle local image upload (Option 1)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      alert('Only JPG, JPEG, PNG, and WebP images are supported.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Image file size must be under 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setImagePreview(result);
      setForm(prev => ({ ...prev, image_url: result }));
    };
    reader.readAsDataURL(file);
  };

  // Open Add Modal
  const openAddModal = () => {
    setModalMode('add');
    setEditingId(null);
    setImageOption('upload');
    setImagePreview('');
    setSelectedUnits([]);
    setShowUnitDropdown(false);
    setForm({
      name: '',
      brand_id: brands[0]?.id ? brands[0].id.toString() : '',
      category_id: categories[0]?.id ? categories[0].id.toString() : '',
      unit: '',
      standard_rate: '',
      description: '',
      image_url: '',
      item_colour: 'Golden Yellow',
      status: 'active'
    });
    setShowModal(true);
  };

  // Open Edit Modal
  const handleDeleteProduct = async (p: Product) => {
    if (await confirmAndDelete(`/api/products/${p.id}`, `Delete product "${p.name}"? This cannot be undone.`)) fetchProducts();
  };

  const openEditModal = (p: Product) => {
    setModalMode('edit');
    setEditingId(p.id);
    setImagePreview(p.image_url || '');
    setSelectedUnits([]);
    setShowUnitDropdown(false);
    // Determine whether URL or base64
    if (p.image_url && p.image_url.startsWith('http')) {
      setImageOption('url');
    } else {
      setImageOption('upload');
    }
    setForm({
      name: p.name,
      brand_id: p.brand_id.toString(),
      category_id: p.category_id.toString(),
      unit: p.unit,
      standard_rate: p.standard_rate.toString(),
      description: p.description || '',
      image_url: p.image_url || '',
      item_colour: p.item_colour || 'Golden Yellow',
      status: p.status || 'active'
    });
    setShowModal(true);
  };

  const addUnitsFromInput = (raw?: string) => {
    const tokens = parseUnitTokens(raw ?? form.unit);
    if (tokens.length === 0) return;
    setSelectedUnits((prev) => mergeUniqueUnits(prev, tokens));
    setForm((prev) => ({ ...prev, unit: '' }));
  };

  const toggleQuickUnit = (unit: string) => {
    if (modalMode === 'edit') {
      setForm((prev) => ({ ...prev, unit }));
      return;
    }
    setSelectedUnits((prev) => {
      const exists = prev.some((u) => u.toLowerCase() === unit.toLowerCase());
      if (exists) {
        return prev.filter((u) => u.toLowerCase() !== unit.toLowerCase());
      }
      return [...prev, unit];
    });
  };

  const removeSelectedUnit = (unit: string) => {
    setSelectedUnits((prev) => prev.filter((u) => u.toLowerCase() !== unit.toLowerCase()));
  };

  const pendingUnits = modalMode === 'add'
    ? mergeUniqueUnits(selectedUnits, parseUnitTokens(form.unit))
    : [];

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (modalMode === 'add' && pendingUnits.length === 0) {
      alert('Please enter or select at least one Packing Unit.');
      return;
    }

    setActionLoading(true);
    try {
      const token = getToken();
      if (modalMode === 'edit') {
        const res = await apiFetch(`/api/products/${editingId}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(form)
        });
        const data = await res.json();
        if (res.ok) {
          setShowModal(false);
          fetchProducts();
        } else {
          alert(data.error || 'Failed to save product');
        }
        return;
      }

      // Create one product record per packing unit sequentially so SKUs increment cleanly
      // and it stays compatible with both current and updated backend APIs.
      let createdCount = 0;
      for (let i = 0; i < pendingUnits.length; i++) {
        const unit = pendingUnits[i];
        const res = await apiFetch('/api/products', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, unit })
        });
        const data = await res.json();
        if (!res.ok) {
          if (createdCount > 0) fetchProducts();
          setSelectedUnits(pendingUnits.slice(i));
          setForm((prev) => ({ ...prev, unit: '' }));
          alert(
            createdCount > 0
              ? `Saved ${createdCount} product(s), but failed on "${unit}": ${data.error || 'Failed to save product'}`
              : (data.error || 'Failed to save product')
          );
          return;
        }
        createdCount++;
      }

      setShowModal(false);
      fetchProducts();
    } finally {
      setActionLoading(false);
    }
  };

  const canManage = ['super_admin', 'admin'].includes(user?.role_slug || '');

  // Filter products client-side for dynamic responsive feedback
  const filteredProducts = products.filter(p => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      p.name?.toLowerCase().includes(s) ||
      p.brand_name?.toLowerCase().includes(s) ||
      p.category_name?.toLowerCase().includes(s) ||
      p.item_colour?.toLowerCase().includes(s) ||
      p.unit?.toLowerCase().includes(s)
    );
  });

  // Pagination (client-side)
  const totalItems = filteredProducts.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIdx = (currentPage - 1) * pageSize;
  const pagedProducts = filteredProducts.slice(startIdx, startIdx + pageSize);
  const showingFrom = totalItems === 0 ? 0 : startIdx + 1;
  const showingTo = Math.min(startIdx + pageSize, totalItems);

  const pageNumbers = (() => {
    const nums: (number | '...')[] = [];
    const add = (n: number | '...') => nums.push(n);
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) add(i);
    } else {
      add(1);
      if (currentPage > 3) add('...');
      const from = Math.max(2, currentPage - 1);
      const to = Math.min(totalPages - 1, currentPage + 1);
      for (let i = from; i <= to; i++) add(i);
      if (currentPage < totalPages - 2) add('...');
      add(totalPages);
    }
    return nums;
  })();

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6   mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Package className="w-6 h-6 text-amber-500" />
            Product Management
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Complete finished lubricant catalog with high-resolution images, brand categories, specifications and item colors.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchProducts}
            className="p-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 flex items-center gap-1.5"
            title="Refresh Catalog"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          {canManage && (
            <button
              onClick={openAddModal}
              className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold text-xs rounded-lg shadow-xs transition flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add New Product</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="sm:col-span-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by Product Name, Brand, Category or Item Colour..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              />
            </div>
          </div>

          <div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs"
            >
              <option value="">All Categories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs"
            >
              <option value="">All Brands</option>
              {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Products Table & Mobile Cards */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Mobile Product Cards (< md) */}
        <div className="block md:hidden divide-y divide-slate-100">
          {loading ? (
            <div className="py-12 text-center text-slate-400 text-xs">Loading lubricant catalog...</div>
          ) : filteredProducts.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">No products matching criteria.</div>
          ) : (
            pagedProducts.map(p => (
              <div key={p.id} className="p-4 space-y-3 hover:bg-slate-50/70 transition">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                      {p.image_url ? (
                        <img
                          src={p.image_url}
                          alt={p.name}
                          className="w-full h-full object-cover cursor-pointer hover:scale-110 transition-transform"
                          onClick={() => setZoomImage(p.image_url!)}
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?w=100&auto=format&fit=crop&q=60';
                          }}
                        />
                      ) : (
                        <Package className="w-5 h-5 text-slate-400" />
                      )}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-xs">
                        {p.name} 
                      </h4>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">{p.brand_name}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="px-1.5 py-0.2 rounded-full text-[9px] font-semibold bg-amber-50 text-amber-900 border border-amber-200">
                          {p.item_colour || 'Golden Yellow'}
                        </span>
                        <span className="px-1.5 py-0.2 bg-slate-100 rounded text-slate-700 font-semibold text-[9px]">{p.unit}</span>
                      </div>
                    </div>
                  </div>

                  <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full shrink-0 ${
                    p.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {p.status === 'active' ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                  <span />
                  {canManage && (
                    <button
                      onClick={() => openEditModal(p)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-amber-50 hover:text-amber-800 text-slate-700 font-semibold rounded-lg text-xs transition flex items-center gap-1"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>
                  )}
                  {canManage && (
                    <button
                      onClick={() => handleDeleteProduct(p)}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-600 rounded-lg text-xs transition"
                      title="Delete Product"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop Table View (>= md) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Image</th>
                <th className="py-3 px-4">Product Name</th>
        
                <th className="py-3 px-4">Brand</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Item Colour</th>
                <th className="py-3 px-4">Packing Unit</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">Loading lubricant catalog...</td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">No products matching criteria.</td>
                </tr>
              ) : (
                pagedProducts.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    {/* Thumbnail */}
                    <td className="py-3 px-4">
                      <div className="w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                        {p.image_url ? (
                          <img
                            src={p.image_url}
                            alt={p.name}
                            className="w-full h-full object-cover cursor-pointer hover:scale-110 transition-transform"
                            onClick={() => setZoomImage(p.image_url!)}
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?w=100&auto=format&fit=crop&q=60';
                            }}
                          />
                        ) : (
                          <Package className="w-5 h-5 text-slate-400" />
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-bold text-slate-900">{p.name} </p>
                      <p className="text-[11px] text-slate-400 truncate max-w-xs">{p.description || 'Standard formulation'}</p>
                    </td>
              
                    <td className="py-3 px-4 text-slate-700 font-medium">{p.brand_name}</td>
                    <td className="py-3 px-4 text-slate-600">{p.category_name}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-900 border border-amber-200">
                        {p.item_colour || 'Golden Yellow'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-800 font-semibold">{p.unit}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                        p.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                      }`}>
                        {p.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {canManage && (
                        <button
                          onClick={() => openEditModal(p)}
                          className="p-1.5 text-slate-600 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                          title="Edit Product"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      )}
                      {canManage && (
                        <button
                          onClick={() => handleDeleteProduct(p)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                          title="Delete Product"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && totalItems > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 bg-slate-50 text-xs">
            <div className="flex items-center gap-3 text-slate-600">
              <span>
                Showing <b className="text-slate-900">{showingFrom}</b>–<b className="text-slate-900">{showingTo}</b> of{' '}
                <b className="text-slate-900">{totalItems}</b> products
              </span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="py-1 px-2 bg-white border border-slate-200 rounded-lg text-xs"
                title="Rows per page"
              >
                {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n} / page</option>)}
              </select>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {pageNumbers.map((n, i) =>
                n === '...' ? (
                  <span key={`dots-${i}`} className="px-2 text-slate-400">…</span>
                ) : (
                  <button
                    key={n}
                    onClick={() => setPage(n)}
                    className={`min-w-[30px] px-2 py-1.5 rounded-lg border text-xs font-semibold transition ${
                      n === currentPage
                        ? 'bg-amber-500 border-amber-500 text-slate-950'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {n}
                  </button>
                )
              )}

              <button
                onClick={() => setPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit Product Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-6 space-y-4 my-8">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <Package className="w-5 h-5 text-amber-500" />
                {modalMode === 'add' ? 'Add New Product Formulation' : 'Edit Product Formulation'}
              </h3>
              <button onClick={() => setShowModal(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-4 text-xs">
              {/* Product Image Section (Upload & URL) */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-800">Product Image *</label>
                  <div className="flex items-center bg-white rounded-lg border border-slate-200 p-0.5">
                    <button
                      type="button"
                      onClick={() => setImageOption('upload')}
                      className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 ${
                        imageOption === 'upload' ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload Image</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setImageOption('url')}
                      className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 ${
                        imageOption === 'url' ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <LinkIcon className="w-3.5 h-3.5" />
                      <span>Image URL</span>
                    </button>
                  </div>
                </div>

                {imageOption === 'upload' ? (
                  <div className="space-y-2">
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp"
                      onChange={handleFileUpload}
                      className="block w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-amber-100 file:text-amber-900 hover:file:bg-amber-200 cursor-pointer"
                    />
                    <p className="text-[10px] text-slate-500">Supports JPG, JPEG, PNG, and WebP (Max 5MB).</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="url"
                      placeholder="https://example.com/product-image.jpg"
                      value={form.image_url}
                      onChange={(e) => {
                        const val = e.target.value;
                        setForm(f => ({ ...f, image_url: val }));
                        setImagePreview(val);
                      }}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                    <p className="text-[10px] text-slate-500">Paste direct public image URL from CDN or cloud storage.</p>
                  </div>
                )}

                {/* Live Preview & Remove/Replace Button */}
                {imagePreview && (
                  <div className="flex items-center gap-3 pt-2 border-t border-slate-200">
                    <div className="w-16 h-16 rounded-lg bg-white border border-slate-300 overflow-hidden relative group shrink-0">
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?w=100&auto=format&fit=crop&q=60';
                        }}
                      />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Live Image Preview Ready
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setImagePreview('');
                          setForm(f => ({ ...f, image_url: '' }));
                        }}
                        className="mt-1 text-[11px] text-rose-600 hover:underline flex items-center gap-1 font-semibold"
                      >
                        <Trash2 className="w-3 h-3" />
                        Remove image
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Product Basic Fields */}
              <div>
                <label className="block font-semibold mb-1">Product Name *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. UltraDrive Synthetic 5W-30 SN/CF"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Brand *</label>
                  <select
                    value={form.brand_id}
                    required
                    onChange={(e) => setForm({ ...form, brand_id: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                  >
                    <option value="">Select Brand</option>
                    {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold mb-1">Category *</label>
                  <select
                    value={form.category_id}
                    required
                    onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                  >
                    <option value="">Select Category</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">

                <div ref={unitDropdownRef} className="relative">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-semibold text-xs text-slate-700">
                      {modalMode === 'add' ? 'Packing Units *' : 'Packing Unit *'}
                    </label>
                    <span className="text-[10px] text-slate-400">
                      {modalMode === 'add'
                        ? 'Add multiple units (Enter, + Add, or pick below)'
                        : 'Type any unit or pick below'}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        required={modalMode === 'edit' || selectedUnits.length === 0}
                        value={form.unit}
                        onFocus={() => setShowUnitDropdown(true)}
                        onChange={(e) => {
                          setForm((prev) => ({ ...prev, unit: e.target.value }));
                          if (!showUnitDropdown) setShowUnitDropdown(true);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            setShowUnitDropdown(false);
                            return;
                          }
                          if (modalMode === 'add' && (e.key === 'Enter' || e.key === ',')) {
                            e.preventDefault();
                            addUnitsFromInput();
                          }
                        }}
                        placeholder={
                          modalMode === 'add'
                            ? 'e.g. 900 ML, 1 Litre, 5 Litre (press Enter or + Add)'
                            : 'e.g. 900 ML, 5 Litre, 20 Litre, 180 KG, 1 Box'
                        }
                        autoComplete="off"
                        className="w-full p-2 pr-8 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowUnitDropdown((prev) => !prev)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-700 transition"
                        title="Show packing unit suggestions"
                      >
                        <ChevronDown className={`w-4 h-4 transition-transform duration-150 ${showUnitDropdown ? 'rotate-180 text-amber-600' : ''}`} />
                      </button>

                      {/* Custom Styled Packing Unit Suggestion Dropdown */}
                      {showUnitDropdown && (() => {
                        const query = form.unit.trim().toLowerCase();
                        const filteredOptions = PACKING_UNIT_OPTIONS.filter((u) =>
                          !query || u.toLowerCase().includes(query)
                        );
                        const exactMatch = PACKING_UNIT_OPTIONS.some((u) => u.toLowerCase() === query);

                        return (
                          <div className="absolute left-0 right-0 top-full mt-1.5 z-30 bg-white rounded-xl border border-slate-200 shadow-xl ring-1 ring-black/5 overflow-hidden">
                            <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <Tag className="w-3.5 h-3.5 text-amber-500" />
                                <span className="text-[11px] font-bold text-slate-700">
                                  Packing Unit Suggestions
                                </span>
                                {modalMode === 'add' && selectedUnits.length > 0 && (
                                  <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-bold">
                                    {selectedUnits.length} selected
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => setShowUnitDropdown(false)}
                                className="px-2 py-0.5 rounded-md bg-amber-500 hover:bg-amber-600 text-slate-950 text-[10px] font-bold transition"
                              >
                                Done
                              </button>
                            </div>

                            <div className="p-2.5 max-h-52 overflow-y-auto space-y-2">
                              {filteredOptions.length > 0 ? (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                                  {filteredOptions.map((u) => {
                                    const isSelected =
                                      modalMode === 'add'
                                        ? selectedUnits.some((s) => s.toLowerCase() === u.toLowerCase())
                                        : form.unit.trim().toLowerCase() === u.toLowerCase();

                                    return (
                                      <button
                                        type="button"
                                        key={u}
                                        onClick={() => {
                                          if (modalMode === 'add') {
                                            toggleQuickUnit(u);
                                          } else {
                                            setForm((prev) => ({ ...prev, unit: u }));
                                            setShowUnitDropdown(false);
                                          }
                                        }}
                                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-left text-[11px] transition ${
                                          isSelected
                                            ? 'bg-amber-50 border-amber-400 text-amber-950 font-semibold shadow-2xs'
                                            : 'bg-slate-50/80 border-slate-200 text-slate-700 hover:bg-amber-50/50 hover:border-amber-300'
                                        }`}
                                      >
                                        <span
                                          className={`w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 border transition ${
                                            isSelected
                                              ? 'bg-amber-500 border-amber-500 text-slate-950'
                                              : 'bg-white border-slate-300'
                                          }`}
                                        >
                                          {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                                        </span>
                                        <span className="truncate">{u}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="text-[11px] text-slate-400 text-center py-2">
                                  No preset matches "{form.unit.trim()}"
                                </p>
                              )}

                              {form.unit.trim() && !exactMatch && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (modalMode === 'add') {
                                      addUnitsFromInput();
                                    } else {
                                      setShowUnitDropdown(false);
                                    }
                                  }}
                                  className="w-full px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 border border-dashed border-amber-300 text-amber-900 font-semibold text-[11px] flex items-center justify-center gap-1.5 transition"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>
                                    {modalMode === 'add'
                                      ? `Add custom unit "${form.unit.trim()}"`
                                      : `Use "${form.unit.trim()}"`}
                                  </span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {modalMode === 'add' && (
                      <button
                        type="button"
                        onClick={() => addUnitsFromInput()}
                        disabled={!form.unit.trim()}
                        className="px-3 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 disabled:text-slate-400 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-1 shrink-0 transition"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </button>
                    )}
                  </div>

                  {/* Selected Packing Units (Add Mode) */}
                  {modalMode === 'add' && selectedUnits.length > 0 && (
                    <div className="mt-2 p-2.5 bg-amber-50/70 border border-amber-200 rounded-lg space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-amber-900">
                          Selected Packing Units ({selectedUnits.length})
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedUnits([])}
                          className="text-[10px] text-rose-600 hover:underline font-semibold"
                        >
                          Clear all
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedUnits.map((u) => (
                          <span
                            key={u}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-amber-300 text-amber-950 font-semibold text-[11px] shadow-2xs"
                          >
                            <span>{u}</span>
                            <button
                              type="button"
                              onClick={() => removeSelectedUnit(u)}
                              className="text-amber-700 hover:text-rose-600 transition"
                              title={`Remove ${u}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Quick-Select Suggestions */}
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {QUICK_PACKING_UNITS.map((u) => {
                      const isSelected =
                        modalMode === 'add'
                          ? selectedUnits.some((s) => s.toLowerCase() === u.toLowerCase())
                          : form.unit === u;
                      return (
                        <button
                          type="button"
                          key={u}
                          onClick={() => toggleQuickUnit(u)}
                          className={`text-[10px] px-1.5 py-0.5 rounded border transition ${
                            isSelected
                              ? 'bg-amber-100 text-amber-900 border-amber-300 font-bold'
                              : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                          }`}
                        >
                          {modalMode === 'add' ? `${isSelected ? '✓ ' : '+ '}${u}` : u}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Item Colour *</label>
                  <input
                    type="text"
                    required
                    value={form.item_colour}
                    onChange={(e) => setForm({ ...form, item_colour: e.target.value })}
                    placeholder="e.g. Golden Yellow, Red, Amber"
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1">Status *</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">Formulation Description & Performance Specifications</label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="e.g. API SN Plus, ACEA A3/B4, Meets MB 229.5 & VW 502 00 specifications"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 text-slate-950 font-bold rounded-lg shadow-xs disabled:opacity-60"
                >
                  {actionLoading
                    ? 'Saving...'
                    : modalMode === 'add'
                      ? pendingUnits.length > 1
                        ? `Save ${pendingUnits.length} Products`
                        : 'Save New Product'
                      : 'Update Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Image Zoom Modal */}
      {zoomImage && (
        <div
          onClick={() => setZoomImage(null)}
          className="fixed inset-0 z-60 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
        >
          <div className="relative max-w-xl max-h-[80vh] bg-white rounded-2xl overflow-hidden p-2 shadow-2xl" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setZoomImage(null)}
              className="absolute top-4 right-4 z-10 p-2 bg-black/60 hover:bg-black/80 text-white rounded-full transition"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={zoomImage}
              alt="Product High Resolution"
              className="w-full h-auto max-h-[75vh] object-contain rounded-xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};