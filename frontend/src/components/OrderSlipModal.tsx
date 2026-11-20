import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { Printer, Download, X, Building2, Loader2 } from 'lucide-react';
import { Order, OrderItem } from '../types.js';
import type { SlipAssets } from './OrderSlipPdf.js';

interface OrderSlipModalProps {
  order: Order;
  items: OrderItem[];
  isOpen: boolean;
  onClose: () => void;
}

const PdfPreview = React.lazy(() =>
  import('./OrderSlipPdf.js').then((m) => ({ default: m.OrderSlipPreview }))
);

const FALLBACK_IMG = 'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?w=120&auto=format&fit=crop&q=80';

/** react-pdf only reads JPG/PNG and fails on blocked remote images -> draw to canvas, return PNG data URL (or null). */
function toPngDataUrl(src?: string | null, maxSize = 200): Promise<string | null> {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * scale));
        c.height = Math.max(1, Math.round(img.naturalHeight * scale));
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export const OrderSlipModal: React.FC<OrderSlipModalProps> = ({ order, items, isOpen, onClose }) => {
  const [assets, setAssets] = useState<SlipAssets | null>(null);
  const [busy, setBusy] = useState<'download' | 'print' | null>(null);

  // Load images once when opened
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setAssets(null);
    (async () => {
      const logo = await toPngDataUrl(order.billing_company_logo, 240);
      const entries = await Promise.all(
        items.map(async (it) => {
          const data = (await toPngDataUrl(it.product_image)) || (await toPngDataUrl(FALLBACK_IMG));
          return [it.id, data] as const;
        })
      );
      if (!cancelled) setAssets({ logo, items: Object.fromEntries(entries) });
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, order.id, items, order.billing_company_logo]);

  const previewProps = useMemo(() => (assets ? { order, items, assets } : null), [order, items, assets]);

  if (!isOpen) return null;

  const buildBlob = async () => {
    if (!previewProps) throw new Error('Assets not ready');
    const [{ pdf }, { OrderSlipPdf }] = await Promise.all([
      import('@react-pdf/renderer'),
      import('./OrderSlipPdf.js'),
    ]);
    return pdf(<OrderSlipPdf {...previewProps} />).toBlob();
  };

  const handleDownload = async () => {
    setBusy('download');
    try {
      const blob = await buildBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Order-Slip-${order.order_number}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(null);
    }
  };

  const handlePrint = async () => {
    setBusy('print');
    try {
      const blob = await buildBlob();
      const url = URL.createObjectURL(blob);
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
      iframe.src = url;
      iframe.onload = () => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          iframe.remove();
          URL.revokeObjectURL(url);
        }, 60000);
      };
      document.body.appendChild(iframe);
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(null);
    }
  };

  const ready = !!previewProps;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="relative bg-white rounded-xl shadow-2xl max-w-5xl w-full overflow-hidden flex flex-col h-[92vh]">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200 bg-slate-900 text-white shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <Building2 className="w-5 h-5 text-amber-400 shrink-0" />
            <div className="min-w-0">
              <h3 className="font-semibold text-base tracking-wide truncate">Official Order Slip & Confirmation</h3>
              <p className="text-xs text-slate-300 truncate">Generated for Order #{order.order_number}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handlePrint}
              disabled={!ready || busy !== null}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-medium text-xs rounded-md transition disabled:opacity-50"
            >
              {busy === 'print' ? <Loader2 className="w-4 h-4 motion-safe:animate-spin" /> : <Printer className="w-4 h-4" />}
              <span className="hidden sm:inline">Print</span>
            </button>
            <button
              onClick={handleDownload}
              disabled={!ready || busy !== null}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-medium text-xs rounded-md shadow transition disabled:opacity-50"
            >
              {busy === 'download' ? <Loader2 className="w-4 h-4 motion-safe:animate-spin" /> : <Download className="w-4 h-4" />}
              Download PDF
            </button>
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg transition" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Preview */}
        <div className="flex-1 min-h-0 bg-slate-200">
          {!ready ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-500 text-xs">
              <Loader2 className="w-6 h-6 motion-safe:animate-spin text-amber-500" />
              Preparing order slip...
            </div>
          ) : (
            <>
              {/* Desktop: inline PDF preview */}
              <div className="hidden sm:block h-full">
                <Suspense
                  fallback={
                    <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                      <Loader2 className="w-6 h-6 motion-safe:animate-spin text-amber-500" />
                    </div>
                  }
                >
                  <PdfPreview {...previewProps!} />
                </Suspense>
              </div>
              {/* Mobile: inline PDF iframes are unreliable */}
              <div className="sm:hidden h-full flex flex-col items-center justify-center gap-3 p-6 text-center text-slate-600 text-xs">
                <p>Order slip is ready. Preview isn't available on small screens.</p>
                <button
                  onClick={handleDownload}
                  disabled={busy !== null}
                  className="px-4 py-2 bg-amber-500 text-slate-950 font-semibold rounded-lg disabled:opacity-50"
                >
                  Download PDF
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};