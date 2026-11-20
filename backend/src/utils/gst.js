// State-wise GST:
//   party in the SAME state as the billing company ( Delhi )  -> CGST 9% + SGST 9%
//   party in ANY OTHER state                                    -> IGST 18%
//   Non-GST orders                                              -> no tax
const SUPPLY_STATE_DEFAULT = 'Delhi';

const norm = (s) => String(s || '').trim().toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ');
// "New Delhi", "NCT of Delhi", "Delhi" are all the same place
const canon = (s) => {
  const n = norm(s);
  return n.includes('delhi') ? 'delhi' : n;
};

function taxRegime(taxType, partyState, companyState) {
  if (taxType === 'NON_GST') return 'NONE';
  const supply = canon(companyState) || canon(SUPPLY_STATE_DEFAULT);
  const party = canon(partyState);
  if (!party) return 'CGST_SGST'; // unknown state: keep old behaviour
  return party === supply ? 'CGST_SGST' : 'IGST';
}

// Splits a total tax amount according to the regime
function splitTax(taxAmount, regime) {
  const t = Number(taxAmount) || 0;
  const r2 = (n) => Math.round(n * 100) / 100;
  if (regime === 'IGST') return { igst: r2(t), cgst: 0, sgst: 0 };
  if (regime === 'CGST_SGST') {
    const c = r2(t / 2);
    return { igst: 0, cgst: c, sgst: r2(t - c) };
  }
  return { igst: 0, cgst: 0, sgst: 0 };
}

module.exports = { taxRegime, splitTax, SUPPLY_STATE_DEFAULT };
