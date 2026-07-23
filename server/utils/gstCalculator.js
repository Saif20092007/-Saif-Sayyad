// Pure Utility to compute GST values & lines.
// Standard Indian math rules: never round per line, round off only once at grand_total.

function calculateGST(lines, taxType) {
  let taxable_value = 0;
  let cgst_total = 0;
  let sgst_total = 0;
  let igst_total = 0;

  const calculatedLines = lines.map(line => {
    const qty = Number(line.qty || 0);
    const rate = Number(line.rate || 0);
    const gstPercent = Number(line.gst_percent || 0);

    const taxable_amount = qty * rate;
    let cgst_amount = 0;
    let sgst_amount = 0;
    let igst_amount = 0;

    if (taxType === 'CGST_SGST') {
      cgst_amount = taxable_amount * (gstPercent / 200);
      sgst_amount = taxable_amount * (gstPercent / 200);
    } else if (taxType === 'IGST') {
      igst_amount = taxable_amount * (gstPercent / 100);
    }

    const line_total = taxable_amount + cgst_amount + sgst_amount + igst_amount;

    taxable_value += taxable_amount;
    cgst_total += cgst_amount;
    sgst_total += sgst_amount;
    igst_total += igst_amount;

    return {
      product_id: line.product_id,
      snapshot_description: line.snapshot_description || '',
      snapshot_hsn: line.snapshot_hsn || '',
      snapshot_gst_percent: gstPercent,
      qty,
      rate,
      taxable_amount: Number(taxable_amount.toFixed(4)),
      cgst_amount: Number(cgst_amount.toFixed(4)),
      sgst_amount: Number(sgst_amount.toFixed(4)),
      igst_amount: Number(igst_amount.toFixed(4)),
      line_total: Number(line_total.toFixed(4))
    };
  });

  const grand_total_raw = taxable_value + cgst_total + sgst_total + igst_total;
  const grand_total = Math.round(grand_total_raw);
  const round_off = Number((grand_total - grand_total_raw).toFixed(2));

  return {
    lines: calculatedLines,
    taxable_value: Number(taxable_value.toFixed(2)),
    cgst_total: Number(cgst_total.toFixed(2)),
    sgst_total: Number(sgst_total.toFixed(2)),
    igst_total: Number(igst_total.toFixed(2)),
    round_off,
    grand_total
  };
}

module.exports = calculateGST;
