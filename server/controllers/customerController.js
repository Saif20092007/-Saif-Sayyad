// Customer Controller
const Database = require('../database/db');
const validators = require('../validators/validators');
const logger = require('../utils/logger');

exports.getCustomers = async (req, reqRes, next) => {
  try {
    const customers = await Database.query('customers', 'select', { orderBy: 'name' });
    reqRes.json({ success: true, data: customers });
  } catch (error) {
    next(error);
  }
};

exports.getCustomerById = async (req, reqRes, next) => {
  try {
    const customer = await Database.query('customers', 'select', { id: req.params.id });
    if (!customer) {
      const err = new Error('Customer not found.');
      err.status = 404;
      return next(err);
    }
    reqRes.json({ success: true, data: customer });
  } catch (error) {
    next(error);
  }
};

exports.createCustomer = async (req, reqRes, next) => {
  try {
    const validation = validators.validateCustomer(req.body);
    if (!validation.isValid) {
      const err = new Error(validation.errors.join(' '));
      err.status = 400;
      return next(err);
    }

    const newCustomer = await Database.query('customers', 'insert', { data: req.body });
    await logger.audit(req.user ? req.user.id : null, 'Create Customer', 'customers', newCustomer.id);

    reqRes.status(201).json({ success: true, data: newCustomer });
  } catch (error) {
    next(error);
  }
};

exports.updateCustomer = async (req, reqRes, next) => {
  try {
    const validation = validators.validateCustomer(req.body);
    if (!validation.isValid) {
      const err = new Error(validation.errors.join(' '));
      err.status = 400;
      return next(err);
    }

    const updatedCustomer = await Database.query('customers', 'update', { id: req.params.id, data: req.body });
    await logger.audit(req.user ? req.user.id : null, 'Update Customer', 'customers', req.params.id);

    reqRes.json({ success: true, data: updatedCustomer });
  } catch (error) {
    next(error);
  }
};

exports.deleteCustomer = async (req, reqRes, next) => {
  try {
    await Database.query('customers', 'delete', { id: req.params.id });
    await logger.audit(req.user ? req.user.id : null, 'Delete Customer', 'customers', req.params.id);
    reqRes.json({ success: true, message: 'Customer deleted successfully.' });
  } catch (error) {
    next(error);
  }
};
