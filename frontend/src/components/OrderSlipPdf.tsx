import React from 'react';
import { Document, Page, View, Text, Image, StyleSheet, Font, PDFViewer } from '@react-pdf/renderer';
import { Order, OrderItem } from '../types.js';
import regularUrl from '../fonts/NotoSans-Regular.ttf?url';
import boldUrl from '../fonts/NotoSans-Bold.ttf?url';

Font.register({
  family: 'Noto',
  fonts: [
    { src: regularUrl, fontWeight: 400 },
    { src: boldUrl, fontWeight: 700 },
  ],
});
Font.registerHyphenationCallback((w) => [w]);

const C = {
  ink: '#0f172a',
  text: '#334155',
  muted: '#64748b',
  line: '#cbd5e1',
  soft: '#f1f5f9',
  softer: '#f8fafc',
  amber: '#f59e0b',
  amberSoft: '#fffbeb',
  amberLine: '#fde68a',
  green: '#047857',
  greenSoft: '#ecfdf5',
  red: '#be123c',
  redSoft: '#fff1f2',
};

const s = StyleSheet.create({
  page: { fontFamily: 'Noto', fontSize: 8, color: C.text, paddingTop: 0, paddingBottom: 36, paddingHorizontal: 0 },
  topBar: { height: 6, backgroundColor: C.ink, borderBottomWidth: 2, borderBottomColor: C.amber },
  body: { paddingHorizontal: 24, paddingTop: 12 },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 8, borderBottomWidth: 1.5, borderBottomColor: C.ink },
  brandWrap: { flexDirection: 'row', flex: 1, paddingRight: 12 },
  logo: { width: 44, height: 44, borderRadius: 4, objectFit: 'contain', marginRight: 8 },
  logoFallback: { width: 44, height: 44, borderRadius: 4, backgroundColor: C.ink, marginRight: 8, alignItems: 'center', justifyContent: 'center' },
  logoFallbackText: { color: C.amber, fontWeight: 700, fontSize: 12 },
  brandName: { fontSize: 13, fontWeight: 700, color: C.ink },
  brandLine: { fontSize: 7.5, color: C.muted, marginTop: 1, lineHeight: 1.25 },
  brandMeta: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 1.5 },
  metaItem: { fontSize: 7.5, color: C.text, marginRight: 8 },
  bold: { fontWeight: 700, color: C.ink },

  docInfo: { alignItems: 'flex-end', width: 150 },
  docTitle: { fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: 1.2 },
  docSub: { fontSize: 7, color: C.muted, marginTop: 0, letterSpacing: 0.4 },
  orderNo: { marginTop: 3, paddingVertical: 2, paddingHorizontal: 6, backgroundColor: C.soft, borderWidth: 1, borderColor: C.line, borderRadius: 3, fontWeight: 700, fontSize: 9, color: C.ink },
  docMeta: { marginTop: 2, fontSize: 7.5, color: C.muted, textAlign: 'right' },
  pill: { marginTop: 3, paddingVertical: 2, paddingHorizontal: 7, borderRadius: 10, fontSize: 7, fontWeight: 700, letterSpacing: 0.6 },

  // Party / delivery
  oneCol: { marginTop: 8, borderWidth: 1, borderColor: C.text, borderRadius: 4, backgroundColor: C.softer },
  oneColView: { padding: 7, borderWidth: 1, borderColor: C.text, borderRadius: 4, backgroundColor: C.softer },
  twoCol: { flexDirection: 'row', marginTop: 8, borderWidth: 1, borderColor: C.text, borderRadius: 4, backgroundColor: C.softer },
  colLeft: { flex: 1, padding: 7 },
  colRight: { flex: 1, padding: 7, borderLeftWidth: 1, borderLeftColor: C.text },
  label: { fontSize: 6.5, fontWeight: 700, color: C.muted, letterSpacing: 0.8, marginBottom: 2 },
  partyName: { fontSize: 10, fontWeight: 700, color: C.ink, marginBottom: 1 },
  line: { fontSize: 8, lineHeight: 1.3, marginTop: 0.5 },
  note: { marginTop: 3, padding: 3, backgroundColor: C.amberSoft, borderWidth: 1, borderColor: C.text, borderRadius: 3, fontSize: 7.5, color: '#78350f' },

  // Table
  table: { marginTop: 8, borderWidth: 1, borderColor: C.text, borderRadius: 3 },
  th: { flexDirection: 'row', backgroundColor: C.ink, color: '#fff', borderWidth: 1, borderColor: C.text, paddingVertical: 4, alignItems: 'center' },
  thText: { color: '#fff', fontWeight: 700, fontSize: 7, letterSpacing: 0.3, paddingHorizontal: 4 },
  tr: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.text, paddingVertical: 3, borderTopWidth: 1, borderTopColor: C.text },
  trAlt: { backgroundColor: C.softer, borderWidth: 1, borderColor: C.text, },
  td: { paddingHorizontal: 4, fontSize: 8 },
  cIdx: { width: '5%', textAlign: 'center' },
  cImg: { width: '8%', alignItems: 'center' },
  cName: { width: '34%' },
  cQty: { width: '8%', textAlign: 'center' },
  cUnit: { width: '8%', textAlign: 'center' },
  cRate: { width: '17%', textAlign: 'right' },
  cAmt: { width: '20%', textAlign: 'right' },
  thumb: { width: 24, height: 24, borderRadius: 3, borderWidth: 1, borderColor: C.line, objectFit: 'cover' },
  thumbEmpty: { width: 24, height: 24, borderRadius: 3, borderWidth: 1, borderColor: C.line, backgroundColor: C.soft },
  itemName: { fontWeight: 700, color: C.ink },
  itemNote: { fontSize: 7, color: C.muted, marginTop: 0 },

  // Summary
  summaryRow: { flexDirection: 'row', marginTop: 8 },
  bankBox: { flex: 1, marginRight: 8, padding: 7, borderWidth: 1, borderColor: C.line, borderRadius: 4, backgroundColor: C.softer },
  sumBox: { flex: 1, padding: 7, borderWidth: 1, borderColor: C.line, borderRadius: 4 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 1.5 },
  terms: { marginTop: 4, paddingTop: 3, borderTopWidth: 1, borderTopColor: C.text, fontSize: 7, color: C.muted, lineHeight: 1.25 },
  grand: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingVertical: 4, paddingHorizontal: 6, backgroundColor: C.ink, borderRadius: 3 },
  grandText: { color: '#fff', fontWeight: 700, fontSize: 9.5 },
  recv: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3, color: C.green },
  bal: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2, padding: 3, backgroundColor: C.redSoft, borderRadius: 3 },
  words: { marginTop: 5, padding: 4, backgroundColor: C.soft, borderRadius: 3, fontSize: 7.5 },

  // Signatures
  sigRow: { flexDirection: 'row', marginTop: 16 },
  sig: { flex: 1, alignItems: 'center', marginHorizontal: 16 },
  sigLine: { width: '100%', height: 22, borderBottomWidth: 1, borderBottomColor: C.muted, borderStyle: 'dashed', justifyContent: 'flex-end', alignItems: 'center' },
  sigTitle: { marginTop: 2, fontWeight: 700, color: C.ink, fontSize: 8, textAlign: 'center' },
  sigSub: { fontSize: 7, color: C.muted, textAlign: 'center', marginTop: 0 },

  // Footer
  footer: { position: 'absolute', left: 24, right: 24, bottom: 14, flexDirection: 'row', justifyContent: 'space-between', paddingTop: 4, borderTopWidth: 1, borderTopColor: C.text, fontSize: 7, color: C.muted },
});
// ---------- helpers ----------
const money = (n: number | undefined | null) =>
  Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const under100 = (n: number) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`);
const under1000 = (n: number) =>
  `${n >= 100 ? ONES[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' : '') : ''}${n % 100 ? under100(n % 100) : ''}`;

export function inrWords(amount: number): string {
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  if (rupees === 0 && paise === 0) return 'Zero Rupees Only';
  const parts: string[] = [];
  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const rest = rupees % 1000;
  if (crore) parts.push(`${under100(crore)} Crore`);
  if (lakh) parts.push(`${under100(lakh)} Lakh`);
  if (thousand) parts.push(`${under100(thousand)} Thousand`);
  if (rest) parts.push(under1000(rest));
  let out = `${parts.join(' ')} Rupees`;
  if (paise) out += ` and ${under100(paise)} Paise`;
  return `${out} Only`;
}

export interface SlipAssets {
  logo: string | null;
  items: Record<string, string | null>;
}

// ---------- document ----------
export const OrderSlipPdf: React.FC<{ order: Order; items: OrderItem[]; assets: SlipAssets }> = ({ order, items, assets }) => {
  const isNonGst =
    order.tax_type === 'NON_GST' ||
    (order.tax_rate === 0 && order.tax_amount === 0 && order.subtotal === order.grand_total);

  const date = new Date(order.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const reqDate = order.required_delivery_date
    ? new Date(order.required_delivery_date).toLocaleDateString('en-IN')
    : 'Standard Delivery';

  const status =
    order.pending_amount <= 0
      ? { label: 'PAID', bg: C.greenSoft, fg: C.green }
      : order.amount_received > 0
        ? { label: 'PARTIALLY PAID', bg: C.amberSoft, fg: '#92400e' }
        : { label: 'PAYMENT PENDING', bg: C.redSoft, fg: C.red };

  const half = order.tax_rate ? order.tax_rate / 2 : 0;
  const hasBank = order.billing_company_bank || order.billing_company_account || order.billing_company_ifsc;

  return (
    <Document title={`Order Slip ${order.order_number}`} author={order.billing_company_name} subject="Order Confirmation">
      <Page size="A4" style={s.page}>
        <View style={s.topBar} fixed />

        <View style={s.body}>
          {/* Header */}
          <View style={s.header}>
            <View style={s.brandWrap}>
              {assets.logo ? (
                <Image src={assets.logo} style={s.logo} />
              ) : (
                <View style={s.logoFallback}>
                  <Text style={s.logoFallbackText}>{order.billing_company_code || 'LUBE'}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={s.brandName}>{order.billing_company_name}</Text>
                <Text style={s.brandLine}>
                  {order.billing_company_address}, {order.billing_company_city}, {order.billing_company_state} - {order.billing_company_pincode}
                </Text>
                <View style={s.brandMeta}>
                  <Text style={s.metaItem}><Text style={s.bold}>GSTIN: </Text>{order.billing_company_gst}</Text>
                  <Text style={s.metaItem}><Text style={s.bold}>Mobile: </Text>{order.billing_company_mobile}</Text>
                </View>
                <Text style={s.metaItem}><Text style={s.bold}>Email: </Text>{order.billing_company_email}</Text>
              </View>
            </View>

            <View style={s.docInfo}>
              <Text style={s.docTitle}>ORDER SLIP</Text>
              <Text style={s.docSub}>ORDER CONFIRMATION</Text>
              <Text style={s.orderNo}>{order.order_number}</Text>
              <Text style={s.docMeta}>Date: <Text style={s.bold}>{date}</Text></Text>
              <Text style={s.docMeta}>Sales Officer: <Text style={s.bold}>{order.sales_person_name}</Text></Text>
              <Text style={[s.pill, { backgroundColor: status.bg, color: status.fg }]}>{status.label}</Text>
            </View>
          </View>

          {/* Party + Delivery */}
          <View style={s.twoCol} wrap={false}>
            <View style={s.colLeft}>
              <Text style={s.label}>PARTY INFORMATION</Text>
              <Text style={s.partyName}>{order.vendor_name}</Text>
              <Text style={s.line}>Attn: {order.vendor_contact || 'Purchase Department'}</Text>

              <Text style={s.line}>Mobile: {order.vendor_mobile}{order.vendor_email ? `  |  ${order.vendor_email}` : ''}</Text>
              {order.vendor_gstin && (
                <Text style={s.line}><Text style={s.bold}>GSTIN: </Text>{order.vendor_gstin || 'Unregistered / Exempted'}</Text>

              )}
              {order.vendor_aadhar && (
                <Text style={s.line}><Text style={s.bold}>Aadhaar: </Text>{order.vendor_aadhar || 'Unregistered / Exempted'}</Text>

              )}

              <Text style={s.line}>
                <Text style={s.bold}>Billing Address: </Text>
                {order.vendor_billing_address}, {order.vendor_city}, {order.vendor_state}
              </Text>
            </View>
            <View style={s.colRight}>
              <Text style={s.label}>DELIVERY DESTINATION & TERMS</Text>
              <Text style={s.line}>
                <Text style={s.bold}>Address: </Text>
                {order.delivery_address || order.vendor_delivery_address || order.vendor_billing_address}
              </Text>
              <Text style={s.line}>
                <Text style={s.bold}>Contact: </Text>
                {order.delivery_contact_person || order.vendor_contact} ({order.delivery_contact_number || order.vendor_mobile})
              </Text>
              <Text style={s.line}><Text style={s.bold}>Required By: </Text>{reqDate}</Text>
              <Text style={s.line}><Text style={s.bold}>Payment Terms: </Text>{order.payment_terms}</Text>
              {order.special_instructions ? (
                <Text style={s.note}><Text style={s.bold}>Special Notes: </Text>{order.special_instructions}</Text>
              ) : null}
            </View>
          </View>
          <View style={s.oneCol} wrap={false}>
            <View style={s.oneColView}>
              {(order.transportName || order.booking_station || order.transport_contact_number || order.transportAddress) ? (
                <>
                  <Text style={[s.label, { marginTop: 4 }]}>TRANSPORT DETAILS</Text>
                  {order.transportName ? <Text style={s.line}><Text style={s.bold}>Transport: </Text>{order.transportName}</Text> : null}
                  {order.booking_station ? <Text style={s.line}><Text style={s.bold}>Booking Station: </Text>{order.booking_station}</Text> : null}
                  {order.transport_contact_number ? <Text style={s.line}><Text style={s.bold}>Contact: </Text>{order.transport_contact_number}</Text> : null}
                  {order.transportAddress ? <Text style={s.line}><Text style={s.bold}>Address: </Text>{order.transportAddress}</Text> : null}
                </>
              ) : null}
            </View>
          </View>

          {/* Items */}
          <View style={s.table}>
            <View style={s.th}>
              <Text style={[s.thText, s.cIdx]}>#</Text>
              <Text style={[s.thText, s.cImg, { textAlign: 'center' }]}>IMAGE</Text>
              <Text style={[s.thText, s.cName]}>PRODUCT</Text>
              <Text style={[s.thText, s.cQty]}>QTY</Text>
              <Text style={[s.thText, s.cUnit]}>UNIT</Text>
              <Text style={[s.thText, s.cRate]}>{isNonGst ? 'RATE' : 'RATE (INCL. GST)'}</Text>
              <Text style={[s.thText, s.cAmt]}>{isNonGst ? 'AMOUNT' : 'AMOUNT (INCL. GST)'}</Text>
            </View>

            {items.map((item, idx) => {
              const img = assets.items[item.id];
              console.log(item)
              return (
                <View key={item.id} style={[s.tr, idx % 2 ? s.trAlt : {}]} wrap={false}>
                  <Text style={[s.td, s.cIdx, { color: C.muted }]}>{idx + 1}</Text>
                  <View style={[s.td, s.cImg]}>
                    {img ? <Image src={img} style={s.thumb} /> : <View style={s.thumbEmpty} />}
                  </View>
                  <View style={[s.td, s.cName]}>
                    <Text style={s.itemName}>{item.product_name}</Text>
                    {item.item_colour ? <Text style={s.itemNote}>{item.item_colour}</Text> : null}
                  </View>

                  <Text style={[s.td, s.cQty, { fontWeight: 700, color: C.ink }]}>{item.quantity}</Text>
                  <Text style={[s.td, s.cUnit]}>{item.unit}</Text>
                  <Text style={[s.td, s.cRate]}>{money(item.rate)}</Text>
                  <Text style={[s.td, s.cAmt, { fontWeight: 700, color: C.ink }]}>{money(item.line_amount)}</Text>
                </View>
              );
            })}
          </View>

          {/* Bank + Summary */}
          <View style={s.summaryRow} wrap={false}>
            {hasBank ? (
              <View style={s.bankBox}>
                <Text style={s.label}>REMITTANCE & BANK DETAILS</Text>
                {order.billing_company_bank ? <Text style={s.line}><Text style={s.bold}>Bank: </Text>{order.billing_company_bank}</Text> : null}
                <Text style={s.line}><Text style={s.bold}>Account Name: </Text>{order.billing_company_name}</Text>
                {order.billing_company_account ? <Text style={s.line}><Text style={s.bold}>Account No: </Text>{order.billing_company_account}</Text> : null}
                {order.billing_company_ifsc ? <Text style={s.line}><Text style={s.bold}>IFSC: </Text>{order.billing_company_ifsc}</Text> : null}
                {order.billing_company_branch ? <Text style={s.line}><Text style={s.bold}>Branch: </Text>{order.billing_company_branch}</Text> : null}
                <Text style={s.terms}>
                  {order.billing_company_terms || 'Goods once dispatched are covered under standard manufacturer warranty. Subject to city jurisdiction.'}
                </Text>
              </View>
            ) : (
              <View style={s.bankBox}>
                <Text style={s.label}>TERMS</Text>
                <Text style={[s.line, { color: C.muted }]}>
                  {order.billing_company_terms || 'Goods once dispatched are covered under standard manufacturer warranty. Subject to city jurisdiction.'}
                </Text>
              </View>
            )}

            <View style={s.sumBox}>
              {Number(order.discount_amount || 0) > 0 && (
                <>
                  <View style={s.kv}>
                    <Text>Items Total</Text>
                    <Text>₹{money(Number(order.gross_amount) || Number(order.grand_total) + Number(order.discount_amount))}</Text>
                  </View>
                  <View style={s.kv}>
                    <Text>Discount{order.discount_type === 'PERCENT' ? ` (${order.discount_value}%)` : ''}</Text>
                    <Text>- ₹{money(order.discount_amount)}</Text>
                  </View>
                </>
              )}
              <View style={s.kv}>
                <Text>{isNonGst ? 'Subtotal' : 'Taxable Value (Excl. GST)'}</Text>
                <Text style={s.bold}>₹{money(order.subtotal)}</Text>
              </View>
              {!isNonGst && order.tax_regime === 'IGST' ? (
                <View style={s.kv}><Text>IGST @{order.tax_rate || 18}%</Text><Text>₹{money(order.tax_amount)}</Text></View>
              ) : !isNonGst && half > 0 ? (
                <>
                  <View style={s.kv}><Text>CGST @{half}%</Text><Text>₹{money(order.tax_amount / 2)}</Text></View>
                  <View style={s.kv}><Text>SGST @{half}%</Text><Text>₹{money(order.tax_amount / 2)}</Text></View>
                </>
              ) : (
                <View style={s.kv}><Text>GST</Text><Text>₹{money(order.tax_amount)}</Text></View>
              )}

              <View style={s.grand}>
                <Text style={s.grandText}>{isNonGst ? 'Grand Total' : 'Grand Total (Incl. GST)'}</Text>
                <Text style={s.grandText}>₹{money(order.grand_total)}</Text>
              </View>

              <View style={s.recv}>
                <Text>Verified Amount Received</Text>
                <Text style={{ fontWeight: 700 }}>₹{money(order.amount_received)}</Text>
              </View>
              <View style={s.bal}>
                <Text style={{ color: C.red, fontWeight: 700 }}>Balance Payment</Text>
                <Text style={{ color: C.red, fontWeight: 700 }}>₹{money(order.pending_amount)}</Text>
              </View>
            </View>
          </View>

          <Text style={s.words}>
            <Text style={s.bold}>Amount in words: </Text>{inrWords(order.grand_total)}
          </Text>

          {/* Signatures */}
          <View style={s.sigRow} wrap={false}>
            <View style={s.sig}>
              <View style={s.sigLine} />
              <Text style={s.sigTitle}>Customer Signature & Stamp</Text>
              <Text style={s.sigSub}>I accept the order confirmation terms & quantities</Text>
            </View>
            <View style={s.sig}>
              <View style={s.sigLine}>
                <Text style={{ fontSize: 7.5, color: C.muted, marginBottom: 3 }}>For {order.billing_company_name}</Text>
              </View>
              <Text style={s.sigTitle}>Authorized Signatory / Dispatch Head</Text>
              <Text style={s.sigSub}>Maxmol Lubricant Operations Management System</Text>
            </View>
          </View>
        </View>

        {/* Footer on every page */}
        <View style={s.footer} fixed>
          <Text>Computer-generated order slip · {order.order_number}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
};

// ---------- preview (lazy-loaded by the modal) ----------
export const OrderSlipPreview: React.FC<{ order: Order; items: OrderItem[]; assets: SlipAssets }> = (props) => (
  <PDFViewer width="100%" height="100%" showToolbar={false} style={{ border: 0 }}>
    <OrderSlipPdf {...props} />
  </PDFViewer>
);