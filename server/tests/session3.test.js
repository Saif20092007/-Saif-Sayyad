// Jest integration tests for Session 3 systems: purchases, payments, ledgers, and cancellations.
const Database = require('../database/db');
const path = require('path');
const fs = require('fs');

describe('Session 3 Systems Integration Tests', () => {
  let productId;
  let supplierId;
  let customerId;

  beforeAll(async () => {
    // Reset database to initial blank state
    const dbPath = path.join(__dirname, '../database/mock_db.json');
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }

    // Insert mock customer
    const customer = await Database.query('customers', 'insert', {
      data: {
        name: 'Test Customer',
        phone: '1234567890',
        billing_address: '123 Test St',
        shipping_address: '123 Test St'
      }
    });
    customerId = customer.id;

    // Insert mock supplier
    const supplier = await Database.query('suppliers', 'insert', {
      data: {
        name: 'Test Supplier',
        phone: '0987654321',
        address: '456 Supplier Rd'
      }
    });
    supplierId = supplier.id;

    // Insert mock product (automatically initializes stock = 0.000)
    const product = await Database.query('products', 'insert', {
      data: {
        name: 'Integrator Box',
        hsn_code: '850000',
        gst_percent: 18.00,
        default_rate: 50.00,
        unit: 'NOS'
      }
    });
    productId = product.id;
  });

  test('Supplier Purchases atomically increment stock levels', async () => {
    // Check initial stock is 0
    let stockData = await Database.query('stock', 'select', { id: productId });
    expect(Number(stockData.quantity_available)).toBe(0);

    // Record a supplier purchase of 25 items
    const purchasePayload = {
      supplier_id: supplierId,
      purchase_date: '2026-04-10',
      invoice_ref: 'SUP-INV-001',
      total_amount: 1250.00
    };

    const itemsPayload = [
      {
        product_id: productId,
        qty: 25,
        rate: 50.00,
        amount: 1250.00
      }
    ];

    await Database.query(null, 'rpc', {
      function: 'create_purchase_transaction',
      args: {
        purchase_payload: purchasePayload,
        items_payload: itemsPayload
      }
    });

    // Check stock was incremented to 25
    stockData = await Database.query('stock', 'select', { id: productId });
    expect(Number(stockData.quantity_available)).toBe(25);
  });

  test('Customer Invoice creation decrements stock, and cancellation restores it', async () => {
    // Current stock is 25. Create invoice of 10 items.
    const invoicePayload = {
      financial_year: '2026-27',
      invoice_date: '2026-04-12',
      customer_id: customerId,
      place_of_supply: 'Maharashtra',
      tax_type: 'CGST_SGST',
      taxable_value: 500,
      grand_total: 590,
      copy_type: 'Original',
      snapshot_customer_name: 'Test Customer',
      snapshot_customer_address: '123 Test St'
    };

    const itemsPayload = [
      {
        product_id: productId,
        qty: 10,
        rate: 50.00,
        taxable_amount: 500,
        line_total: 590,
        snapshot_description: 'Integrator Box',
        snapshot_hsn: '850000',
        snapshot_gst_percent: 18.00
      }
    ];

    const invoiceId = await Database.query(null, 'rpc', {
      function: 'create_invoice_transaction',
      args: {
        invoice_payload: invoicePayload,
        items_payload: itemsPayload
      }
    });

    // Check stock decremented to 15
    let stockData = await Database.query('stock', 'select', { id: productId });
    expect(Number(stockData.quantity_available)).toBe(15);

    // Cancel the invoice
    await Database.query(null, 'rpc', {
      function: 'cancel_invoice_transaction',
      args: { p_invoice_id: invoiceId }
    });

    // Check stock restored back to 25
    stockData = await Database.query('stock', 'select', { id: productId });
    expect(Number(stockData.quantity_available)).toBe(25);
  });

  test('Customer Payments transition Invoice payment_status accurately', async () => {
    // 1. Create a fresh invoice of grand_total = 1000
    const invoicePayload = {
      financial_year: '2026-27',
      invoice_date: '2026-04-15',
      customer_id: customerId,
      place_of_supply: 'Maharashtra',
      tax_type: 'CGST_SGST',
      taxable_value: 1000,
      grand_total: 1180,
      snapshot_customer_name: 'Test Customer',
      snapshot_customer_address: '123 Test St'
    };

    const itemsPayload = [
      {
        product_id: productId,
        qty: 20,
        rate: 50.00,
        taxable_amount: 1000,
        line_total: 1180,
        snapshot_description: 'Integrator Box',
        snapshot_hsn: '850000',
        snapshot_gst_percent: 18.00
      }
    ];

    const invoiceId = await Database.query(null, 'rpc', {
      function: 'create_invoice_transaction',
      args: {
        invoice_payload: invoicePayload,
        items_payload: itemsPayload
      }
    });

    // Retrieve fresh invoice
    let invoice = await Database.query('invoices', 'select', { id: invoiceId });
    expect(invoice.payment_status).toBe('Draft'); // Default initial status

    // 2. Perform a partial payment of 400
    // Simulating controller payment save
    await Database.query('payments', 'insert', {
      data: {
        customer_id: customerId,
        invoice_id: invoiceId,
        amount: 400,
        payment_date: '2026-04-16',
        mode: 'UPI'
      }
    });

    // Run same status update logic from controller
    const payments1 = await Database.query('payments', 'select', { filters: { invoice_id: invoiceId } });
    const totalPaid1 = payments1.reduce((sum, p) => sum + Number(p.amount), 0);
    expect(totalPaid1).toBe(400);

    let status1 = 'Unpaid';
    if (totalPaid1 >= Number(invoice.grand_total)) {
      status1 = 'Paid';
    } else if (totalPaid1 > 0) {
      status1 = 'Partially Paid';
    }

    await Database.query('invoices', 'update', {
      id: invoiceId,
      data: { payment_status: status1 }
    });

    // Verify it is Partially Paid
    invoice = await Database.query('invoices', 'select', { id: invoiceId });
    expect(invoice.payment_status).toBe('Partially Paid');

    // 3. Perform a finishing payment of 780
    await Database.query('payments', 'insert', {
      data: {
        customer_id: customerId,
        invoice_id: invoiceId,
        amount: 780,
        payment_date: '2026-04-17',
        mode: 'Cheque'
      }
    });

    const payments2 = await Database.query('payments', 'select', { filters: { invoice_id: invoiceId } });
    const totalPaid2 = payments2.reduce((sum, p) => sum + Number(p.amount), 0);
    expect(totalPaid2).toBe(1180);

    let status2 = 'Unpaid';
    if (totalPaid2 >= Number(invoice.grand_total)) {
      status2 = 'Paid';
    } else if (totalPaid2 > 0) {
      status2 = 'Partially Paid';
    }

    await Database.query('invoices', 'update', {
      id: invoiceId,
      data: { payment_status: status2 }
    });

    // Verify it is fully Paid
    invoice = await Database.query('invoices', 'select', { id: invoiceId });
    expect(invoice.payment_status).toBe('Paid');
  });
});
