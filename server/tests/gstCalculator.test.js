// Unit tests for the GST calculation engine
const calculateGST = require('../utils/gstCalculator');

describe('GST Calculation Engine', () => {
  test('CGST_SGST Split Calculation', () => {
    const lines = [
      { qty: 10, rate: 100, gst_percent: 18 }
    ];
    const res = calculateGST(lines, 'CGST_SGST');

    expect(res.taxable_value).toBe(1000);
    expect(res.cgst_total).toBe(90);
    expect(res.sgst_total).toBe(90);
    expect(res.igst_total).toBe(0);
    expect(res.grand_total).toBe(1180);
    expect(res.round_off).toBe(0);
  });

  test('IGST Calculation with precise decimals & rounding only at grand total', () => {
    const lines = [
      { qty: 3, rate: 20.14, gst_percent: 18 } // taxable_amount = 60.42. igst = 10.8756. total_raw = 71.2956
    ];
    const res = calculateGST(lines, 'IGST');

    expect(res.taxable_value).toBe(60.42);
    expect(res.igst_total).toBe(10.88); // 10.8756 rounded to 2 decimals is 10.88
    expect(res.grand_total).toBe(71); // 71.2956 rounded to nearest integer is 71
    expect(res.round_off).toBeCloseTo(-0.30, 3);
  });
});
