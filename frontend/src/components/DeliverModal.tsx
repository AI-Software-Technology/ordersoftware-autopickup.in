import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, X, PackageCheck, Package } from 'lucide-react';
import { apiFetch } from '../lib/api.js';

export interface DeliverOrder {
  id: number;
  order_number: string;
  vendor_name?: string;
  items?: Array<{
    id: number;
    product_name: string;
    unit?: string;
    quantity: number;
    delivered_quantity?: number;
    rate?: number;
  }>;
}

interface Props {
  order: DeliverOrder | null;
  onClose: () => void;
  onDone: (result: any) => void | Promise<void>;
}

// Asks: full delivery or partial? Partial -> how many units of each item went out.
export const DeliverModal: React.FC<Props> = ({ order, onClose, onDone }) => {
  const [mode, setMode] = useState<'FULL' | 'PARTIAL'>('FULL');
  const [qty, setQty] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const rows = useMemo(
    () =>
      (order?.items || []).map((it) => ({
        ...it,
        remaining: Math.max(0, it.quantity - (it.delivered_quantity || 0)),
      })).filter((it) => it.remaining > 0),
    [order],
  );

  useEffect(() => {
    setMode('FULL');
    setError('');
    setQty(Object.fromEntries(rows.map((r) => [r.id, String(r.remaining)])));
  }, [order?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!order) return null;

  const lines = rows.map((r) => ({ ...r, send: mode === 'FULL' ? r.remaining : Number(qty[r.id]) || 0 }));
  const shipUnits = lines.reduce((a, l) => a + l.send, 0);
  const pendingUnits = lines.reduce((a, l) => a + (l.remaining - l.send), 0);
  const shipValue = lines.reduce((a, l) => a + l.send * (l.rate || 0), 0);
  const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

  const submit = async () => {
    setError('');
    if (mode === 'PARTIAL') {
      for (const l of lines) {
        if (l.send < 0 || l.send > l.remaining) {
          setError(`${l.product_name}: enter between 0 and ${l.remaining}`);
          return;
        }
      }
      if (shipUnits <= 0) {
        setError('Enter at least 1 unit to deliver');
        return;
      }
    }
    setLoading(true);
    try {
      const res = await apiFetch(`/api/orders/${order.id}/deliver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          items: mode === 'PARTIAL' ? lines.filter((l) => l.send > 0).map((l) => ({ item_id: l.id, quantity: l.send })) : undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) await onDone(data);
      else setError(data.error || 'Failed to deliver order');
    } catch {
      setError('Network error while delivering order');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[92vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            Deliver Order #{order.order_number}
          </h3>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400 hover:text-slate-600" /></button>
        </div>

        {order.vendor_name && (
          <p className="text-xs text-slate-600">Customer: <strong className="text-slate-900">{order.vendor_name}</strong></p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode('FULL')}
            className={`p-3 rounded-xl border text-left text-xs transition ${mode === 'FULL' ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200' : 'border-slate-200 hover:border-slate-300'}`}
          >
            <PackageCheck className="w-4 h-4 text-emerald-600 mb-1" />
            <p className="font-bold text-slate-900">Full Dispatch</p>
            <p className="text-slate-500">All remaining units go now</p>
          </button>
          <button
            type="button"
            onClick={() => setMode('PARTIAL')}
            className={`p-3 rounded-xl border text-left text-xs transition ${mode === 'PARTIAL' ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-200' : 'border-slate-200 hover:border-slate-300'}`}
          >
            <Package className="w-4 h-4 text-amber-600 mb-1" />
            <p className="font-bold text-slate-900">Partial Dispatch</p>
            <p className="text-slate-500">Only some units go now</p>
          </button>
        </div>

        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600 font-semibold">
                <th className="py-2 px-3 text-left">Item</th>
                <th className="py-2 px-3 text-right">Remaining</th>
                <th className="py-2 px-3 text-right">Dispatch now</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 px-3 font-medium text-slate-800">{r.product_name}</td>
                  <td className="py-2 px-3 text-right font-mono">{r.remaining}</td>
                  <td className="py-2 px-3 text-right">
                    {mode === 'FULL' ? (
                      <span className="font-mono font-bold">{r.remaining}</span>
                    ) : (
                      <input
                        type="number"
                        min={0}
                        max={r.remaining}
                        value={qty[r.id] ?? ''}
                        onChange={(e) => setQty({ ...qty, [r.id]: e.target.value })}
                        className="w-20 p-1.5 border border-slate-300 rounded-lg text-right font-mono font-bold"
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
          <p className="flex justify-between"><span className="text-slate-600">Units dispatched now</span><strong className="font-mono">{shipUnits}</strong></p>
          <p className="flex justify-between"><span className="text-slate-600">Invoice for this shipment</span><strong className="font-mono">₹{fmt(shipValue)}</strong></p>
          {mode === 'PARTIAL' && pendingUnits > 0 && (
            <p className="flex justify-between text-amber-700"><span>Units still pending (next shipment)</span><strong className="font-mono">{pendingUnits}</strong></p>
          )}
        </div>
        {mode === 'PARTIAL' && (
          <p className="text-[11px] text-slate-500">
            Invoice is made only for the units sent now. Any payment already received stays on the order and covers the next shipment.
          </p>
        )}

        {error && <p className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">{error}</p>}

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition">Cancel</button>
          <button
            type="button"
            onClick={submit}
            disabled={loading}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold text-xs rounded-xl transition"
          >
            {loading ? 'Processing...' : mode === 'FULL' || pendingUnits <= 0 ? 'Confirm Full Delivery' : 'Confirm Partial Delivery'}
          </button>
        </div>
      </div>
    </div>
  );
};
