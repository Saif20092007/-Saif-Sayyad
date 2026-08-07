// Payment Controller
const Database = require('../database/db');
const logger = require('../utils/logger');

exports.getPayments = async (req, reqRes, next) => {
  try {
    const payments = await Database.query('payments', 'select', { orderBy: 'payment_date', ascending: false });

    // Performance optimization: map names to avoid N+1 queries
    const customers = await Database.query('customers', 'select');
    const customerMap = {};
    customers.forEach(c => {
      customerMap[c.id] = c.name;
    });

    const invoices = await Database.query('invoices', 'select');
    const invoiceMap = {};
    invoices.forEach(i => {
      invoiceMap[i.id] = i.invoice_no;
    });

    const enrichedPayments = payments.map(p => ({
      ...p,
      customer_name: customerMap[p.customer_id] || 'Unknown Customer',
      invoice_no: p.invoice_id ? (invoiceMap[p.invoice_id] || 'N/A') : 'On Account'
    }));

    reqRes.json({ success: true, data: enrichedPayments });
  } catch (error) {
    next(error);
  }
};

exports.createPayment = async (req, reqRes, next) => {
  try {
    const { customer_id, invoice_id, amount, payment_date, mode } = req.body;

    if (!customer_id || !amount || !payment_date || !mode) {
      const err = new Error('Missing required payment fields.');
      err.status = 400;
      return next(err);
    }

    const payAmount = Number(amount);
    if (isNaN(payAmount) || payAmount <= 0) {
      const err = new Error('Payment amount must be a positive number.');
      err.status = 400;
      return next(err);
    }

    // Verify Customer
    const customer = await Database.query('customers', 'select', { id: customer_id });
    if (!customer) {
      const err = new Error('Customer not found.');
      err.status = 400;
      return next(err);
    }

    let invoice = null;
    if (invoice_id) {
      // Verify Invoice
      invoice = await Database.query('invoices', 'select', { id: invoice_id });
      if (!invoice) {
        const err = new Error('Invoice not found.');
        err.status = 400;
        return next(err);
      }
      if (invoice.customer_id !== customer_id) {
        const err = new Error('Invoice does not belong to the selected customer.');
        err.status = 400;
        return next(err);
      }
    }

    // Insert payment
    const paymentPayload = {
      customer_id,
      invoice_id: invoice_id || null,
      amount: payAmount,
      payment_date,
      mode
    };

    const newPayment = await Database.query('payments', 'insert', { data: paymentPayload });

    // Update invoice payment status if invoice_id is specified
    if (invoice_id && invoice) {
      // Get all payments for this invoice
      const payments = await Database.query('payments', 'select', { filters: { invoice_id } });
      const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);

      let newStatus = 'Unpaid';
      if (totalPaid >= Number(invoice.grand_total)) {
        newStatus = 'Paid';
      } else if (totalPaid > 0) {
        newStatus = 'Partially Paid';
      }

      await Database.query('invoices', 'update', {
        id: invoice_id,
        data: { payment_status: newStatus }
      });
    }

    // Audit log
    await logger.audit(req.user ? req.user.id : null, 'Record Payment', 'payments', newPayment.id);

    reqRes.status(201).json({ success: true, data: newPayment });
  } catch (error) {
    next(error);
  }
};
