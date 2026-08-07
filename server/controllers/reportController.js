// Reports & Excel Exports Controller
const Database = require('../database/db');
const ExcelJS = require('exceljs');

// 1. Monthly GST Report
exports.getGSTReport = async (req, reqRes, next) => {
  try {
    const { year, month } = req.query; // e.g. year=2026, month=04
    if (!year || !month) {
      const err = new Error('Both year and month query parameters are required.');
      err.status = 400;
      return next(err);
    }

    const invoices = await Database.query('invoices', 'select');

    // Filter out Cancelled and filter by Month/Year
    const activeInvoices = invoices.filter(inv => {
      if (inv.invoice_status === 'Cancelled') return false;
      const date = new Date(inv.invoice_date);
      const invYear = date.getFullYear();
      const invMonth = date.getMonth() + 1; // 1-indexed
      return invYear === Number(year) && invMonth === Number(month);
    });

    let taxable_total = 0;
    let cgst_total = 0;
    let sgst_total = 0;
    let igst_total = 0;
    let grand_total = 0;

    activeInvoices.forEach(inv => {
      taxable_total += Number(inv.taxable_value);
      cgst_total += Number(inv.cgst_total || 0);
      sgst_total += Number(inv.sgst_total || 0);
      igst_total += Number(inv.igst_total || 0);
      grand_total += Number(inv.grand_total);
    });

    reqRes.json({
      success: true,
      data: {
        year: Number(year),
        month: Number(month),
        summary: {
          taxable_total: Number(taxable_total.toFixed(2)),
          cgst_total: Number(cgst_total.toFixed(2)),
          sgst_total: Number(sgst_total.toFixed(2)),
          igst_total: Number(igst_total.toFixed(2)),
          grand_total: Number(grand_total.toFixed(2))
        },
        invoices: activeInvoices
      }
    });
  } catch (error) {
    next(error);
  }
};

// 2. Export GST Report to Excel
exports.exportGSTReportToExcel = async (req, reqRes, next) => {
  try {
    const { year, month } = req.query;
    if (!year || !month) {
      const err = new Error('Both year and month query parameters are required.');
      err.status = 400;
      return next(err);
    }

    const invoices = await Database.query('invoices', 'select');
    const activeInvoices = invoices.filter(inv => {
      if (inv.invoice_status === 'Cancelled') return false;
      const date = new Date(inv.invoice_date);
      const invYear = date.getFullYear();
      const invMonth = date.getMonth() + 1;
      return invYear === Number(year) && invMonth === Number(month);
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('CA GST Report');

    // Title and styling
    worksheet.columns = [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Invoice No', key: 'invoice_no', width: 22 },
      { header: 'Customer Name', key: 'customer_name', width: 30 },
      { header: 'Customer GSTIN', key: 'customer_gstin', width: 18 },
      { header: 'Place of Supply', key: 'place_of_supply', width: 18 },
      { header: 'Tax Type', key: 'tax_type', width: 14 },
      { header: 'Taxable Value (₹)', key: 'taxable_value', width: 16 },
      { header: 'CGST (₹)', key: 'cgst', width: 14 },
      { header: 'SGST (₹)', key: 'sgst', width: 14 },
      { header: 'IGST (₹)', key: 'igst', width: 14 },
      { header: 'Grand Total (₹)', key: 'grand_total', width: 18 }
    ];

    worksheet.getRow(1).font = { bold: true };

    activeInvoices.forEach(inv => {
      worksheet.addRow({
        date: new Date(inv.invoice_date).toLocaleDateString('en-GB'),
        invoice_no: inv.invoice_no,
        customer_name: inv.snapshot_customer_name,
        customer_gstin: inv.snapshot_customer_gstin || 'N/A',
        place_of_supply: inv.place_of_supply,
        tax_type: inv.tax_type,
        taxable_value: Number(inv.taxable_value),
        cgst: Number(inv.cgst_total || 0),
        sgst: Number(inv.sgst_total || 0),
        igst: Number(inv.igst_total || 0),
        grand_total: Number(inv.grand_total)
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    reqRes.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reqRes.setHeader('Content-Disposition', `attachment; filename=GST_Report_${year}_${month}.xlsx`);
    reqRes.send(buffer);
  } catch (error) {
    next(error);
  }
};

// 3. Export Sales Ledger to Excel
exports.exportSalesToExcel = async (req, reqRes, next) => {
  try {
    const invoices = await Database.query('invoices', 'select', { orderBy: 'invoice_no', ascending: false });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sales History');

    worksheet.columns = [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Invoice No', key: 'invoice_no', width: 22 },
      { header: 'Customer', key: 'customer_name', width: 30 },
      { header: 'PO Number', key: 'po_number', width: 15 },
      { header: 'Grand Total (₹)', key: 'grand_total', width: 18 },
      { header: 'Payment Status', key: 'payment_status', width: 16 },
      { header: 'Invoice Status', key: 'status', width: 14 }
    ];

    worksheet.getRow(1).font = { bold: true };

    invoices.forEach(inv => {
      worksheet.addRow({
        date: new Date(inv.invoice_date).toLocaleDateString('en-GB'),
        invoice_no: inv.invoice_no,
        customer_name: inv.snapshot_customer_name,
        po_number: inv.po_number || 'N/A',
        grand_total: Number(inv.grand_total),
        payment_status: inv.payment_status,
        status: inv.invoice_status
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    reqRes.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reqRes.setHeader('Content-Disposition', 'attachment; filename=Sales_History.xlsx');
    reqRes.send(buffer);
  } catch (error) {
    next(error);
  }
};
