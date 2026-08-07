// Ledger Controller
const Database = require('../database/db');

exports.getCustomerLedger = async (req, reqRes, next) => {
  try {
    const customerId = req.params.customer_id;

    // Verify Customer
    const customer = await Database.query('customers', 'select', { id: customerId });
    if (!customer) {
      const err = new Error('Customer not found.');
      err.status = 404;
      return next(err);
    }

    // Fetch Invoices (only non-Cancelled ones)
    const invoices = await Database.query('invoices', 'select', { filters: { customer_id: customerId } });
    const activeInvoices = invoices.filter(i => i.invoice_status !== 'Cancelled');

    // Fetch Payments
    const payments = await Database.query('payments', 'select', { filters: { customer_id: customerId } });

    // Combine into ledger entries
    const entries = [];

    activeInvoices.forEach(inv => {
      entries.push({
        date: inv.invoice_date,
        type: 'Invoice',
        reference: inv.invoice_no,
        debit: Number(inv.grand_total),
        credit: 0,
        sortOrder: 1 // Invoices sort before payments on same day
      });
    });

    payments.forEach(pay => {
      let refLabel = pay.mode;
      if (pay.invoice_id) {
        const linkedInv = activeInvoices.find(i => i.id === pay.invoice_id);
        if (linkedInv) {
          refLabel += ` (Inv: ${linkedInv.invoice_no})`;
        }
      }
      entries.push({
        date: pay.payment_date,
        type: 'Payment',
        reference: refLabel,
        debit: 0,
        credit: Number(pay.amount),
        sortOrder: 2
      });
    });

    // Chronological Sort
    entries.sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      if (dateA < dateB) return -1;
      if (dateA > dateB) return 1;
      // If dates match, sort by sortOrder (Invoices first)
      return a.sortOrder - b.sortOrder;
    });

    // Calculate Running Balance and Totals
    let runningBalance = 0;
    let totalInvoiced = 0;
    let totalPaid = 0;

    const ledgerTransactions = entries.map(entry => {
      runningBalance += (entry.debit - entry.credit);
      totalInvoiced += entry.debit;
      totalPaid += entry.credit;

      return {
        date: entry.date,
        type: entry.type,
        reference: entry.reference,
        debit: entry.debit,
        credit: entry.credit,
        running_balance: Number(runningBalance.toFixed(2))
      };
    });

    reqRes.json({
      success: true,
      data: {
        customer: {
          id: customer.id,
          name: customer.name,
          gstin: customer.gstin,
          billing_address: customer.billing_address
        },
        summary: {
          total_invoiced: Number(totalInvoiced.toFixed(2)),
          total_paid: Number(totalPaid.toFixed(2)),
          outstanding_balance: Number((totalInvoiced - totalPaid).toFixed(2))
        },
        transactions: ledgerTransactions
      }
    });
  } catch (error) {
    next(error);
  }
};
