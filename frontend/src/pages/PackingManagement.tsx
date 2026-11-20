import { DeliverModal } from '../components/DeliverModal.js';
import React, { useState, useEffect } from 'react';
import {
  PackageCheck, CheckCircle2, Clock, AlertTriangle, ArrowRight,
  Eye, RefreshCw, X, Box, Check, AlertCircle, User, Truck, Building2, Search, Filter,
  Printer, Download
} from 'lucide-react';
import { useAuth } from '../store/authStore.js';
import { DateRangeFilter } from '../components/DateRangeFilter.js';
import { DateRange, getDateRangeFromPreset } from '../utils/dateFilters.js';
import { apiFetch } from '../lib/api.js';
import { getToken } from '../lib/session.js';
import { createPortal } from 'react-dom';


const esc = (v: any) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const printPackingSlip = (order: any) => {
  const items = order.items || [];
  const totalQty = items.reduce((a: number, b: any) => a + (Number(b.quantity) || 0), 0);
  const dateStr = order.created_at
    ? new Date(String(order.created_at).replace(' ', 'T')).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '-';
  const title = `Packing-Slip-${order.order_number}`;

  const rows = items.map((it: any, idx: number) => `
  <tr>
    <td class="c">${idx + 1}</td>
    <td class="img-cell">
      ${it.product_image
      ? `<img
               class="product-img"
               src="${esc(it.product_image)}"
               alt="${esc(it.product_name)}"
             />`
      : '<div class="no-img">No Image</div>'
    }
    </td>
    <td>
      <b>${esc(it.product_name || '-')}</b>
    </td>
    <td>${esc(it.brand_name || '-')}</td>
    <td>
      <span class="colour-tag">
        ${esc(it.item_colour || '-')}
      </span>
    </td>
    <td>${esc(it.unit || '-')}</td>
    <td class="r"><b>${esc(it.quantity ?? 0)}</b></td>
    <td class="c"><span class="chk"></span></td>
  </tr>
`).join('');

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #000; margin: 0; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 12px; }
  .brand { font-size: 18px; font-weight: 900; }
  .right { text-align: right; }
  .ttl { font-size: 16px; font-weight: 800; letter-spacing: 1px; }
  .grid { display: flex; gap: 10px; margin-bottom: 12px; }
  .box { flex: 1; border: 1px solid #000; padding: 8px 10px; }
  .lbl { font-size: 10px; font-weight: 700; text-transform: uppercase; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #000; padding: 6px 8px; text-align: left; vertical-align: middle; }
  th { background: #eee; }
  tr { page-break-inside: avoid; }
  .c { text-align: center; } .r { text-align: right; }
.product-img {
  width: 48px;
  height: 48px;
  object-fit: contain;
  display: block;
  margin: auto;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 2px;
}

.img-cell {
  width: 65px;
  text-align: center;
}

.no-img {
  width: 48px;
  height: 48px;
  border: 1px dashed #aaa;
  font-size: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: auto;
  color: #777;
}

.colour-tag {
  display: inline-block;
  padding: 3px 6px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 10px;
  font-weight: bold;
  background: #f5f5f5;
  color: #222;
}

td {
  vertical-align: middle;
}

@media print {
  .product-img {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  tr {
    page-break-inside: avoid;
  }
}
  .chk { display: inline-block; width: 14px; height: 14px; border: 1px solid #000; }
  .sign { display: flex; justify-content: space-between; gap: 24px; margin-top: 60px; }
  .sign div { flex: 1; text-align: center; border-top: 1px solid #000; padding-top: 4px; font-weight: 700; }
  .foot { margin-top: 16px; font-size: 10px; text-align: center; }
</style></head>
<body>
  <div class="head">
    <div><div class="brand">Auto pickup</div><div style="font-size:11px">Lubricant Order &amp; Delivery</div></div>
    <div class="right">
      <div class="ttl">PACKING SLIP</div>
      <div>Order No: <b>#${esc(order.order_number)}</b></div>
      <div>Date: <b>${esc(dateStr)}</b></div>
    </div>
  </div>

  <div class="grid">
    <div class="box">
      <div class="lbl">Client / Party</div>
      <div style="font-weight:700;font-size:14px">${esc(order.vendor_name)}</div>
      ${order.vendor_city ? `<div>${esc(order.vendor_city)}</div>` : ''}
      <div style="margin-top:4px"><b>Delivery To:</b> ${esc(order.delivery_address || 'Same as client address')}</div>
    </div>
    <div class="box">
      <div class="lbl">Order Info</div>
      <div>Sales Rep: <b>${esc(order.sales_person_name)}</b></div>
      <div>Target Date: <b>${esc(order.required_delivery_date || 'Standard')}</b></div>
      <div>Packing Status: <b>${esc(String(order.packing_status || '').replace(/_/g, ' '))}</b></div>
    </div>
  </div>

  <div class="box" style="margin-bottom:12px">
    <div class="lbl">Transport Details</div>
    <div style="display:flex;gap:16px;flex-wrap:wrap">
      <div style="flex:1;min-width:140px"><span style="font-size:10px;color:#444">TRANSPORT NAME</span><br/><b>${esc(order.transportName || '-')}</b></div>
      <div style="flex:1;min-width:140px"><span style="font-size:10px;color:#444">BOOKING STATION</span><br/><b>${esc(order.booking_station || '-')}</b></div>
      <div style="flex:1;min-width:140px"><span style="font-size:10px;color:#444">TRANSPORT CONTACT</span><br/><b>${esc(order.transport_contact_number || '-')}</b></div>
    </div>
    <div style="margin-top:4px"><span style="font-size:10px;color:#444">TRANSPORT ADDRESS</span><br/><b>${esc(order.transportAddress || '-')}</b></div>
    ${order.delivery_contact_person || order.delivery_contact_number ? `<div style="margin-top:4px"><span style="font-size:10px;color:#444">SITE CONTACT</span><br/><b>${esc(order.delivery_contact_person || '')} ${esc(order.delivery_contact_number || '')}</b></div>` : ''}
  </div>

  ${order.special_instructions ? `<div class="box" style="margin-bottom:12px"><b>Special Instructions:</b> ${esc(order.special_instructions)}</div>` : ''}

  <table>
    <thead>
<tr>
  <th class="c" style="width:28px">#</th>
  <th class="c" style="width:65px">Image</th>
  <th>Product</th>
  <th>Brand</th>
  <th>Colour</th>
  <th>Pack Size</th>
  <th class="r">Qty</th>
  <th class="c" style="width:50px">Packed</th>
</tr>
    </thead>
    <tbody>
      ${rows}
      <tr>
        <td colspan="6" class="r"><b>Total (${items.length} items)</b></td>
        <td class="r"><b>${totalQty}</b></td><td></td>
      </tr>
    </tbody>
  </table>

  <div class="sign"><div>Packed By</div><div>Checked By</div><div>Received By</div></div>
  <div class="foot">This is a computer-generated packing slip from Auto pickup.</div>
</body></html>`;

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(iframe);

  const win = iframe.contentWindow!;
  const doc = win.document;
  doc.open();
  doc.write(html);
  doc.close();

  const oldTitle = document.title;
  document.title = title; // PDF file name
  const done = () => {
    document.title = oldTitle;
    setTimeout(() => iframe.remove(), 300);
  };
  win.onafterprint = done;

  setTimeout(() => {
    win.focus();
    win.print();
  }, 300);
};

export const PackingManagement: React.FC<{ onNavigate: (page: string) => void }> = ({ onNavigate }) => {
  const { user, hasPermission } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'ALL' | 'PENDING' | 'IN_PROGRESS' | 'PACKED' | 'DELIVERED' | 'ON_HOLD'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>(() => getDateRangeFromPreset('this_month'));

  // Dynamic filter state (Sales Person & Vendor)
  const [salesPersonsList, setSalesPersonsList] = useState<{ id: any; name: string }[]>([]);
  const [vendorsList, setVendorsList] = useState<{ id: any; name: string }[]>([]);
  const [selectedSalesPerson, setSelectedSalesPerson] = useState<string>('ALL');
  const [selectedVendor, setSelectedVendor] = useState<string>('ALL');

  // Selected Order for packing actions modal
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [orderToDeliver, setOrderToDeliver] = useState<any | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [holdModalOpen, setHoldModalOpen] = useState(false);
  const [holdReason, setHoldReason] = useState('Stock unavailable for one or more ordered lubricant grades');
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [slipOrder, setSlipOrder] = useState<any | null>(null);

  const handlePrintSlip = (ord: any) => printPackingSlip(ord);
  const onDeliverDone = async () => {
    setOrderToDeliver(null);
    setSelectedOrder(null);
    await fetchOrders();
  };

  useEffect(() => {
    if (!slipOrder) return;
    const oldTitle = document.title;
    document.title = `Packing-Slip-${slipOrder.order_number}`; // PDF file name
    const restore = () => {
      document.title = oldTitle;
      setSlipOrder(null);
    };
    window.addEventListener('afterprint', restore);
    const t = setTimeout(() => window.print(), 300);
    return () => {
      clearTimeout(t);
      window.removeEventListener('afterprint', restore);
      document.title = oldTitle;
    };
  }, [slipOrder]);

  const fetchOrders = async (range: DateRange = dateRange, sp = selectedSalesPerson, v = selectedVendor): Promise<any[] | null> => {
    setLoading(true);
    let fresh: any[] | null = null;
    try {
      const token = getToken();
      const params = new URLSearchParams();
      if (range.startDate) params.append('startDate', range.startDate);
      if (range.endDate) params.append('endDate', range.endDate);
      if (sp && sp !== 'ALL') params.append('sales_person_id', sp);
      if (v && v !== 'ALL') params.append('vendor_id', v);

      const res = await apiFetch(`/api/packing/orders?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const json = await res.json();
        setOrders(json.orders || []);
        fresh = json.orders || [];
        if (json.salesPersons && json.salesPersons.length > 0) {
          setSalesPersonsList(json.salesPersons);
        }
        if (json.vendors && json.vendors.length > 0) {
          setVendorsList(json.vendors);
        }
      }
    } catch (err) {
      console.error('Error fetching packing orders:', err);
    } finally {
      setLoading(false);
    }
    return fresh;
  };

  useEffect(() => {
    fetchOrders(dateRange, selectedSalesPerson, selectedVendor);
  }, [dateRange, selectedSalesPerson, selectedVendor]);

  // Dynamically compute unique sales persons from orders and masters
  const dynamicSalesPersons = React.useMemo(() => {
    const map = new Map<string, string>();
    salesPersonsList.forEach(sp => {
      if (sp.name) map.set(sp.name.trim(), sp.name.trim());
    });
    orders.forEach(o => {
      if (o.sales_person_name) map.set(o.sales_person_name.trim(), o.sales_person_name.trim());
    });
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
  }, [salesPersonsList, orders]);

  // Dynamically compute unique vendors from orders and masters
  const dynamicVendors = React.useMemo(() => {
    const map = new Map<string, string>();
    vendorsList.forEach(v => {
      if (v.name) map.set(v.name.trim(), v.name.trim());
    });
    orders.forEach(o => {
      if (o.vendor_name) map.set(o.vendor_name.trim(), o.vendor_name.trim());
    });
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
  }, [vendorsList, orders]);

  const handlePackingAction = async (orderId: number, action: string, extraData: any = {}) => {
    setActionLoading(true);
    try {
      const token = getToken();
      const res = await apiFetch(`/api/orders/${orderId}/packing-action`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action, ...extraData })
      });
      const data = await res.json();
      if (res.ok) {
        if (action === 'MARK_ON_HOLD') {
          setHoldModalOpen(false);
        }
        // Reload list, then move the open popup to the order's NEW state ( next step button shows up )
        const freshOrders = await fetchOrders();
        if (selectedOrder && selectedOrder.id === orderId && freshOrders) {
          const updated = freshOrders.find((o: any) => o.id === orderId);
          setSelectedOrder(updated || null);
        }
      } else {
        alert(data.error || 'Failed to update packing status');
      }
    } catch (err) {
      console.error(err);
      alert('Error updating packing action');
    } finally {
      setActionLoading(false);
    }
  };

  // Filter orders by tab, sales person, vendor & search (Combined filtering)
  const filteredOrders = orders.filter(o => {
    const isDelivered = o.order_status === 'DELIVERED' || o.delivery_status === 'DELIVERED' || o.packing_status === 'DELIVERED';
    // Tab filter
    if (activeTab === 'PENDING' && (o.packing_status !== 'PENDING_PACKING' || isDelivered)) return false;
    if (activeTab === 'IN_PROGRESS' && (o.packing_status !== 'PACKING_IN_PROGRESS' || isDelivered)) return false;
    if (activeTab === 'PACKED' && (o.packing_status !== 'PACKED' || isDelivered)) return false;
    if (activeTab === 'DELIVERED' && !isDelivered) return false;
    if (activeTab === 'ON_HOLD' && ((o.order_status !== 'ON_HOLD' && o.packing_status !== 'ON_HOLD') || isDelivered)) return false;

    // Filter 1: Sales Person
    if (selectedSalesPerson !== 'ALL') {
      const matchSP = (o.sales_person_name || '').trim().toLowerCase() === selectedSalesPerson.trim().toLowerCase() ||
        String(o.sales_person_id) === selectedSalesPerson;
      if (!matchSP) return false;
    }

    // Filter 2: Vendor
    if (selectedVendor !== 'ALL') {
      const matchV = (o.vendor_name || '').trim().toLowerCase() === selectedVendor.trim().toLowerCase() ||
        String(o.vendor_id) === selectedVendor;
      if (!matchV) return false;
    }

    // Search filter
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      const matchNum = o.order_number?.toLowerCase().includes(s);
      const matchVendor = o.vendor_name?.toLowerCase().includes(s);
      const matchSales = o.sales_person_name?.toLowerCase().includes(s);
      const matchItem = o.items?.some((it: any) =>
        it.product_name?.toLowerCase().includes(s) || it.sku?.toLowerCase().includes(s)
      );
      if (!matchNum && !matchVendor && !matchSales && !matchItem) return false;
    }
    return true;
  });

  const hasActiveFilters = selectedSalesPerson !== 'ALL' || selectedVendor !== 'ALL' || searchTerm.trim() !== '' || dateRange.preset !== 'this_month';

  const handleClearFilters = () => {
    setSelectedSalesPerson('ALL');
    setSelectedVendor('ALL');
    setSearchTerm('');
    setDateRange(getDateRangeFromPreset('this_month'));
  };

  // Metric counts
  const pendingCount = orders.filter(o => o.packing_status === 'PENDING_PACKING' && o.order_status !== 'ON_HOLD' && o.order_status !== 'DELIVERED').length;
  const inProgressCount = orders.filter(o => o.packing_status === 'PACKING_IN_PROGRESS' && o.order_status !== 'ON_HOLD' && o.order_status !== 'DELIVERED').length;
  const packedCount = orders.filter(o => o.packing_status === 'PACKED' && o.order_status !== 'DELIVERED' && o.order_status !== 'ON_HOLD').length;
  const deliveredCount = orders.filter(o => o.order_status === 'DELIVERED' || o.delivery_status === 'DELIVERED' || o.packing_status === 'DELIVERED').length;
  const holdCount = orders.filter(o => (o.order_status === 'ON_HOLD' || o.packing_status === 'ON_HOLD') && o.order_status !== 'DELIVERED').length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6   mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <PackageCheck className="w-6 h-6 text-amber-500" />
            Packing Management
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Check finished lubricant stock availability, pack customer consignments, and directly deliver verified consignments.
          </p>
        </div>

        <button
          onClick={() => fetchOrders()}
          className="p-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 flex items-center gap-1.5 self-start"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Refresh Queue</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <button
          onClick={() => setActiveTab('PENDING')}
          className={`p-4 rounded-xl border text-left transition ${activeTab === 'PENDING' ? 'bg-amber-500/10 border-amber-500 ring-2 ring-amber-400/20' : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
        >
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold">Pending Packing</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-bold font-mono text-slate-900">{pendingCount}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Awaiting packing</p>
        </button>

        <button
          onClick={() => setActiveTab('IN_PROGRESS')}
          className={`p-4 rounded-xl border text-left transition ${activeTab === 'IN_PROGRESS' ? 'bg-blue-500/10 border-blue-500 ring-2 ring-blue-400/20' : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
        >
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold">Packing In Progress</span>
            <Box className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-bold font-mono text-blue-600">{inProgressCount}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Being packed now</p>
        </button>

        <button
          onClick={() => setActiveTab('PACKED')}
          className={`p-4 rounded-xl border text-left transition ${activeTab === 'PACKED' ? 'bg-indigo-500/10 border-indigo-500 ring-2 ring-indigo-400/20' : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
        >
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold">Packed Orders</span>
            <CheckCircle2 className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-2xl font-bold font-mono text-indigo-600">{packedCount}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Ready for DELIVER</p>
        </button>

        <button
          onClick={() => setActiveTab('DELIVERED')}
          className={`p-4 rounded-xl border text-left transition ${activeTab === 'DELIVERED' ? 'bg-emerald-500/10 border-emerald-500 ring-2 ring-emerald-400/20' : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
        >
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold">Order Delivered</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold font-mono text-emerald-700">{deliveredCount}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Customer received</p>
        </button>

        <button
          onClick={() => setActiveTab('ON_HOLD')}
          className={`p-4 rounded-xl border text-left transition ${activeTab === 'ON_HOLD' ? 'bg-rose-500/10 border-rose-500 ring-2 ring-rose-400/20' : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
        >
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold">Orders On Hold</span>
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          </div>
          <p className="text-2xl font-bold font-mono text-rose-600">{holdCount}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Stock unavailable</p>
        </button>
      </div>

      {/* Unified Packing Date Filter */}
      <DateRangeFilter
        value={dateRange}
        onChange={(newRange) => {
          setDateRange(newRange);
        }}
        defaultPreset="this_month"
        allowAllTime={true}
      />

      {/* Status Tabs Bar */}
      <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto w-full pb-1 text-xs font-semibold scrollbar-none">
          {[
            { id: 'ALL', label: `All Orders (${orders.length})` },
            { id: 'PENDING', label: `Pending Packing (${pendingCount})` },
            { id: 'IN_PROGRESS', label: `In Packing (${inProgressCount})` },
            { id: 'PACKED', label: `Packed (${packedCount})` },
            { id: 'DELIVERED', label: `Order Delivered (${deliveredCount})` },
            { id: 'ON_HOLD', label: `On Hold (${holdCount})` },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className={`px-3.5 py-2 rounded-lg shrink-0 transition whitespace-nowrap text-xs ${activeTab === t.id
                ? 'bg-slate-900 text-white font-bold shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Dynamic Filters Bar: Sales Person & Vendor & Search */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
          {/* Filter 1: Sales Person */}
          <div className="sm:col-span-1 lg:col-span-4">
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-amber-500" />
              <span>Sales Person</span>
            </label>
            <select
              value={selectedSalesPerson}
              onChange={(e) => setSelectedSalesPerson(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:bg-white focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none transition"
            >
              <option value="ALL">All Sales Persons</option>
              {dynamicSalesPersons.map(sp => (
                <option key={sp} value={sp}>{sp}</option>
              ))}
            </select>
          </div>

          {/* Filter 2: Vendor */}
          <div className="sm:col-span-1 lg:col-span-4">
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-amber-500" />
              <span>Party / Client</span>
            </label>
            <select
              value={selectedVendor}
              onChange={(e) => setSelectedVendor(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:bg-white focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none transition"
            >
              <option value="ALL">All Parties</option>
              {dynamicVendors.map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>

          {/* Search Box */}
          <div className="sm:col-span-2 lg:col-span-4">
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <span>Search Orders</span>
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Filter by Order #, client, SKU or product..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:bg-white focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none transition"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Active Filters Summary & Clear Filters Action */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-slate-100 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-500">
              Showing <strong>{filteredOrders.length}</strong> of <strong>{orders.length}</strong> orders
            </span>

            {selectedSalesPerson !== 'ALL' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-50 text-amber-900 border border-amber-200 rounded-md font-medium text-[11px]">
                Sales: <strong>{selectedSalesPerson}</strong>
                <button
                  onClick={() => setSelectedSalesPerson('ALL')}
                  className="hover:text-amber-700 ml-0.5 p-0.5"
                  title="Remove Sales Person filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {selectedVendor !== 'ALL' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-blue-50 text-blue-900 border border-blue-200 rounded-md font-medium text-[11px]">
                Party: <strong>{selectedVendor}</strong>
                <button
                  onClick={() => setSelectedVendor('ALL')}
                  className="hover:text-blue-700 ml-0.5 p-0.5"
                  title="Remove Party filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {searchTerm && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-slate-100 text-slate-800 border border-slate-200 rounded-md font-medium text-[11px]">
                Search: <strong>"{searchTerm}"</strong>
                <button
                  onClick={() => setSearchTerm('')}
                  className="hover:text-slate-900 ml-0.5 p-0.5"
                  title="Remove search query"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <button
              onClick={handleClearFilters}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs rounded-lg transition"
            >
              <X className="w-3.5 h-3.5" />
              <span>Clear Filters</span>
            </button>
          )}
        </div>
      </div>

      {/* Orders Grid */}
      {loading ? (
        <div className="p-12 text-center text-slate-500">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-xs font-semibold">Loading packing orders queue...</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center text-slate-400 space-y-2">
          <PackageCheck className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="text-sm font-bold text-slate-700">No orders in this packing view</p>
          <p className="text-xs text-slate-500">All customer lubricant orders are up to date.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredOrders.map(ord => {
            const isDelivered = ord.order_status === 'DELIVERED' || ord.delivery_status === 'DELIVERED' || ord.packing_status === 'DELIVERED';
            const isHold = (ord.order_status === 'ON_HOLD' || ord.packing_status === 'ON_HOLD') && !isDelivered;
            const isPacked = ord.packing_status === 'PACKED' && !isDelivered;
            const isInProgress = (ord.packing_status === 'PACKING_IN_PROGRESS' || ord.packing_status === 'IN_PROGRESS') && !isDelivered;

            return (
              <div
                key={ord.id}
                className={`bg-white rounded-2xl border p-5 flex flex-col justify-between space-y-4 transition hover:shadow-md ${isDelivered
                  ? 'border-emerald-300 bg-emerald-50/20 shadow-2xs'
                  : isHold
                    ? 'border-rose-200 bg-rose-50/20'
                    : isPacked
                      ? 'border-indigo-300 bg-indigo-50/20'
                      : isInProgress
                        ? 'border-blue-200 bg-blue-50/20'
                        : 'border-slate-200 shadow-xs'
                  }`}
              >
                <div className="space-y-3">
                  {/* Top Bar */}
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-slate-900 text-sm flex items-center gap-1.5">
                      {isDelivered && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                      #{ord.order_number}
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${isDelivered
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : isHold
                        ? 'bg-rose-100 text-rose-800'
                        : isPacked
                          ? 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                          : isInProgress
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800'
                      }`}>
                      {isDelivered ? 'Delivered' : isHold ? 'On Hold' : isPacked ? 'Packed' : isInProgress ? 'Packing In Progress' : 'Pending Packing'}
                    </span>
                  </div>

                  <div>
                    <h3 className="font-bold text-slate-900 text-md truncate" title={ord.vendor_name}>{ord.vendor_name}</h3>
                    <p className="text-md text-slate-900 mt-0.5 truncate">
                      Sales Rep: <span className="font-bold">{ord.sales_person_name}</span> • Target Date: {ord.required_delivery_date || 'Standard'}
                    </p>
                    {isDelivered && ord.delivered_by_name && (
                      <p className="text-[11px] text-emerald-700 font-semibold mt-1">
                        Delivered by: {ord.delivered_by_name}
                      </p>
                    )}
                  </div>

                  {/* Ordered Items with Thumbnails */}
                  <div className="pt-2 border-t border-slate-100 space-y-2">
                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      Ordered Products ({ord.items?.length || 0})
                    </p>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {ord.items?.map((it: any) => (
                        <div key={it.id} className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-slate-50 border border-slate-200/80">
                          <div className="flex items-center gap-2 overflow-hidden">
                            <img
                              src={it.product_image || 'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?w=80&auto=format&fit=crop&q=60'}
                              alt={it.product_name}
                              className="w-8 h-8 rounded-md object-cover bg-white border border-slate-200 shrink-0 cursor-pointer hover:scale-105 transition-transform"
                              onClick={() => setZoomImage(it.product_image || 'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?w=800&auto=format&fit=crop&q=80')}
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?w=80&auto=format&fit=crop&q=60';
                              }}
                            />
                            <div className="overflow-hidden">
                              <p className="text-xs font-semibold text-slate-800 truncate" title={it.product_name}>
                                {it.product_name}
                              </p>
                              <p className="text-[10px] text-slate-500 font-mono"> {it.unit}</p>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="font-mono font-bold text-xs text-slate-900">{it.quantity}</span>
                            <span className={`block text-[9px] font-semibold ${it.item_availability === 'NOT_AVAILABLE' ? 'text-rose-600' : 'text-emerald-700'}`}>
                              {it.item_availability === 'NOT_AVAILABLE' ? 'Unavailable' : 'Available'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setSelectedOrder(ord)}
                    className="p-1.5 text-slate-500 hover:text-slate-800 transition"
                    title="View Full Details"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handlePrintSlip(ord)}
                    className="p-1.5 text-amber-600 hover:text-amber-800 transition"
                    title="Print Packing Slip"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handlePrintSlip(ord)}
                    className="p-1.5 text-indigo-600 hover:text-indigo-800 transition"
                    title="Download Packing Slip PDF"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* PACKING ORDER DETAIL MODAL */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                  <PackageCheck className="w-5 h-5 text-amber-500" />
                  Packing Slip & Verification - {selectedOrder.order_number}
                </h3>
                <p className="text-xs text-slate-500">
                  Client: {selectedOrder.vendor_name} • Sales Rep: {selectedOrder.sales_person_name}
                </p>
              </div>
              <button onClick={() => setSelectedOrder(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            {/* Order Details & Logistics Info */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs grid grid-cols-2 gap-3">
              <div>
                <span className="text-slate-400">Required Delivery Date:</span>
                <p className="font-bold text-slate-800">{selectedOrder.required_delivery_date || 'Standard'}</p>
              </div>
              <div>
                <span className="text-slate-400">Packing Status:</span>
                <p className="font-bold text-indigo-700 uppercase">{selectedOrder.packing_status}</p>
              </div>
              <div className="col-span-2">
                <span className="text-slate-400">Delivery Destination:</span>
                <p className="font-medium text-slate-800">{selectedOrder.delivery_address || 'Same as client address'}</p>
              </div>
              {selectedOrder.special_instructions && (
                <div className="col-span-2">
                  <span className="text-slate-400">Special Handling Instructions:</span>
                  <p className="text-amber-800 font-semibold">{selectedOrder.special_instructions}</p>
                </div>
              )}
            </div>

            {/* Product Table with Images & Availability */}
            <div className="space-y-2">
              <h4 className="font-bold text-xs text-slate-700 uppercase tracking-wider">
                Finished Products to Prepare & Pack ({selectedOrder.items?.length || 0})
              </h4>

              <div className="space-y-3">
                {selectedOrder.items?.map((it: any) => (
                  <div key={it.id} className="p-3 bg-white rounded-xl border border-slate-900 shadow-2xs flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={it.product_image || 'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?w=80&auto=format&fit=crop&q=60'}
                        alt={it.product_name}
                        className="w-12 h-12 object-cover rounded-lg border border-slate-200 bg-slate-100 cursor-pointer hover:scale-105 transition-transform shrink-0"
                        onClick={() => setZoomImage(it.product_image || 'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?w=800&auto=format&fit=crop&q=80')}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?w=80&auto=format&fit=crop&q=60';
                        }}
                      />
                      <div>
                        <p className="font-bold text-slate-900 text-xs">{it.product_name}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500 font-mono">
                          {/* <span>SKU: {it.sku}</span> */}
                          <span>•</span>
                          <span>Brand: {it.brand_name}</span>
                          {it.item_colour && (
                            <span className="px-1.5 py-0.2 bg-amber-50 text-amber-900 text-[9px] rounded font-semibold border border-amber-200">
                              {it.item_colour}
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-bold text-slate-800 mt-1">
                          Ordered Quantity: <span className="text-amber-600 font-mono">{it.quantity} </span>
                          Unit: <span className="text-amber-600 font-mono">{it.unit} </span>



                        </p>
                      </div>
                    </div>

                    {/* Availability toggle buttons */}
                    {/* <div className="flex flex-col sm:flex-row items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handlePackingAction(selectedOrder.id, 'ITEM_AVAILABILITY', { item_id: it.id, availability: 'AVAILABLE' })}
                        className={`px-2.5 py-1 rounded-md text-xs font-bold transition flex items-center gap-1 ${
                          it.item_availability !== 'NOT_AVAILABLE'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        <Check className="w-3 h-3" />
                        <span>Item Ready</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handlePackingAction(selectedOrder.id, 'ITEM_AVAILABILITY', { item_id: it.id, availability: 'NOT_AVAILABLE' })}
                        className={`px-2.5 py-1 rounded-md text-xs font-bold transition flex items-center gap-1 ${
                          it.item_availability === 'NOT_AVAILABLE'
                            ? 'bg-rose-100 text-rose-800 border border-rose-300'
                            : 'bg-slate-100 text-slate-600 hover:bg-rose-50 hover:text-rose-700'
                        }`}
                      >
                        <X className="w-3 h-3" />
                        <span>Not Available</span>
                      </button>
                    </div> */}
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-4 border-t gap-3">
              {selectedOrder.order_status !== 'DELIVERED' ? (
                <button
                  type="button"
                  onClick={() => setHoldModalOpen(true)}
                  className="px-3.5 py-2 text-rose-700 bg-rose-50 hover:bg-rose-100 font-bold text-xs rounded-xl border border-rose-200 flex items-center gap-1.5"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Mark Order On Hold</span>
                </button>
              ) : (
                <div className="flex items-center gap-2 text-xs text-emerald-700 font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Completed Delivery</span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Close
                </button>

                {selectedOrder.order_status !== 'DELIVERED' && selectedOrder.packing_status === 'PENDING_PACKING' && (
                  <button
                    type="button"
                    onClick={() => handlePackingAction(selectedOrder.id, 'START_PACKING')}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition"
                  >
                    Start Packing
                  </button>
                )}

                {selectedOrder.order_status !== 'DELIVERED' && selectedOrder.packing_status === 'PACKING_IN_PROGRESS' && (
                  <button
                    type="button"
                    onClick={() => handlePackingAction(selectedOrder.id, 'PACKING_COMPLETED')}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition"
                  >
                    Packing Completed
                  </button>
                )}

                {selectedOrder.order_status !== 'DELIVERED' && selectedOrder.packing_status === 'PACKED' && (
                  <button
                    type="button"
                    onClick={() => setOrderToDeliver(selectedOrder)}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wide rounded-xl shadow-xs transition flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>DELIVER</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <DeliverModal order={orderToDeliver} onClose={() => setOrderToDeliver(null)} onDone={onDeliverDone} />

      {/* MARK ON HOLD MODAL */}
      {holdModalOpen && selectedOrder && (
        <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                Place Order #{selectedOrder.order_number} On Hold
              </h3>
              <button onClick={() => setHoldModalOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            <p className="text-xs text-slate-600">
              Marking an order On Hold prevents it from advancing to dispatch. Admin will receive an alert notification.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Reason for Hold *</label>
              <textarea
                rows={3}
                required
                value={holdReason}
                onChange={(e) => setHoldReason(e.target.value)}
                placeholder="Specify which lubricant items or pack sizes are missing..."
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t">
              <button
                type="button"
                onClick={() => setHoldModalOpen(false)}
                className="px-3.5 py-2 text-xs text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handlePackingAction(selectedOrder.id, 'MARK_ON_HOLD', { notes: holdReason })}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl"
              >
                Confirm On Hold
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ZOOM IMAGE MODAL */}
      {zoomImage && (
        <div
          onClick={() => setZoomImage(null)}
          className="fixed inset-0 z-70 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
        >
          <div className="relative max-w-2xl max-h-[85vh] bg-white rounded-2xl overflow-hidden p-2 shadow-2xl" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setZoomImage(null)}
              className="absolute top-4 right-4 z-10 p-2 bg-black/60 hover:bg-black/80 text-white rounded-full transition"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={zoomImage}
              alt="Product Zoom"
              className="w-full h-auto max-h-[80vh] object-contain rounded-xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};
