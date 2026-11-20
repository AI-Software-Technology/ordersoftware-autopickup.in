import React, { useState, useEffect } from 'react';
import {
  Building2, Store, Package, Truck, CreditCard, Plus, Trash2,
  CheckCircle2, ArrowRight, ArrowLeft, AlertCircle, Info, Search, X, Eye, FileText
} from 'lucide-react';
import { useAuth } from '../store/authStore.js';
import { Company, Vendor, Product } from '../types.js';
import { OrderSlipModal } from '../components/OrderSlipModal.js';
import { apiFetch } from '../lib/api.js';
import { getToken } from '../lib/session.js';
import { StateSelect } from '../components/StateSelect.js';
import { stateForCity } from '../lib/india.js';

interface CreateOrderProps {
  onNavigate: (page: string) => void;
}

export interface SelectedProductRow {
  product_id: number;
  product_name: string;
  sku: string;
  brand: string;
  category: string;
  unit: string;
  image_url: string;
  item_colour: string;
  quantity: number;
  rate: number;
  line_amount: number;
  required_delivery_date: string;
  notes: string;
}

export const CreateOrder: React.FC<CreateOrderProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [step, setStep] = useState<number>(1);

  // Master Data
  const [companies, setCompanies] = useState<Company[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Step 1: Billing Company
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);

  // Step 2: Vendor Selection & Inline Create
  const [selectedVendorId, setSelectedVendorId] = useState<number | null>(null);
  const [vendorSearch, setVendorSearch] = useState<string>('');
  const [showAddVendorModal, setShowAddVendorModal] = useState<boolean>(false);
  const [newVendorForm, setNewVendorForm] = useState({
    company_name: '',
    contact_person: '',
    mobile: '',
    alt_mobile: '',
    email: '',
    gstin: '',
    billing_address: '',
    delivery_address: '',
    city: '',
    state: '',
    pincode: '',
    notes: ''
  });
  // true once the user picked a state by hand - then typing the city no longer overwrites it
  const [stateChosenByUser, setStateChosenByUser] = useState<boolean>(false);

  // Step 3: Selected Products & Tax Type (GST 18% vs Non-GST)
  const [taxType, setTaxType] = useState<'GST_18' | 'NON_GST'>('GST_18');
  const [productRows, setProductRows] = useState<SelectedProductRow[]>([]);
  const [discountType, setDiscountType] = useState<'NONE' | 'PERCENT' | 'FLAT'>('NONE');
  const [discountValue, setDiscountValue] = useState<string>('');

  // Searchable Product Selector Modal
  const [showProductModal, setShowProductModal] = useState<boolean>(false);
  const [productSearchTerm, setProductSearchTerm] = useState<string>('');
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  // Step 4: Delivery Details (Payment collection is separate!)
  const [deliveryAddress, setDeliveryAddress] = useState<string>('');
  const [sameAsVendorAddress, setSameAsVendorAddress] = useState<boolean>(true);
  const [contactPerson, setContactPerson] = useState<string>('');
  const [contactNumber, setContactNumber] = useState<string>('');
  const [transportName, setTransportName] = useState<string>('');
  const [transportAddress, setTransportAddress] = useState<string>('');
  const [bookingStation, setBookingStation] = useState<string>('');
  const [transportContactNumber, setTransportContactNumber] = useState<string>('');

  const [orderDeliveryDate, setOrderDeliveryDate] = useState<string>('');
  const [specialInstructions, setSpecialInstructions] = useState<string>('');
  const [orderNotes, setOrderNotes] = useState<string>('');
  const [paymentTerms, setPaymentTerms] = useState<string>('Advance');
  const [useCredit, setUseCredit] = useState<boolean>(false);

  // Submit / Success state
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [createdOrderResult, setCreatedOrderResult] = useState<{ id: number; number: string } | null>(null);
  const [slipModalOpen, setSlipModalOpen] = useState<boolean>(false);
  const [slipFullData, setSlipFullData] = useState<any>(null);

  // Load companies, vendors, products
  useEffect(() => {
    const loadData = async () => {
      try {
        const token = getToken();
        const [cRes, vRes, pRes] = await Promise.all([
          apiFetch('/api/companies', { headers: { Authorization: `Bearer ${token}` } }),
          apiFetch('/api/vendors?status=active', { headers: { Authorization: `Bearer ${token}` } }),
          apiFetch('/api/products', { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        if (cRes.ok) {
          const cData = await cRes.json();
          setCompanies(cData.companies || []);
          if (cData.companies?.length > 0) {
            setSelectedCompanyId(cData.companies[0].id);
          }
        }
        if (vRes.ok) {
          const vData = await vRes.json();
          setVendors(vData.vendors || []);
        }
        if (pRes.ok) {
          const pData = await pRes.json();
          setProducts(pData.products || []);
        }
      } catch (err) {
        console.error('Failed to load order prerequisites:', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // Set default delivery fields when vendor is picked
  useEffect(() => {
    if (selectedVendorId) {
      const v = vendors.find(x => x.id === selectedVendorId);
      if (v) {
        setDeliveryAddress(v.delivery_address || v.billing_address);
        setContactPerson(v.contact_person);
        setContactNumber(v.mobile);
      }
    }
  }, [selectedVendorId, vendors]);



  const PLACEHOLDER_IMG = 'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?w=120&auto=format&fit=crop&q=80';

  const buildRow = (prod: Product): SelectedProductRow => {
    const initialRate = prod.standard_rate || 0;
    return {
      product_id: prod.id,
      product_name: prod.name,
      sku: prod.sku,
      brand: prod.brand_name || '',
      category: prod.category_name || '',
      unit: prod.unit,
      image_url: prod.image_url || PLACEHOLDER_IMG,
      item_colour: prod.item_colour || '',
      quantity: 0,
      rate: initialRate,
      line_amount: 0,
      required_delivery_date: orderDeliveryDate || '',
      notes: ''
    };
  };

  const closeProductModal = () => {
    setShowProductModal(false);
    setProductSearchTerm('');
    setSelectedIds([]);
  };

  const toggleSelect = (id: number) =>
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  const handleAddSelected = () => {
    if (selectedIds.length === 0) return;
    setProductRows(prev => {
      const have = new Set(prev.map(r => r.product_id));
      const toAdd = products
        .filter(p => selectedIds.includes(p.id) && !have.has(p.id))
        .map(buildRow);
      return [...prev, ...toAdd];
    });
    closeProductModal();
  };
  // When a product is selected from the Searchable Product Selector Modal
  const handleSelectProduct = (prod: Product) => {
    // Check if already in order
    const existingIndex = productRows.findIndex(r => r.product_id === prod.id);
    if (existingIndex >= 0) {
      // Just increase quantity
      setProductRows(prev => {
        const next = [...prev];
        const newQty = next[existingIndex].quantity + 1;
        next[existingIndex].quantity = newQty;
        next[existingIndex].line_amount = newQty * next[existingIndex].rate;
        return next;
      });
    } else {
      // Add new row with custom rate pre-populated with standard rate as guidance, but fully editable!
      const initialRate = prod.standard_rate || 0;
      setProductRows(prev => [
        ...prev,
        {
          product_id: prod.id,
          product_name: prod.name,
          sku: prod.sku,
          brand: prod.brand_name || '',
          category: prod.category_name || '',
          unit: prod.unit,
          image_url: prod.image_url || 'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?w=120&auto=format&fit=crop&q=80',
          item_colour: prod.item_colour || '',
          quantity: 0,
          rate: initialRate,
          line_amount: 0,
          required_delivery_date: orderDeliveryDate || '',
          notes: ''
        }
      ]);
    }
    setShowProductModal(false);
    setProductSearchTerm('');
  };

  const removeProductRow = (index: number) => {
    setProductRows(prev => prev.filter((_, i) => i !== index));
  };

  const handleRowQuantityChange = (index: number, raw: string) => {
    const digits = raw.replace(/[^0-9]/g, '').replace(/^0+/, '');
    const safeQty = digits === '' ? 0 : Number(digits);
    setProductRows(prev => {
      const next = [...prev];
      next[index].quantity = safeQty;
      next[index].line_amount = safeQty * next[index].rate;
      return next;
    });
  };

  const handleRowRateChange = (index: number, rate: string) => {
    const cleaned = rate.replace(/[^0-9.]/g, '').replace(/^0+(?=\d)/, '');
    const safeRate = cleaned === '' || cleaned === '.' ? 0 : Math.max(0, Number(cleaned) || 0);

    setProductRows(prev => {
      const next = [...prev];
      next[index].rate = safeRate;
      next[index].line_amount = next[index].quantity * safeRate;
      return next;
    });
  };

  const handleRowColourChange = (index: number, colour: string) => {
    setProductRows(prev => {
      const next = [...prev];
      next[index].item_colour = colour;
      return next;
    });
  };

  // Calculations - CORE BUSINESS RULE:
  // The Estimated Total must always be based on the Selling Rate manually entered by the Sales Person:
  // Estimated Total = Sum of (Quantity * Manually Entered Selling Rate)
  // This rule applies to both GST and Non-GST orders.
  const grossTotal = Math.round(productRows.reduce((acc, row) => acc + (row.line_amount || 0), 0) * 100) / 100;
  const discountNum = discountType === 'NONE' ? 0 : Math.max(0, Number(discountValue) || 0);
  const discountError =
    discountType === 'PERCENT' && discountNum > 100 ? 'Max 100%'
      : discountType === 'FLAT' && discountNum > grossTotal ? 'Exceeds total'
        : '';
  const discountAmount = discountError ? 0
    : discountType === 'PERCENT' ? Math.round(grossTotal * discountNum) / 100
      : discountType === 'FLAT' ? Math.round(discountNum * 100) / 100 : 0;
  const grandTotal = Math.round((grossTotal - discountAmount) * 100) / 100;
  const isNonGst = taxType === 'NON_GST';

  // Taxable subtotal & GST breakdown
  const subtotal = isNonGst
    ? grandTotal
    : Math.round((grandTotal / 1.18) * 100) / 100;

  const taxRate = isNonGst ? 0 : 18.0;
  const taxAmount = isNonGst
    ? 0
    : Math.round((grandTotal - subtotal) * 100) / 100;

  // Per requirement: Verified Received = ₹0, Pending = Full Order Amount (grandTotal)
  const amountReceived = 0;
  const pendingAmount = grandTotal;

  // Filtered products in selector modal
  const filteredProducts = products.filter(p => {
    if (!productSearchTerm) return true;
    const term = productSearchTerm.toLowerCase();
    return (
      p.name?.toLowerCase().includes(term) ||
      p.brand_name?.toLowerCase().includes(term) ||
      p.category_name?.toLowerCase().includes(term) ||
      p.item_colour?.toLowerCase().includes(term) ||
      p.unit?.toLowerCase().includes(term)
    );
  });

  const addedIds = new Set(productRows.map(r => r.product_id));
  const selectable = filteredProducts.filter(p => !addedIds.has(p.id));
  const allSelected = selectable.length > 0 && selectable.every(p => selectedIds.includes(p.id));

  const toggleSelectAll = () => {
    const ids = selectable.map(p => p.id);
    setSelectedIds(prev =>
      allSelected ? prev.filter(id => !ids.includes(id)) : Array.from(new Set([...prev, ...ids]))
    );
  };
  // Inline Vendor Creation
  const handleSaveNewVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVendorForm.company_name || !newVendorForm.contact_person || !newVendorForm.billing_address || !newVendorForm.city || !newVendorForm.state) {
      alert('Please fill all mandatory party fields (Party Name, Contact Person, City, State and Address).');
      return;
    }

    try {
      const token = getToken();
      const res = await apiFetch('/api/vendors', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(newVendorForm)
      });
      const data = await res.json();
      if (res.ok) {
        setShowAddVendorModal(false);
        setStateChosenByUser(false);
        setNewVendorForm(f => ({ ...f, company_name: '', contact_person: '', mobile: '', gstin: '', billing_address: '', delivery_address: '', city: '', state: '' }));
        const vRes = await apiFetch('/api/vendors?status=active', { headers: { Authorization: `Bearer ${token}` } });
        if (vRes.ok) {
          const vData = await vRes.json();
          setVendors(vData.vendors || []);
          setSelectedVendorId(data.id);
        }
      } else {
        alert(data.error || 'Failed to create vendor');
      }
    } catch (err) {
      console.error(err);
      alert('Network error while creating party');
    }
  };

  // Submit Order
  const handleSubmitOrder = async () => {
    if (!selectedCompanyId) {
      alert('Please select a Billing Company in Step 1');
      setStep(1);
      return;
    }
    if (!selectedVendorId) {
      alert('Please select a Party in Step 2');
      setStep(2);
      return;
    }
    if (productRows.length === 0) {
      alert('Please add at least one product in Step 3');
      setStep(3);
      return;
    }
    const bad = productRows.find(r => !(r.quantity > 0) || !(r.rate > 0));
    if (bad) {
      alert(`Enter quantity and selling rate for "${bad.product_name}"`);
      setStep(3);
      return;
    }

    setIsSubmitting(true);
    try {
      const token = getToken();
      const payload = {
        company_id: selectedCompanyId,
        vendor_id: selectedVendorId,
        delivery_address: deliveryAddress,
        delivery_contact_person: contactPerson,
        delivery_contact_number: contactNumber,
        transportName: transportName,
        transportAddress: transportAddress,
        booking_station: bookingStation,
        transport_contact_number: transportContactNumber,

        required_delivery_date: orderDeliveryDate || null,
        special_instructions: specialInstructions,
        notes: orderNotes,
        payment_terms: paymentTerms,
        use_credit: useCredit,
        tax_type: taxType,
        discount_type: discountAmount > 0 ? discountType : 'NONE',
        discount_value: discountAmount > 0 ? discountNum : 0,
        items: productRows.map(r => ({
          product_id: r.product_id,
          quantity: r.quantity,
          rate: r.rate,
          item_colour: r.item_colour || null,
          notes: null
        }))
      };

      const res = await apiFetch('/api/orders', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok) {
        setCreatedOrderResult({ id: data.order_id, number: data.order_number });
        // Fetch order details for the slip
        const orderRes = await apiFetch(`/api/orders/${data.order_id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (orderRes.ok) {
          const fullData = await orderRes.json();
          setSlipFullData(fullData);
          setSlipModalOpen(true);
        }
        setStep(5);
      } else {
        alert(data.error || 'Failed to submit order');
      }
    } catch (err) {
      console.error(err);
      alert('Network error while submitting order');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[50vh] text-slate-400">
        <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mb-2"></div>
        <p className="text-xs font-semibold text-slate-500">Loading Order Workspace...</p>
      </div>
    );
  }

  const selectedVendor = vendors.find(v => v.id === selectedVendorId);
  const selectedCompany = companies.find(c => c.id === selectedCompanyId);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6   mx-auto">
      {/* Top Breadcrumb & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-600 mb-1">
            <span onClick={() => onNavigate('orders')} className="hover:underline cursor-pointer">Orders Management</span>
            <span>/</span>
            <span className="text-slate-500">Sales Order Booking</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            Create Lubricant Sales Order
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Select billing entity, party, custom product rates with live thumbnails, and generate official party order slip.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigate('orders')}
            className="px-3.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold text-xs rounded-lg shadow-xs transition"
          >
            Cancel & Exit
          </button>
        </div>
      </div>

      {/* Modern 4-Step Progress Indicator */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { num: 1, label: 'Billing Company', desc: selectedCompany ? selectedCompany.code : 'Choose Entity', icon: Building2 },
            { num: 2, label: 'Party', desc: selectedVendor ? selectedVendor.company_name : 'Pick Party', icon: Store },
            { num: 3, label: 'Products & Rates', desc: `${productRows.length} items added`, icon: Package },
            { num: 4, label: 'Delivery & Review', desc: `Total: ₹${grandTotal.toLocaleString('en-IN')}`, icon: Truck }
          ].map(s => {
            const Icon = s.icon;
            const isCurrent = step === s.num;
            const isDone = step > s.num;
            return (
              <button
                key={s.num}
                type="button"
                onClick={() => { if (step <= 4) setStep(s.num); }}
                className={`p-3 rounded-xl border text-left flex items-start gap-3 transition-all ${isCurrent
                  ? 'border-amber-500 bg-amber-50/50 shadow-xs'
                  : isDone
                    ? 'border-emerald-200 bg-emerald-50/30'
                    : 'border-slate-100 bg-slate-50/40 opacity-70'
                  }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isCurrent
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : isDone
                    ? 'bg-emerald-600 text-white font-bold'
                    : 'bg-slate-200 text-slate-500'
                  }`}>
                  {isDone ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                </div>
                <div className="overflow-hidden">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Step {s.num}</p>
                  <p className="text-xs font-bold text-slate-800 truncate">{s.label}</p>
                  <p className="text-[11px] text-slate-500 truncate">{s.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* STEP 1: BILLING COMPANY */}
      {step === 1 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
          <div className="border-b pb-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-amber-500" />
              Select Registered Billing Entity
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Select the manufacturing or marketing company under which this sales invoice and order slip will be issued.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {companies.map(c => {
              const isSelected = selectedCompanyId === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => setSelectedCompanyId(c.id)}
                  className={`p-5 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between space-y-3 ${isSelected
                    ? 'border-amber-500 bg-amber-50/30 shadow-md ring-2 ring-amber-400/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {c.logo_url ? (
                        <img src={c.logo_url} alt={c.name} className="w-12 h-12 rounded-xl object-contain bg-white border border-slate-200" />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-slate-900 text-amber-400 flex items-center justify-center font-bold text-lg">
                          {c.code}
                        </div>
                      )}
                      <div>
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-bold rounded">
                          {c.code}
                        </span>
                        <h3 className="font-bold text-sm text-slate-900 mt-1">{c.name}</h3>
                      </div>
                    </div>
                    {isSelected && (
                      <span className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-4 h-4" />
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-slate-600 space-y-1 pt-2 border-t border-slate-100">
                    <p><strong>GSTIN:</strong> {c.gst_number}</p>
                    <p className="text-slate-500 truncate">{c.address}, {c.city}, {c.state}</p>
                    <p><strong>Bank:</strong> {c.bank_name} • A/C: {c.account_no}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end pt-4 border-t">
            <button
              type="button"
              disabled={!selectedCompanyId}
              onClick={() => setStep(2)}
              className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 text-slate-950 font-bold text-xs rounded-xl shadow-xs flex items-center gap-2"
            >
              <span>Continue to Party Selection</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: PARTY SELECTION */}
      {step === 2 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Store className="w-5 h-5 text-amber-500" />
                Select Party Account
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Choose from your assigned distributors and industrial parties, or quickly add a new party.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowAddVendorModal(true)}
              className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-lg transition flex items-center gap-1.5 self-start"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add New Party</span>
            </button>
          </div>

          {/* Search Vendors */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search party by company name, contact person, city or GSTIN..."
              value={vendorSearch}
              onChange={(e) => setVendorSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[50vh] overflow-y-auto pr-1">
            {vendors
              .filter(v => {
                if (!vendorSearch) return true;
                const s = vendorSearch.toLowerCase();
                return (
                  v.company_name?.toLowerCase().includes(s) ||
                  v.contact_person?.toLowerCase().includes(s) ||
                  v.city?.toLowerCase().includes(s) ||
                  v.gstin?.toLowerCase().includes(s)
                );
              })
              .map(v => {
                const isSelected = selectedVendorId === v.id;
                return (
                  <div
                    key={v.id}
                    onClick={() => setSelectedVendorId(v.id)}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between space-y-3 ${isSelected
                      ? 'border-amber-500 bg-amber-50/30 shadow-md ring-2 ring-amber-400/20'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          {v.vendor_code}
                        </span>
                        {isSelected && (
                          <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>
                      <h4 className="font-bold text-sm text-slate-900 mt-2">{v.company_name}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">Contact: {v.contact_person} • {v.mobile}</p>
                    </div>

                    <div className="text-[11px] text-slate-600 pt-2 border-t border-slate-100 space-y-0.5">
                      <p className="truncate"><strong>City:</strong> {v.city}, {v.state}</p>
                      <p className="font-mono text-slate-500">GST: {v.gstin || 'Unregistered'}</p>
                    </div>
                  </div>
                );
              })}
          </div>

          <div className="flex justify-between pt-4 border-t">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl"
            >
              ← Back to Step 1
            </button>
            <button
              type="button"
              disabled={!selectedVendorId}
              onClick={() => setStep(3)}
              className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 text-slate-950 font-bold text-xs rounded-xl shadow-xs flex items-center gap-2"
            >
              <span>Continue to Products & Rates</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: SEARCHABLE PRODUCTS WITH IMAGES & CUSTOM SELLING RATES */}
      {step === 3 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Package className="w-5 h-5 text-amber-500" />
                Add Products & Custom Selling Rates
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Rates are not fixed. Sales person enters custom rate per order. Images appear beside each item throughout order booking.
              </p>
            </div>

            {/* Click Add Product Button to open Searchable Selector Modal */}
            <button
              type="button"
              onClick={() => setShowProductModal(true)}
              className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 text-slate-950 font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 self-start"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add Product</span>
            </button>
          </div>

          {/* Tax Type Selector: GST (18%) | Non-GST */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block">Billing Tax Type</span>
              <p className="text-[11px] text-slate-500">
                {taxType === 'GST_18'
                  ? 'Entered rate is inclusive of 18% GST. System reverse-calculates taxable value and 18% GST.'
                  : 'Entered rate is without GST (GST: ₹0.00). Subtotal equals Estimated Total.'}
              </p>
            </div>

            <div className="inline-flex p-1 bg-white border border-slate-300 rounded-xl shadow-2xs shrink-0">
              <button
                type="button"
                onClick={() => setTaxType('GST_18')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${taxType === 'GST_18'
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
              >
                <span>GST (18%)</span>
              </button>
              <button
                type="button"
                onClick={() => setTaxType('NON_GST')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${taxType === 'NON_GST'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
              >
                <span>Non-GST</span>
              </button>
            </div>
          </div>

          {/* Selected Products Table & Mobile Cards */}
          {productRows.length === 0 ? (
            <div className="p-12 text-center text-slate-400 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 space-y-3">
              <Package className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-sm font-semibold text-slate-700">No products added to this order yet</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Click the <strong>"+ Add Product"</strong> button to search the product catalog and select items with photos.
              </p>
              <button
                type="button"
                onClick={() => setShowProductModal(true)}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-lg transition"
              >
                Open Product Selector
              </button>
            </div>
          ) : (
            <>
              {/* Mobile Cards for Added Products (< md) */}
              <div className="block md:hidden space-y-3">
                {productRows.map((row, idx) => (
                  <div key={idx} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <img
                          src={row.image_url}
                          alt={row.product_name}
                          className="w-12 h-12 rounded-lg object-cover bg-white border border-slate-200 shrink-0 cursor-pointer"
                          onClick={() => setZoomImage(row.image_url)}
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?w=100&auto=format&fit=crop&q=60';
                          }}
                        />
                        <div>
                          <p className="font-bold text-slate-900 text-xs">
                            {row.product_name} 
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[10px]">
                            <span className="text-slate-400">{row.brand}</span>
                            <span className="px-1.5 py-0.2 bg-slate-200 text-slate-700 rounded font-semibold">{row.unit}</span>
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeProductRow(idx)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                        title="Remove item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-[11px] text-slate-500 font-medium">Lube Colour:</span>
                      <input
                        type="text"
                        list="colour-options"
                        value={row.item_colour}
                        onChange={(e) => handleRowColourChange(idx, e.target.value)}
                        placeholder="Colour"
                        className="w-32 text-xs bg-amber-50 text-amber-900 border border-amber-300 rounded-lg px-2 py-1 font-semibold focus:ring-0"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">
                          Quantity ({row.unit})
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={row.quantity === 0 ? '' : row.quantity}
                          placeholder="Qty"
                          onChange={(e) => handleRowQuantityChange(idx, e.target.value)}
                          className="w-full p-2 bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-900"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">
                          {taxType === 'GST_18' ? 'Selling Rate (Incl. 18% GST)' : 'Selling Rate'}
                        </label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">₹</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={row.rate === 0 ? '' : row.rate}
                            placeholder="Rate"
                            onChange={(e) => handleRowRateChange(idx, e.target.value)}
                            className="w-full pl-6 pr-2 py-2 bg-white border border-amber-300 rounded-lg font-mono font-bold text-slate-900"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 font-semibold uppercase block">
                          {taxType === 'GST_18' ? 'Line Total (Incl. GST)' : 'Line Total'}
                        </span>
                        <span className="font-mono font-bold text-amber-600 text-sm">
                          ₹{(row.line_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table View (>= md) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                      <th className="py-3 px-3 w-14">Image</th>
                      <th className="py-3 px-3">Product Name</th>
                      <th className="py-3 px-3">Unit</th>
                      <th className="py-3 px-3 w-28">Quantity</th>
                      <th className="py-3 px-3 w-40">
                        {taxType === 'GST_18' ? 'Selling Rate (Incl. 18% GST) *' : 'Selling Rate *'}
                      </th>
                      <th className="py-3 px-3 w-36 text-right">
                        {taxType === 'GST_18' ? 'Line Total (Incl. GST)' : 'Line Total'}
                      </th>
                      <th className="py-3 px-3 w-10 text-center">Remove</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {productRows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/60">
                        {/* Product Image Thumbnail */}
                        <td className="py-3 px-3">
                          <div className="w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                            <img
                              src={row.image_url}
                              alt={row.product_name}
                              className="w-full h-full object-cover cursor-pointer hover:scale-110 transition-transform"
                              onClick={() => setZoomImage(row.image_url)}
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?w=100&auto=format&fit=crop&q=60';
                              }}
                            />
                          </div>
                        </td>

                        {/* Product Name */}
                        <td className="py-3 px-3">
                          <p className="font-bold text-slate-900">{row.product_name} </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-slate-400">{row.brand}</span>
                            <input
                              type="text"
                              list="colour-options"
                              value={row.item_colour}
                              onChange={(e) => handleRowColourChange(idx, e.target.value)}
                              placeholder="Colour"
                              className="w-28 text-[10px] bg-amber-50 text-amber-900 border border-amber-300 rounded px-1.5 py-0.5 font-semibold focus:ring-0"
                              title="Lubricant colour (taken from the product, editable)"
                            />
                          </div>
                        </td>

                        {/* Unit */}
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-semibold text-[11px] rounded">
                            {row.unit}
                          </span>
                        </td>

                        {/* Quantity Input */}
                        <td className="py-3 px-3">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={row.quantity === 0 ? '' : row.quantity}
                            placeholder="Qty"
                            onChange={(e) => handleRowQuantityChange(idx, e.target.value)}
                            className="w-24 p-1.5 bg-white border border-slate-300 rounded font-mono font-bold text-right"
                          />
                        </td>

                        {/* Custom Selling Rate Input */}
                        <td className="py-3 px-3">
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={row.rate === 0 ? '' : row.rate}
                              onChange={(e) => handleRowRateChange(idx, e.target.value)}
                              className="w-full pl-6 pr-2 py-1.5 bg-white border border-amber-300 rounded font-mono font-bold text-right text-slate-900 focus:ring-1 focus:ring-amber-500"
                              placeholder="Enter rate"
                            />
                          </div>
                          <p className="text-[9px] text-slate-400 text-right mt-0.5">Custom negotiable rate</p>
                        </td>

                        {/* Line Amount */}
                        <td className="py-3 px-3 font-mono font-bold text-slate-900 text-right text-sm">
                          ₹{(row.line_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>

                        {/* Remove Button */}
                        <td className="py-3 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => removeProductRow(idx)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 transition"
                            title="Remove item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Running Totals Summary */}
          {productRows.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div className="text-xs text-slate-600">
                <span>Total Items: <strong>{productRows.length}</strong></span>
                <span className="mx-2">•</span>
                <span>Total Quantity: <strong>{productRows.reduce((a, b) => a + Number(b.quantity), 0)} units</strong></span>
                <span className="mx-2">•</span>
                <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
                  Tax Type: <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[11px]">{taxType === 'GST_18' ? 'GST (18%)' : 'Non-GST'}</span>
                </span>
                <div className="mt-2">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-bold text-slate-700">Discount:</span>
                <div className="inline-flex bg-slate-200/60 rounded-lg p-0.5">
                  {(['NONE', 'PERCENT', 'FLAT'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => { setDiscountType(t); if (t === 'NONE') setDiscountValue(''); }}
                      className={`px-2.5 py-1 rounded-md font-bold transition ${discountType === t ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                      {t === 'NONE' ? 'None' : t === 'PERCENT' ? '% Percent' : '₹ Flat'}
                    </button>
                  ))}
                </div>
                {discountType !== 'NONE' && (
                  <input
                    type="number"
                    min={0}
                    max={discountType === 'PERCENT' ? 100 : grossTotal}
                    step="0.01"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    placeholder={discountType === 'PERCENT' ? 'e.g. 5' : 'e.g. 500'}
                    className="w-28 px-2 py-1 border border-slate-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                )}
                {discountAmount > 0 && (
                  <span className="font-semibold text-emerald-700">− ₹{discountAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                )}
                {discountError && <span className="text-rose-600 font-semibold">{discountError}</span>}
              </div>
                </div>
              </div>
              <div className="text-right space-y-1">
                {discountAmount > 0 && (
                  <>
                    <div className="text-xs text-slate-600">
                      Items Total:{' '}
                      <strong className="text-slate-900 font-mono">₹{grossTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                    </div>
                    <div className="text-xs text-emerald-700">
                      Discount{discountType === 'PERCENT' ? ` (${discountNum}%)` : ''}:{' '}
                      <strong className="font-mono">− ₹{discountAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                    </div>
                  </>
                )}
                <div className="text-xs text-slate-600">
                  {taxType === 'GST_18' ? 'Subtotal (Excl. GST):' : 'Subtotal:'}{' '}
                  <strong className="text-slate-900 font-mono">₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                </div>
                <div className="text-xs text-slate-600">
                  {taxType === 'GST_18' ? 'GST @18%:' : 'GST:'}{' '}
                  <strong className="text-slate-900 font-mono">₹{taxAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                </div>
                <div className="text-base font-bold text-slate-900 pt-1 border-t border-slate-200">
                  {taxType === 'GST_18' ? 'Estimated Total (Incl. GST):' : 'Estimated Total:'}{' '}
                  <span className="font-mono text-amber-600 text-lg">₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-between pt-4 border-t">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl"
            >
              ← Back to Party
            </button>
            <button
              type="button"
              disabled={productRows.length === 0}
              onClick={() => setStep(4)}
              className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 text-slate-950 font-bold text-xs rounded-xl shadow-xs flex items-center gap-2"
            >
              <span>Continue to Delivery & Final Review</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: DELIVERY DETAILS & FINAL REVIEW (NO ADVANCE COLLECTION) */}
      {step === 4 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
          <div className="border-b pb-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Truck className="w-5 h-5 text-amber-500" />
              Delivery Details & Commercial Confirmation
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Advance payments are not collected at order creation. Orders are booked with ₹0 received; client will make payment against the order slip.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: Simplified Delivery Destination & Contact */}
            <div className="space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-800">Delivery Destination Address *</label>
                <label className="flex items-center gap-1.5 text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sameAsVendorAddress}
                    onChange={(e) => {
                      setSameAsVendorAddress(e.target.checked);
                      if (e.target.checked && selectedVendor) {
                        setDeliveryAddress(selectedVendor.delivery_address || selectedVendor.billing_address);
                      }
                    }}
                    className="rounded border-slate-300 text-amber-600"
                  />
                  <span>Same as Party Address</span>
                </label>
              </div>

              <textarea
                rows={3}
                required
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder="Enter complete shipping address, industrial gate number, warehouse location..."
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Contact Person at Site</label>
                  <input
                    type="text"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    placeholder="Recipient / Manager name"
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1">Contact Phone Number</label>
                  <input
                    type="text"
                    value={contactNumber}
                    onChange={(e) => setContactNumber(e.target.value)}
                    placeholder="10-digit phone"
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1">Transporter Name</label>
                  <input
                    type="text"
                    value={transportName}
                    onChange={(e) => setTransportName(e.target.value)}
                    placeholder="Transport company name"
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Transporter Contact</label>
                  <input
                    type="text"
                    value={transportContactNumber}
                    onChange={(e) => setTransportContactNumber(e.target.value)}
                    placeholder="Transporter phone / WhatsApp"
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Booking Station</label>
                  <input
                    type="text"
                    value={bookingStation}
                    onChange={(e) => setBookingStation(e.target.value)}
                    placeholder="Booking station name"
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Transporter Address</label>
                  <input
                    type="text"
                    value={transportAddress}
                    onChange={(e) => setTransportAddress(e.target.value)}
                    placeholder="Transporter address"

                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                  />


                </div>
              </div>

              {/* Order Remarks */}
              <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="order-remarks" className="font-bold text-slate-800 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-amber-500" />
                    Order Remarks / Notes
                  </label>
                  <span className="text-[10px] text-slate-400">Optional · {specialInstructions.length}/300</span>
                </div>
                <textarea
                  id="order-remarks"
                  rows={3}
                  maxLength={300}
                  value={specialInstructions}
                  onChange={(e) => setSpecialInstructions(e.target.value)}
                  placeholder="Commercial notes, delivery guidelines, special packing instructions..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs placeholder:text-slate-400 focus:bg-white focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none resize-none transition"
                />
              </div>
            </div>

            {/* Right: Initial Financial Summary Card */}
            <div className="space-y-4 md:sticky md:top-4 self-start">
              <div className="p-5 bg-gradient-to-br from-slate-50 to-amber-50/40 rounded-2xl border border-amber-200/70 space-y-4">
                <div className="flex items-center justify-between border-b border-amber-200/50 pb-3">
                  <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                    <CreditCard className="w-4 h-4 text-amber-600" />
                    Initial Order Financial Statement
                  </h3>
                  <span className="px-2 py-0.5 bg-rose-100 text-rose-800 font-bold text-[10px] rounded-full uppercase">
                    Status: Unpaid
                  </span>
                </div>

                <div className="p-4 bg-slate-900 rounded-xl text-center">
                  <p className="text-[10px] uppercase tracking-wider text-amber-300 font-semibold">Order Total</p>
                  <p className="text-3xl font-bold font-mono text-white mt-0.5">₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{productRows.length} product{productRows.length === 1 ? '' : 's'} · {productRows.reduce((a, r) => a + (Number(r.quantity) || 0), 0)} units</p>
                </div>

                <div className="space-y-2 text-xs text-slate-700">
                  <div className="flex justify-between">
                    <span>Tax Billing Mode:</span>
                    <span className="font-semibold text-slate-900">
                      {taxType === 'GST_18' ? 'GST (18%) — Reverse Included' : 'Non-GST (No Tax)'}
                    </span>
                  </div>
                  {discountAmount > 0 && (
                    <>
                      <div className="flex justify-between">
                        <span>Items Total:</span>
                        <span className="font-mono font-semibold">₹{grossTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between text-emerald-700">
                        <span>Discount{discountType === 'PERCENT' ? ` (${discountNum}%)` : ' (Flat)'}:</span>
                        <span className="font-mono font-semibold">− ₹{discountAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between">
                    <span>{taxType === 'GST_18' ? 'Subtotal (Excl. GST):' : 'Subtotal:'}</span>
                    <span className="font-mono font-semibold">₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>
                      {taxType !== 'GST_18'
                        ? 'GST:'
                        : /delhi/i.test(String((selectedVendor as any)?.state || ''))
                          ? 'GST @18% (CGST 9% + SGST 9%):'
                          : 'IGST @18% (Interstate):'}
                    </span>
                    <span className="font-mono font-semibold">₹{taxAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2 text-slate-900 font-bold text-sm">
                    <span>{taxType === 'GST_18' ? 'Estimated Total (Incl. GST):' : 'Estimated Total:'}</span>
                    <span className="font-mono text-base text-slate-900">₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Verified Received Amount:</span>
                    <span className="font-mono font-bold text-slate-800">₹0.00</span>
                  </div>
                  <div className="flex justify-between text-rose-700 font-bold">
                    <span>Balance Payment:</span>
                    <span className="font-mono text-sm">₹{pendingAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                {Number((selectedVendor as any)?.credit_balance || 0) > 0 && (
                  <label className="p-3 bg-indigo-50 rounded-xl border border-indigo-200 flex items-start gap-2.5 text-xs text-indigo-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useCredit}
                      onChange={(e) => setUseCredit(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      <strong>Adjust party credit:</strong> {selectedVendor?.company_name} has ₹{Number((selectedVendor as any).credit_balance).toLocaleString('en-IN')} saved credit.
                      Tick to use up to ₹{Math.min(Number((selectedVendor as any).credit_balance), grandTotal).toLocaleString('en-IN')} against this order. Leave unticked to keep it for later.
                    </span>
                  </label>
                )}

                <div className="p-3 bg-amber-100/60 rounded-xl border border-amber-200 flex items-start gap-2.5 text-[11px] text-amber-900">
                  <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <p>
                    <strong>Workflow Notice:</strong> Advance collection is not recorded here. After submitting, share the generated <strong>Order Slip</strong> with the client. Once payment is made, submit a payment entry in <strong>Payments & Ledger</strong> for Accounts verification.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-between pt-4 border-t">
            <button
              type="button"
              onClick={() => setStep(3)}
              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl"
            >
              ← Back to Products
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleSubmitOrder}
              className="px-8 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 text-slate-950 font-bold text-sm rounded-xl shadow-md flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                  <span>Submitting Order...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Submit Order & Generate Slip</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* STEP 5: SUCCESS STATE */}
      {step === 5 && createdOrderResult && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-8 text-center space-y-5 max-w-xl mx-auto">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-900">Sales Order Booked Successfully!</h2>
            <p className="text-sm font-mono font-bold text-amber-600 mt-1">{createdOrderResult.number}</p>
            <p className="text-xs text-slate-500 mt-2">
              Order has been registered in the system with ₹0 received and full amount pending. You can now view, print, or share the official Order Slip.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setSlipModalOpen(true)}
              className="w-full sm:w-auto px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-2"
            >
              <Package className="w-4 h-4" />
              <span>View / Print Order Slip</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate(`orders/${createdOrderResult.id}`)}
              className="w-full sm:w-auto px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl shadow-xs"
            >
              Go to Order Detail
            </button>
            <button
              type="button"
              onClick={() => {
                setStep(1);
                setProductRows([]);
                setSelectedVendorId(null);
                setCreatedOrderResult(null);
              }}
              className="w-full sm:w-auto px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl"
            >
              Create Another Order
            </button>
          </div>
        </div>
      )}

      {/* SEARCHABLE PRODUCT SELECTOR MODAL (Requirement 2) */}
      {/* SEARCHABLE MULTI-SELECT PRODUCT MODAL */}
      {showProductModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full p-6 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                  <Package className="w-5 h-5 text-amber-500" />
                  Select Lubricant Products
                </h3>
                <p className="text-xs text-slate-500">Tick multiple products, then add them all at once</p>
              </div>
              <button onClick={closeProductModal}><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                autoFocus
                placeholder="Search product by name, SKU, brand or category..."
                value={productSearchTerm}
                onChange={(e) => setProductSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium"
              />
            </div>

            {/* Select all bar */}
            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={allSelected}
                  disabled={selectable.length === 0}
                  onChange={toggleSelectAll}
                  className="rounded border-slate-300 text-amber-600"
                />
                <span>Select all ({selectable.length})</span>
              </label>
              <span className="text-slate-500">
                <strong className="text-slate-900">{selectedIds.length}</strong> selected
              </span>
            </div>

            {/* Mobile list (< sm) */}
            <div className="block sm:hidden overflow-y-auto flex-1 divide-y divide-slate-100 border border-slate-200 rounded-xl">
              {filteredProducts.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  No lubricant products match "{productSearchTerm}"
                </div>
              ) : (
                filteredProducts.map(p => {
                  const added = addedIds.has(p.id);
                  const checked = selectedIds.includes(p.id);
                  return (
                    <div
                      key={p.id}
                      onClick={() => !added && toggleSelect(p.id)}
                      className={`p-3 flex items-center gap-3 transition-colors ${added ? 'opacity-50' : checked ? 'bg-amber-50 cursor-pointer' : 'hover:bg-amber-50/50 cursor-pointer'
                        }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked || added}
                        disabled={added}
                        onChange={() => toggleSelect(p.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-slate-300 text-amber-600 shrink-0"
                      />
                      <img
                        src={p.image_url || PLACEHOLDER_IMG}
                        alt={p.name}
                        className="w-11 h-11 rounded-lg object-cover border border-slate-200 bg-slate-100 shrink-0"
                        onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER_IMG; }}
                      />
                      <div className="overflow-hidden flex-1">
                        <p className="font-bold text-slate-900 text-xs truncate">{p.name}</p>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono mt-0.5">
                          <span>{p.brand_name}</span>
                        </div>
                      </div>
                      {added && (
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded shrink-0">Added</span>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Desktop table (>= sm) */}
            <div className="hidden sm:block overflow-auto flex-1 border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3 w-10">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        disabled={selectable.length === 0}
                        onChange={toggleSelectAll}
                        className="rounded border-slate-300 text-amber-600"
                      />
                    </th>
                    <th className="py-2.5 px-3">Image</th>
                    <th className="py-2.5 px-3">Product Name</th>
                    <th className="py-2.5 px-3">Unit</th>
                    <th className="py-2.5 px-3">Brand</th>
                    <th className="py-2.5 px-3">Category</th>

                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        No lubricant products match "{productSearchTerm}"
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map(p => {
                      const added = addedIds.has(p.id);
                      const checked = selectedIds.includes(p.id);
                      return (
                        <tr
                          key={p.id}
                          onClick={() => !added && toggleSelect(p.id)}
                          className={`transition-colors ${added ? 'opacity-50' : checked ? 'bg-amber-50 cursor-pointer' : 'hover:bg-amber-50/50 cursor-pointer'
                            }`}
                        >
                          <td className="py-2.5 px-3">
                            <input
                              type="checkbox"
                              checked={checked || added}
                              disabled={added}
                              onChange={() => toggleSelect(p.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="rounded border-slate-300 text-amber-600"
                            />
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                              <img
                                src={p.image_url || PLACEHOLDER_IMG}
                                alt={p.name}
                                className="w-full h-full object-cover"
                                onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER_IMG; }}
                              />
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <p className="font-bold text-slate-900">
                              {p.name}
                              {added && (
                                <span className="ml-2 px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded">Added</span>
                              )}
                            </p>
                            <p className="text-[10px] text-slate-400 truncate max-w-xs">{p.description || 'Standard formulation'}</p>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-800 rounded font-semibold text-[10px]">{p.unit}</span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">{p.brand_name}</td>
                          <td className="py-2.5 px-3 text-slate-600">{p.category_name}</td>

                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-2 border-t">
              <button
                type="button"
                onClick={closeProductModal}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddSelected}
                disabled={selectedIds.length === 0}
                className="px-5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 text-slate-950 font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                <span>Add {selectedIds.length > 0 ? `${selectedIds.length} ` : ''}Selected</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Colour suggestions come from the colours entered on the products themselves (no fixed list) */}
      <datalist id="colour-options">
        {Array.from(new Set(products.map(p => (p.item_colour || '').trim()).filter(Boolean))).map(c => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {/* INLINE NEW VENDOR MODAL */}
      {showAddVendorModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-slate-900">Add New Party</h3>
              <button onClick={() => setShowAddVendorModal(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            <form onSubmit={handleSaveNewVendor} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">Party Name *</label>
                <input
                  type="text"
                  required
                  value={newVendorForm.company_name}
                  onChange={(e) => setNewVendorForm({ ...newVendorForm, company_name: e.target.value })}
                  placeholder="e.g. Apex Auto Spares & Fleets"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Contact Person *</label>
                  <input
                    type="text"
                    required
                    value={newVendorForm.contact_person}
                    onChange={(e) => setNewVendorForm({ ...newVendorForm, contact_person: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">GSTIN Number</label>
                  <input
                    type="text"
                    value={newVendorForm.gstin}
                    onChange={(e) => setNewVendorForm({ ...newVendorForm, gstin: e.target.value.toUpperCase() })}
                    placeholder="27AAAAA0000A1Z5"
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">City *</label>
                  <input
                    type="text"
                    required
                    value={newVendorForm.city}
                    onChange={(e) => {
                      const city = e.target.value;
                      const guess = stateForCity(city);
                      // Fill the state from the city (Delhi -> Delhi) unless the user already chose one by hand
                      setNewVendorForm({
                        ...newVendorForm,
                        city,
                        state: !stateChosenByUser && guess ? guess : newVendorForm.state
                      });
                    }}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">State *</label>
                <StateSelect
                  required
                  value={newVendorForm.state}
                  onChange={(st) => { setStateChosenByUser(true); setNewVendorForm({ ...newVendorForm, state: st }); }}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Billing & Delivery Address *</label>
                <textarea
                  rows={2}
                  required
                  value={newVendorForm.billing_address}
                  onChange={(e) => setNewVendorForm({ ...newVendorForm, billing_address: e.target.value, delivery_address: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowAddVendorModal(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 font-semibold rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg shadow-xs"
                >
                  Save & Select Party
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

      {/* Order Slip Modal on Success */}
      {slipModalOpen && slipFullData && (
        <OrderSlipModal
          order={slipFullData.order}
          items={slipFullData.items || []}
          isOpen={slipModalOpen}
          onClose={() => setSlipModalOpen(false)}
        />
      )}
    </div>
  );
};