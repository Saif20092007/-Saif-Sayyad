// Purchase Controller
const Database = require('../database/db');
const logger = require('../utils/logger');

exports.getPurchases = async (req, reqRes, next) => {
  try {
    const purchases = await Database.query('purchases', 'select', { orderBy: 'purchase_date', ascending: false });

    // Performance optimization: fetch all suppliers to map names instead of N+1 queries
    const suppliers = await Database.query('suppliers', 'select');
    const supplierMap = {};
    suppliers.forEach(s => {
      supplierMap[s.id] = s.name;
    });

    const enrichedPurchases = purchases.map(p => ({
      ...p,
      supplier_name: supplierMap[p.supplier_id] || 'Unknown Supplier'
    }));

    reqRes.json({ success: true, data: enrichedPurchases });
  } catch (error) {
    next(error);
  }
};

exports.getPurchaseById = async (req, reqRes, next) => {
  try {
    const purchase = await Database.query('purchases', 'select', { id: req.params.id });
    if (!purchase) {
      const err = new Error('Purchase not found.');
      err.status = 404;
      return next(err);
    }

    const items = await Database.query('purchase_items', 'select', { filters: { purchase_id: req.params.id } });

    // Map product names
    const products = await Database.query('products', 'select');
    const productMap = {};
    products.forEach(p => {
      productMap[p.id] = p.name;
    });

    const enrichedItems = items.map(it => ({
      ...it,
      product_name: productMap[it.product_id] || 'Unknown Product'
    }));

    reqRes.json({
      success: true,
      data: {
        ...purchase,
        items: enrichedItems
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.createPurchase = async (req, reqRes, next) => {
  try {
    const { supplier_id, purchase_date, invoice_ref, items } = req.body;

    if (!supplier_id || !purchase_date || !invoice_ref || !items || !Array.isArray(items) || items.length === 0) {
      const err = new Error('Missing required purchase fields or empty line items.');
      err.status = 400;
      return next(err);
    }

    // Verify supplier
    const supplier = await Database.query('suppliers', 'select', { id: supplier_id });
    if (!supplier) {
      const err = new Error('Supplier not found.');
      err.status = 400;
      return next(err);
    }

    // Verify products and compute total amount
    let totalAmount = 0;
    const validatedItems = [];
    for (const item of items) {
      if (!item.product_id || !item.qty || !item.rate) {
        const err = new Error('Invalid purchase item format.');
        err.status = 400;
        return next(err);
      }

      const product = await Database.query('products', 'select', { id: item.product_id });
      if (!product) {
        const err = new Error(`Product not found: ${item.product_id}`);
        err.status = 400;
        return next(err);
      }

      const qty = Number(item.qty);
      const rate = Number(item.rate);
      const amount = Number((qty * rate).toFixed(2));
      totalAmount += amount;

      validatedItems.push({
        product_id: item.product_id,
        qty,
        rate,
        amount
      });
    }

    // Round totalAmount
    totalAmount = Number(totalAmount.toFixed(2));

    const purchasePayload = {
      supplier_id,
      purchase_date,
      invoice_ref,
      total_amount: totalAmount
    };

    // Atomic execution
    const purchaseId = await Database.query(null, 'rpc', {
      function: 'create_purchase_transaction',
      args: {
        purchase_payload: purchasePayload,
        items_payload: validatedItems
      }
    });

    // Log action to audit trail
    await logger.audit(req.user ? req.user.id : null, 'Create Purchase', 'purchases', purchaseId);

    reqRes.status(201).json({
      success: true,
      data: {
        id: purchaseId,
        ...purchasePayload,
        items: validatedItems
      }
    });
  } catch (error) {
    next(error);
  }
};
