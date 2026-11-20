import React, { useEffect, useState } from 'react';
import { IndianRupee, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Info } from 'lucide-react';

// ---------------------------------------------------------------------------
// Payment Summary ( Admin dashboard )
//
//   Total Sales  =  Delivered and paid  +  Paid in advance  +  Still to collect
//
// Everything on this card is explained in plain words, with the order-by-order
// proof for the "Paid in advance" number.
// ---------------------------------------------------------------------------

const inr = (n: number) =>
  '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

const PAGE_SIZE = 5;

interface Props {
  sales: any; // dashboard categories.sales
  pay: any; // dashboard categories.payments
  onNavigate?: (page: string) => void; // opens /orders/:id when an order row is clicked
}

export const MoneySummary: React.FC<Props> = ({ sales, pay, onNavigate }) => {
  const [showAdvance, setShowAdvance] = useState(false);
  const [showCredit, setShowCredit] = useState(false);
  const [page, setPage] = useState(1);

  const total = Number(sales?.totalSalesValue) || 0;
  const paid = Number(pay?.paidForOrders) || 0;
  const advance = Math.min(Number(pay?.advanceHeld) || 0, paid);
  const deliveredAndPaid = Math.max(0, paid - advance);
  const stillToCollect = Number(pay?.pendingAmount) || 0;
  const credit = Number(pay?.partyCredit) || 0;
  const waitingAmount = Number(pay?.unverifiedAmount) || 0;
  const waitingCount = Number(pay?.pendingVerification) || 0;
  const advanceList: any[] = pay?.advanceList || [];
  const creditList: any[] = pay?.creditList || [];

  // Pagination for the advance table
  const totalPages = Math.max(1, Math.ceil(advanceList.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageRows = advanceList.slice(pageStart, pageStart + PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [advanceList.length]);

  const openOrder = (o: any) => {
    const id = o.id ?? o.order_id;
    if (!id) {
      console.error("advanceList row me order id nahi hai", o);
      return;
    }
    onNavigate?.(`orders/${id}`);
  };

  const parts = [
    {
      key: 'done',
      label: 'Delivered and paid',
      value: deliveredAndPaid,
      bar: 'bg-emerald-500',
      text: 'text-emerald-700',
      hint: 'We sent the goods and the customer already paid for them.',
    },
    {
      key: 'adv',
      label: 'Paid in advance',
      value: advance,
      bar: 'bg-indigo-500',
      text: 'text-indigo-700',
      hint: `The customer already paid, but we have not sent these goods yet. (${pay?.advanceOrders || 0} orders)`,
    },
    {
      key: 'due',
      label: 'Still to collect',
      value: stillToCollect,
      bar: 'bg-rose-500',
      text: 'text-rose-700',
      hint: 'The customer has not paid this part yet.',
    },
  ];
  const sum = parts.reduce((a, p) => a + p.value, 0) || 1;

  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-5">
      {/* Title */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
          <IndianRupee className="w-3.5 h-3.5 text-emerald-600" />
          Payment Summary
        </h3>
        <span className="text-[10px] text-slate-400">Orders in the selected dates</span>
      </div>

      {/* Step 1: three big numbers */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
          <p className="text-[11px] font-semibold text-slate-500">Total Sales</p>
          <p className="text-2xl font-black text-slate-900 font-mono mt-1">{inr(total)}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">Value of all the orders</p>
        </div>
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
          <p className="text-[11px] font-semibold text-emerald-800">Payment Received</p>
          <p className="text-2xl font-black text-emerald-700 font-mono mt-1">{inr(paid)}</p>
          <p className="text-[10px] text-emerald-700 mt-0.5">Checked and approved by Accounts</p>
        </div>
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200">
          <p className="text-[11px] font-semibold text-rose-800">Pending </p>
          <p className="text-2xl font-black text-rose-700 font-mono mt-1">{inr(stillToCollect)}</p>
          <p className="text-[10px] text-rose-700 mt-0.5">Customers still have to pay this</p>
        </div>


        <div className="p-4 rounded-xl bg-violet-50 border border-violet-200">
          <p className="text-[11px] font-bold text-violet-800">ADVANCE</p>
          <p className="text-xl font-black text-violet-700 font-mono mt-1">{inr(credit)}</p>
          <p className="text-[11px] text-violet-700 mt-0.5">
            {pay?.partyCreditParties || 0} {Number(pay?.partyCreditParties) === 1 ? 'party paid' : 'parties paid'} more than
            their order. We keep the extra Payment safe in their name. It is not part of sales, and it can be used on
            their next order or bill.
          </p>
          {creditList.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowCredit((v) => !v)}
                className="mt-2 text-[11px] font-bold text-violet-700 underline"
              >
                {showCredit ? 'Hide parties' : 'Show which parties'}
              </button>
              {showCredit && (
                <ul className="mt-1.5 space-y-1">
                  {creditList.map((c) => (
                    <li key={c.id} className="flex justify-between text-[11px] text-violet-900">
                      <span className="truncate pr-2">{c.party_name}</span>
                      <span className="font-mono font-bold">{inr(c.credit)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
          <p className="text-[11px] font-bold text-amber-800">Waiting for Accounts approval</p>
          <p className="text-xl font-black text-amber-900 font-mono mt-1">{inr(waitingAmount)}</p>
          <p className="text-[11px] text-amber-700 mt-0.5">
            {waitingCount} {waitingCount === 1 ? 'payment is' : 'payments are'} entered but not approved yet. This Payment is
            not counted in "Payment Received" until Accounts approves it.
          </p>
        </div>
      </div>

      {/* Step 2: the bar and the sum */}
      {/* <div>
        <p className="text-xs font-bold text-slate-800 mb-1.5">Where does the {inr(total)} of sales go?</p>
        <div className="w-full h-5 rounded-full overflow-hidden flex bg-slate-100">
          {parts.map((p) => (
            <div
              key={p.key}
              className={`${p.bar} h-full`}
              style={{ width: `${(p.value / sum) * 100}%` }}
              title={`${p.label}: ${inr(p.value)}`}
            />
          ))}
        </div>

        <div className="mt-3 space-y-2">
          {parts.map((p) => (
            <div key={p.key} className="flex items-start justify-between gap-3 text-xs">
              <div className="flex items-start gap-2 min-w-0">
                <span className={`${p.bar} w-2.5 h-2.5 rounded-sm mt-1 shrink-0`} />
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800">{p.label}</p>
                  <p className="text-[11px] text-slate-500">{p.hint}</p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className={`font-mono font-bold ${p.text}`}>{inr(p.value)}</p>
                <p className="text-[10px] text-slate-400">{Math.round((p.value / sum) * 100)}%</p>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-xs">
            <span className="font-bold text-slate-900">All three added together</span>
            <span className="font-mono font-black text-slate-900">{inr(total)}</span>
          </div>
        </div>
      </div> */}

      {/* Step 3: how the advance number is made */}
      {/* <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
          <div className="text-xs text-indigo-900 space-y-1">
            <p className="font-bold">What is "Paid in advance"?</p>
            <p>
              Think of a shop. You pay for 10 items, but the shop gives you only 4 today. The Payment for the other 6 items
              is "paid in advance". It stays on the order until those 6 items are delivered.
            </p>
            <p className="font-semibold">
              Advance = Payment paid on the order − Value of goods already delivered
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowAdvance((v) => !v)}
          className="mt-3 w-full flex items-center justify-between px-3 py-2 bg-white hover:bg-indigo-50 border border-indigo-200 rounded-lg text-xs font-bold text-indigo-700 transition"
        >
          <span>{showAdvance ? 'Hide' : 'Show'} how {inr(advance)} is made, order by order</span>
          {showAdvance ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showAdvance && (
          <div className="mt-3 overflow-x-auto bg-white rounded-lg border border-indigo-200">
            {advanceList.length === 0 ? (
              <p className="p-3 text-xs text-slate-500">No order has advance Payment right now.</p>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-indigo-50 text-indigo-900 font-semibold">
                    <th className="py-2 px-3">Order</th>
                    <th className="py-2 px-3 text-right">Customer paid</th>
                    <th className="py-2 px-3 text-right">Goods delivered</th>
                    <th className="py-2 px-3 text-right">Advance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageRows.map((o) => (
                    <tr
                      key={o.id}
                      onClick={() => openOrder(o)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openOrder(o);
                        }
                      }}
                      role="link"
                      tabIndex={0}
                      title={`Open order ${o.order_number}`}
                      className="cursor-pointer hover:bg-indigo-50/70 focus:bg-indigo-50 focus:outline-none transition"
                    >
                      <td className="py-2 px-3">
                        <p className="font-mono font-bold text-indigo-700 underline decoration-dotted">{o.order_number}</p>
                        <p className="text-[10px] text-slate-500">
                          {o.party_name || 'Party'} · order value {inr(o.order_total)}
                        </p>
                      </td>
                      <td className="py-2 px-3 text-right font-mono">{inr(o.paid)}</td>
                      <td className="py-2 px-3 text-right font-mono">− {inr(o.delivered_value)}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-indigo-700">= {inr(o.advance)}</td>
                    </tr>
                  ))}
                  <tr className="bg-indigo-50">
                    <td className="py-2 px-3 font-bold text-slate-900" colSpan={3}>
                      Total advance
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-black text-indigo-800">{inr(advance)}</td>
                  </tr>
                </tbody>
              </table>
            )}
            {advanceList.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t border-slate-100 text-[11px] text-slate-600">
                <span>
                  Showing {pageStart + 1}-{Math.min(pageStart + PAGE_SIZE, advanceList.length)} of {advanceList.length} orders
                  <span className="text-slate-400"> · click an order to open it</span>
                </span>
                {totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setPage(Math.max(1, safePage - 1))}
                      disabled={safePage === 1}
                      className="p-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="px-2 font-semibold">
                      Page {safePage} of {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPage(Math.min(totalPages, safePage + 1))}
                      disabled={safePage === totalPages}
                      className="p-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
                      aria-label="Next page"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div> */}

    </div>
  );
};