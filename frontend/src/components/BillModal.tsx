import React, { useState, useEffect, useRef } from 'react';
import {
  Printer, Download, X, Building2, CheckCircle2, AlertCircle,
  CreditCard, Droplets, Calendar, FileText, User, Store, ShieldCheck
} from 'lucide-react';
import { Bill } from '../types.js';
import { apiFetch } from '../lib/api.js';
import { getToken } from '../lib/session.js';
import { createPortal } from 'react-dom';
interface BillModalProps {
  billId: number | string | null;
  isOpen: boolean;
  onClose: () => void;
  autoPrint?: boolean;
}

export const BillModal: React.FC<BillModalProps> = ({ billId, isOpen, onClose, autoPrint = false }) => {
  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const [shipmentId, setShipmentId] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState<number>(0);
  const [creditBusy, setCreditBusy] = useState<boolean>(false);

  useEffect(() => {
    setShipmentId(null);
  }, [billId, isOpen]);

  useEffect(() => {
    if (!isOpen || !billId) {
      setBill(null);
      return;
    }

    const fetchBill = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = getToken();
        const res = await apiFetch(`/api/bills/${billId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok && data.bill) {
          setBill(data.bill);
          if (autoPrint) {
            setTimeout(() => {
              window.print();
            }, 400);
          }
        } else {
          setError(data.error || 'Failed to load bill details');
        }
      } catch (err: any) {
        setError(err.message || 'Error loading bill data');
      } finally {
        setLoading(false);
      }
    };

    fetchBill();
  }, [billId, isOpen, autoPrint, reloadKey]);
  if (!isOpen) return null;
  // Use the party's saved credit (extra / advance cash) against this bill's pending balance
  const handleAdjustCredit = async () => {
    const credit = Number((bill as any)?.party_credit_balance || 0);
    const pending = Number((bill as any)?.balance_payment || 0);
    const use = Math.min(credit, pending);
    if (use <= 0) return;
    if (!window.confirm(`Adjust ₹${use.toLocaleString('en-IN')} from this party's saved credit against the pending bill balance?`)) return;
    setCreditBusy(true);
    try {
      const token = getToken();
      const res = await apiFetch(`/api/orders/${billId}/adjust-credit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const d = await res.json();
      if (!res.ok) alert(d.error || 'Could not adjust credit');
      setReloadKey((k) => k + 1);
    } finally {
      setCreditBusy(false);
    }
  };

  const handlePrint = () => {
    const oldTitle = document.title;
    if (shownInvoiceNo) document.title = shownInvoiceNo;
    const restore = () => {
      document.title = oldTitle;
      window.removeEventListener('afterprint', restore);
    };
    window.addEventListener('afterprint', restore);
    window.print();
  };

  const b: any = bill;
  const shipments: any[] = b?.shipments || [];
  const shipment = shipments.find((x) => x.id === shipmentId) || null;
  const shownInvoiceNo: string | undefined = shipment ? shipment.invoice_number : bill?.invoice_number;
  const shownItems: any[] = shipment ? shipment.items.map((it: any, i: number) => ({ ...it, id: it.order_item_id ?? i })) : (bill?.items || []);

  const isNonGst = bill?.tax_type === 'NON_GST';
  const billAmount = shipment ? Number(shipment.bill_amount || 0) : bill ? Number(bill.bill_amount || 0) : 0;
  const taxableAmount = isNonGst ? billAmount : Math.round((billAmount / 1.18) * 100) / 100;
  const gstAmount = isNonGst ? 0 : Math.round((billAmount - taxableAmount) * 100) / 100;
  // Same state (Delhi) -> CGST + SGST, other state -> IGST 18%
  const isIgst = !isNonGst && (shipment ? shipment.tax_regime : b?.tax_regime) === 'IGST';
  const igstAmount = isIgst ? gstAmount : 0;
  const cgstAmount = isNonGst || isIgst ? 0 : Math.round((gstAmount / 2) * 100) / 100;
  const sgstAmount = isNonGst || isIgst ? 0 : Math.round((gstAmount - cgstAmount) * 100) / 100;
  const receivedAmount = shipment ? Number(shipment.paid_amount || 0) : bill ? Number(bill.received_amount || 0) : 0;
  const balancePayment = shipment
    ? Math.max(0, Number(shipment.balance_amount || 0))
    : bill ? Math.max(0, Number(bill.balance_payment || (billAmount - receivedAmount))) : 0;

  return createPortal(
    <div
      id="bill-print-root"
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 print:p-0 print:bg-white print:static print:overflow-visible"
    >
      <style>{`
      @media print {
        @page { size: A4; margin: 10mm; }
#bill-print-root,
#bill-print-root * {
  border-color: #000 !important;
}
        /* Bill ke alawa poora page hide */
        body > *:not(#bill-print-root) { display: none !important; }

        html, body { background: #fff !important; height: auto !important; overflow: visible !important; }

        #bill-print-root {
          position: static !important;
          display: block !important;
          background: #fff !important;
          padding: 0 !important;
          overflow: visible !important;
          backdrop-filter: none !important;
        }
        #bill-print-root * {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        #bill-print-root > div {
          max-height: none !important;
          max-width: 100% !important;
          box-shadow: none !important;
          border-radius: 0 !important;
          overflow: visible !important;
        }

        /* Saare table borders black */
        #bill-print-root table { border-collapse: collapse !important; width: 100%; }
        #bill-print-root table th,
        #bill-print-root table td { border: 1px solid #000 !important; }
        #bill-print-root .bill-table-wrap { border: 1px solid #000 !important; border-radius: 0 !important; }

        tr { page-break-inside: avoid; }
      }
    `}</style>
      <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 print:p-0 print:bg-white print:static print:overflow-visible">
        <div className="relative bg-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden flex flex-col max-h-[94vh] print:max-h-none print:shadow-none print:w-full print:rounded-none">

          {/* Top Control Bar (Hidden when printing) */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-900 text-white shrink-0 print:hidden">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/30">
                <FileText className="w-4 h-4" />
              </div>
              <div className="truncate">
                <h3 className="font-bold text-sm tracking-wide flex items-center gap-2">
                  <span>{isNonGst ? 'Commercial Bill' : 'Tax Invoice'}</span>
                  {bill && (
                    <span className="text-xs text-amber-400 font-mono px-2 py-0.5 bg-slate-800 rounded">
                      {shownInvoiceNo}
                    </span>
                  )}
                </h3>
                <p className="text-[11px] text-slate-400">Order Ref: #{bill?.order_number || billId}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-lg shadow transition cursor-pointer"
                title="Print bill or save as PDF"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Bill</span>
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs rounded-lg transition cursor-pointer"
                title="Download or save as PDF"
              >
                <Download className="w-3.5 h-3.5 text-slate-300" />
                <span>Download PDF</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Modal Body */}
          <div className="overflow-y-auto flex-1 p-4 sm:p-8 print:p-0 print:overflow-visible text-slate-900 bg-white">
            {loading ? (
              <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3">
                <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-xs font-semibold">Generating bill statement...</p>
              </div>
            ) : error || !bill ? (
              <div className="py-16 text-center text-rose-600 space-y-3">
                <AlertCircle className="w-8 h-8 mx-auto text-rose-500" />
                <p className="text-sm font-bold">{error || 'Bill could not be found'}</p>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg"
                >
                  Close
                </button>
              </div>
            ) : (
              <div ref={printRef} className="space-y-6 max-w-3xl mx-auto text-slate-800 text-xs">

                {/* Document Header */}
                <div className="border-b-2 border-slate-900 pb-5">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    {/* Company Info */}
                    <div className="space-y-1 max-w-md">
                      <div className="flex items-center gap-2">
                        {bill.company_logo ? (
                          <img src={bill.company_logo} alt="" className="h-10 w-auto max-w-[96px] object-contain" />
                        ) : (
                          <div className="w-7 h-7 rounded bg-amber-500 text-slate-950 flex items-center justify-center font-black">
                            <Droplets className="w-4 h-4 fill-slate-950" />
                          </div>
                        )}
                        <h2 className="text-lg font-black tracking-wide text-slate-950 uppercase">
                          {bill.company_name || 'Auto pickup Lubricants Pvt Ltd'}
                        </h2>
                      </div>
                      <p className="text-slate-600 text-[11px] leading-relaxed">
                        {bill.company_address || 'Industrial Estate, Phase II, Highway Road'}, {bill.company_city} {bill.company_state} {bill.company_pincode}
                      </p>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-slate-600 pt-1">
                        {bill.company_gstin && <span><strong>GSTIN:</strong> {bill.company_gstin}</span>}
                        {bill.company_pan && <span><strong>PAN:</strong> {bill.company_pan}</span>}
                        {bill.company_mobile && <span><strong>Mob:</strong> {bill.company_mobile}</span>}
                        {bill.company_email && <span><strong>Email:</strong> {bill.company_email}</span>}
                      </div>
                    </div>

                    {/* Invoice Title & Metadata */}
                    <div className="sm:text-right space-y-1.5 shrink-0">
                      <div className="inline-block px-3 py-1 bg-slate-900 text-white rounded font-bold uppercase tracking-wider text-xs">
                        {isNonGst ? 'COMMERCIAL BILL' : 'TAX INVOICE'}
                      </div>
                      <div className="space-y-0.5 text-[11px]">
                        <p><span className="text-slate-500">Invoice No:</span> <strong className="text-slate-950 font-mono text-sm">{shownInvoiceNo}</strong></p>
                        <p><span className="text-slate-500">Date:</span> <strong>{new Date(bill.invoice_date || bill.order_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong></p>
                        <p><span className="text-slate-500">Order ID:</span> <strong>#{bill.order_number}</strong></p>
                        <p><span className="text-slate-500">Tax Type:</span> <strong className={isNonGst ? 'text-amber-700' : 'text-emerald-700'}>{isNonGst ? 'Non-GST' : 'GST (18% Inclusive)'}</strong></p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bill To & Representative Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-900">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <Store className="w-3.5 h-3.5 text-slate-600" />
                      Bill To / Party Details
                    </p>
                    <p className="font-bold text-slate-900 text-sm">{bill.party_name}</p>
                    {bill.party_contact && <p className="text-slate-600 text-[11px]">Attn: {bill.party_contact}</p>}
                    {bill.party_address && <p className="text-slate-600 text-[11px]">{bill.party_address}</p>}
                    <p className="text-slate-600 text-[11px]">{bill.party_city}, {bill.party_state}</p>
                    <div className="pt-1 text-[11px] space-y-0.5">
                      {bill.party_gstin && <p><span className="text-slate-500">GSTIN:</span> <strong className="font-mono">{bill.party_gstin}</strong></p>}
                      {bill.party_aadhar && <p><span className="text-slate-500">Aadhar:</span> <strong className="font-mono">{bill.party_aadhar}</strong></p>}
                      {bill.party_mobile && <p><span className="text-slate-500">Contact:</span> {bill.party_mobile}</p>}
                    </div>
                  </div>

                  <div className="space-y-1 sm:border-l sm:border-slate-900 sm:pl-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-slate-600" />
                      Sales & Payment Terms
                    </p>
                    <p className="text-[11px]"><span className="text-slate-500">Assigned Sales Person:</span> <strong className="text-slate-900">{bill.sales_person_name}</strong></p>
                    {bill.sales_person_mobile && <p className="text-[11px]"><span className="text-slate-500">Mobile:</span> {bill.sales_person_mobile}</p>}
                    <p className="text-[11px]"><span className="text-slate-500">Payment Terms:</span> <strong>{bill.payment_terms || 'Advance'}</strong></p>
                    <div className="pt-2 flex items-center gap-2">
                      <span className="text-[10px] font-semibold text-slate-500">Payment Status:</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${bill.payment_status === 'PAID'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : bill.payment_status === 'PARTIAL'
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : 'bg-rose-100 text-rose-800 border border-rose-300'
                        }`}>
                        {bill.payment_status}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Shipment invoices ( partial deliveries ) */}
                {shipments.length > 0 && (
                  <div className="print:hidden p-3 rounded-xl border border-slate-300 bg-slate-50 space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Shipment Invoices</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setShipmentId(null)}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border ${shipmentId === null ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300'}`}
                      >
                        Whole Order
                      </button>
                      {shipments.map((sh) => (
                        <button
                          key={sh.id}
                          type="button"
                          onClick={() => setShipmentId(sh.id)}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border ${shipmentId === sh.id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-700 border-slate-300'}`}
                        >
                          {sh.invoice_number} · {sh.delivered_quantity} units{sh.is_partial ? ' (partial)' : ''}
                        </button>
                      ))}
                    </div>
                    {Number(b.advance_for_pending) > 0 && (
                      <p className="text-[11px] text-indigo-700 font-semibold">
                        ₹{Number(b.advance_for_pending).toLocaleString('en-IN')} advance already received will cover the remaining units in the next shipment.
                      </p>
                    )}
                    {(b.pending_items || []).length > 0 && (
                      <p className="text-[11px] text-amber-700">
                        Still to ship: {(b.pending_items as any[]).map((p) => `${p.quantity} × ${p.product_name}`).join(', ')}
                      </p>
                    )}
                  </div>
                )}
                {shipment && (
                  <p className="text-[11px] font-semibold text-slate-700">
                    Invoice covers only the {shipment.delivered_quantity} unit(s) shipped in shipment #{shipment.shipment_no}.
                  </p>
                )}

                {/* Items Table */}
                <div className="border border-slate-900 rounded-xl overflow-hidden bill-table-wrap">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 text-[11px] font-bold border-b border-slate-900">
                        <th className="py-2.5 px-3 w-10 text-center">#</th>
                        <th className="py-2.5 px-3">Product Description & Grade</th>
                        <th className="py-2.5 px-3 text-center">Packaging</th>
                        <th className="py-2.5 px-3 text-right">Qty</th>
                        <th className="py-2.5 px-3 text-right">Selling Rate (₹)</th>
                        <th className="py-2.5 px-3 text-right">Total Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-[11px]">
                      {shownItems.length > 0 ? (
                        shownItems.map((it: any, idx: number) => (
                          <tr key={it.id || idx} className="hover:bg-slate-50/50">
                            <td className="py-2.5 px-3 text-center text-slate-400">{idx + 1}</td>
                            <td className="py-2.5 px-3 font-medium text-slate-900">
                              <div>{it.product_name}</div>

                            </td>
                            <td className="py-2.5 px-3 text-center text-slate-600">{it.unit || 'Ltr'}</td>
                            <td className="py-2.5 px-3 text-right font-semibold text-slate-900">{it.quantity}</td>
                            <td className="py-2.5 px-3 text-right text-slate-700">₹{(Number(it.rate || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="py-2.5 px-3 text-right font-bold text-slate-900">₹{(Number(it.line_amount || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="py-4 text-center text-slate-400">
                            Total commercial order value: ₹{billAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Financial Calculation & Breakdown */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">

                  {/* Left: Existing Payments & Ledger History */}
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-900 space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-slate-700" />
                      Verified Payment Receipts (Payments & Ledger)
                    </p>
                    {bill.payments && bill.payments.length > 0 ? (
                      <div className="space-y-1.5 pt-1">
                        {bill.payments.map((p, pIdx) => (
                          <div key={p.id || pIdx} className="flex items-center justify-between text-[11px] bg-white p-2 rounded-lg border border-slate-900">
                            <div>
                              <span className="font-semibold text-slate-800">{p.payment_mode}</span>
                              {p.reference_number && <span className="text-[10px] text-slate-500 font-mono ml-1.5">Ref: {p.reference_number}</span>}
                              <div className="text-[10px] text-slate-400">{new Date(p.payment_date).toLocaleDateString('en-IN')}</div>
                            </div>
                            <div className="text-right">
                              <span className="font-bold text-emerald-700">+ ₹{Number(p.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                              <div className="text-[9px] text-emerald-600 font-semibold flex items-center justify-end gap-0.5">
                                <CheckCircle2 className="w-2.5 h-2.5" /> Verified
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400 italic py-1">
                        No verified payment entries recorded yet in Payments & Ledger.
                      </p>
                    )}
                  </div>

                  {/* Right: Tax Calculation & Final Bill Amount */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-900 space-y-2 text-xs">
                    {isNonGst ? (
                      /* Non-GST Bill: Normal Bill Amount with NO GST calculation */
                      <div className="space-y-2">
                        <div className="flex justify-between text-slate-600 text-[11px]">
                          <span>Bill Amount (Non-GST):</span>
                          <span className="font-semibold">₹{billAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between text-slate-500 text-[10px] italic">
                          <span>Applicable GST:</span>
                          <span>₹0.00 (Non-GST Commercial Order)</span>
                        </div>
                        <div className="border-t border-slate-300 pt-2 flex justify-between text-sm font-black text-slate-950">
                          <span>Final Bill Amount:</span>
                          <span>₹{billAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    ) : (
                      /* GST Bill: Selling Rate is GST Inclusive. Taxable + 18% GST = Final Bill Amount */
                      <div className="space-y-2">
                        <div className="flex justify-between text-slate-600 text-[11px]">
                          <span>Taxable Amount (Excl. Tax):</span>
                          <span className="font-semibold">₹{taxableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                        {isIgst ? (
                          <div className="flex justify-between text-slate-600 text-[11px]">
                            <span>IGST (18%) - Interstate:</span>
                            <span>₹{igstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                          </div>
                        ) : (
                          <>
                            <div className="flex justify-between text-slate-600 text-[11px]">
                              <span>CGST (9%):</span>
                              <span>₹{cgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between text-slate-600 text-[11px]">
                              <span>SGST (9%):</span>
                              <span>₹{sgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                            </div>
                          </>
                        )}
                        <div className="flex justify-between text-slate-700 text-[11px] font-semibold">
                          <span>Total 18% GST (Inclusive):</span>
                          <span>₹{gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="border-t border-slate-300 pt-2 flex justify-between text-sm font-black text-slate-950">
                          <span>Final Bill Amount:</span>
                          <span>₹{billAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 italic">
                          *Selling Rate is already GST inclusive. GST is not added on top.
                        </p>
                      </div>
                    )}

                    {/* Summary of Received & Balance */}
                    <div className="border-t border-slate-900 pt-2 space-y-1 text-[11px]">
                      <div className="flex justify-between text-emerald-700 font-semibold">
                        <span>Total Verified Received:</span>
                        <span>₹{receivedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between text-rose-700 font-bold">
                        <span>Balance Payment Due:</span>
                        <span>₹{balancePayment.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                      {Number(b?.balance_payment) > 0 && Number(b?.party_credit_balance) > 0 && (
                        <button
                          type="button"
                          onClick={handleAdjustCredit}
                          disabled={creditBusy}
                          className="print:hidden w-full mt-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-[11px] font-bold rounded-lg"
                        >
                          {creditBusy
                            ? 'Adjusting...'
                            : `Adjust Party Credit ₹${Math.min(Number(b.party_credit_balance), Number(b.balance_payment)).toLocaleString('en-IN')} against this bill`}
                        </button>
                      )}
                      {!shipment && Number(b?.excess_credit) > 0 && (
                        <div className="flex justify-between text-indigo-700 font-semibold">
                          <span>Extra paid (saved as party credit):</span>
                          <span>₹{Number(b.excess_credit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                      )}
                    </div>
                  </div>

                </div>

                {/* Bank Details & Terms */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[11px] pt-2 border-t border-slate-900">
                  <div className="space-y-1">
                    <p className="font-bold text-slate-700 uppercase text-[10px] tracking-wide">Bank Details for RTGS / NEFT / IMPS</p>
                    <p><span className="text-slate-500">Bank Name:</span> <strong>{bill.company_bank || 'HDFC Bank Ltd'}</strong></p>
                    <p><span className="text-slate-500">Account No:</span> <strong className="font-mono">{bill.company_account || '50200084729104'}</strong></p>
                    <p><span className="text-slate-500">IFSC Code:</span> <strong className="font-mono">{bill.company_ifsc || 'HDFC0001248'}</strong></p>
                    <p><span className="text-slate-500">Branch:</span> {bill.company_branch || 'Industrial Finance Branch'}</p>
                  </div>

                  <div className="sm:text-right flex flex-col justify-between">
                    <p className="text-[10px] text-slate-500 italic">
                      This is a computer-generated invoice from Auto pickup Lubricant ERP.
                    </p>
                    <div className="pt-8">
                      <div className="inline-block border-t border-slate-400 pt-1 text-center min-w-[160px]">
                        <p className="font-bold text-slate-800 text-[11px]">For {bill.company_name || 'Auto pickup Lubricants Pvt Ltd'}</p>
                        <p className="text-[10px] text-slate-500">Authorized Signatory</p>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            )}
          </div>

          {/* Footer info (Hidden when printing) */}
          <div className="px-5 py-3 border-t border-slate-900 bg-slate-50 flex items-center justify-between text-xs text-slate-500 shrink-0 print:hidden">
            <span>Official Commercial Bill Record • Auto pickup</span>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold rounded-lg transition cursor-pointer"
            >
              Close
            </button>
          </div>

        </div>
      </div>
    </div>,
    document.body
  );
};
