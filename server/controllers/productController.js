// Product Controller (with integrated stock tracking mapping)
const Database = require('../database/db');
const validators = require('../validators/validators');
const logger = require('../utils/logger');

exports.getProducts = async (req, reqRes, next) => {
  try {
    const products = await Database.query('products', 'select', { orderBy: 'name' });

    // Efficiently batch query all stock records to avoid N+1 queries over network
    let stockList = [];
    try {
      stockList = await Database.query('stock', 'select') || [];
    } catch (err) {
      console.warn('Warning: could not fetch stock list, defaulting stock to 0');
    }

    const stockMap = {};
    if (stockList && Array.isArray(stockList)) {
      stockList.forEach(s => {
        stockMap[s.product_id] = s.quantity_available;
      });
    }

    const finalProducts = products.map(p => ({
      ...p,
      stock: stockMap[p.id] !== undefined ? stockMap[p.id] : 0
    }));

    reqRes.json({ success: true, data: finalProducts });
  } catch (error) {
    next(error);
  }
};

exports.getProductById = async (req, reqRes, next) => {
  try {
    const product = await Database.query('products', 'select', { id: req.params.id });
    if (!product) {
      const err = new Error('Product not found.');
      err.status = 404;
      return next(err);
    }

    let qty = 0;
    try {
      const stockList = await Database.query('stock', 'select', { filters: { product_id: product.id } });
      if (stockList && stockList.length > 0) {
        qty = stockList[0].quantity_available;
      }
    } catch (e) {}

    reqRes.json({
      success: true,
      data: {
        ...product,
        stock: qty
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.createProduct = async (req, reqRes, next) => {
  try {
    const validation = validators.validateProduct(req.body);
    if (!validation.isValid) {
      const err = new Error(validation.errors.join(' '));
      err.status = 400;
      return next(err);
    }

    const newProduct = await Database.query('products', 'insert', { data: req.body });
    await logger.audit(req.user ? req.user.id : null, 'Create Product', 'products', newProduct.id);

    reqRes.status(201).json({ success: true, data: newProduct });
  } catch (error) {
    next(error);
  }
};

exports.updateProduct = async (req, reqRes, next) => {
  try {
    const validation = validators.validateProduct(req.body);
    if (!validation.isValid) {
      const err = new Error(validation.errors.join(' '));
      err.status = 400;
      return next(err);
    }

    const updatedProduct = await Database.query('products', 'update', { id: req.params.id, data: req.body });
    await logger.audit(req.user ? req.user.id : null, 'Update Product', 'products', req.params.id);

    reqRes.json({ success: true, data: updatedProduct });
  } catch (error) {
    next(error);
  }
};

exports.deleteProduct = async (req, reqRes, next) => {
  try {
    await Database.query('products', 'delete', { id: req.params.id });
    await logger.audit(req.user ? req.user.id : null, 'Delete Product', 'products', req.params.id);
    reqRes.json({ success: true, message: 'Product deleted successfully.' });
  } catch (error) {
    next(error);
  }
};
