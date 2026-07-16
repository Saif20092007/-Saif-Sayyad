// Supplier Controller
const Database = require('../database/db');
const validators = require('../validators/validators');
const logger = require('../utils/logger');

exports.getSuppliers = async (req, reqRes, next) => {
  try {
    const suppliers = await Database.query('suppliers', 'select', { orderBy: 'name' });
    reqRes.json({ success: true, data: suppliers });
  } catch (error) {
    next(error);
  }
};

exports.getSupplierById = async (req, reqRes, next) => {
  try {
    const supplier = await Database.query('suppliers', 'select', { id: req.params.id });
    if (!supplier) {
      const err = new Error('Supplier not found.');
      err.status = 404;
      return next(err);
    }
    reqRes.json({ success: true, data: supplier });
  } catch (error) {
    next(error);
  }
};

exports.createSupplier = async (req, reqRes, next) => {
  try {
    const validation = validators.validateSupplier(req.body);
    if (!validation.isValid) {
      const err = new Error(validation.errors.join(' '));
      err.status = 400;
      return next(err);
    }

    const newSupplier = await Database.query('suppliers', 'insert', { data: req.body });
    await logger.audit(req.user ? req.user.id : null, 'Create Supplier', 'suppliers', newSupplier.id);

    reqRes.status(201).json({ success: true, data: newSupplier });
  } catch (error) {
    next(error);
  }
};

exports.updateSupplier = async (req, reqRes, next) => {
  try {
    const validation = validators.validateSupplier(req.body);
    if (!validation.isValid) {
      const err = new Error(validation.errors.join(' '));
      err.status = 400;
      return next(err);
    }

    const updatedSupplier = await Database.query('suppliers', 'update', { id: req.params.id, data: req.body });
    await logger.audit(req.user ? req.user.id : null, 'Update Supplier', 'suppliers', req.params.id);

    reqRes.json({ success: true, data: updatedSupplier });
  } catch (error) {
    next(error);
  }
};

exports.deleteSupplier = async (req, reqRes, next) => {
  try {
    await Database.query('suppliers', 'delete', { id: req.params.id });
    await logger.audit(req.user ? req.user.id : null, 'Delete Supplier', 'suppliers', req.params.id);
    reqRes.json({ success: true, message: 'Supplier deleted successfully.' });
  } catch (error) {
    next(error);
  }
};
