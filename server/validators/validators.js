// Reusable format and range validation utilities for SS Plastotech ERP

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

const validators = {
  isValidEmail: (email) => {
    if (!email) return false;
    return EMAIL_REGEX.test(email);
  },

  isValidGSTIN: (gstin) => {
    if (!gstin) return false;
    return GSTIN_REGEX.test(gstin.toUpperCase());
  },

  isValidPAN: (pan) => {
    if (!pan) return false;
    return PAN_REGEX.test(pan.toUpperCase());
  },

  validateCustomer: (data) => {
    const errors = [];
    if (!data.name || typeof data.name !== 'string' || data.name.trim() === '') {
      errors.push('Customer name is required.');
    }
    if (data.email && !validators.isValidEmail(data.email)) {
      errors.push('Invalid email format.');
    }
    if (data.gstin && !validators.isValidGSTIN(data.gstin)) {
      errors.push('Invalid GSTIN format. Expected format: 22AAAAA1111A1Z1');
    }
    if (!data.billing_address || typeof data.billing_address !== 'string' || data.billing_address.trim() === '') {
      errors.push('Billing address is required.');
    }
    if (!data.shipping_address || typeof data.shipping_address !== 'string' || data.shipping_address.trim() === '') {
      errors.push('Shipping address is required.');
    }
    if (!data.phone || typeof data.phone !== 'string' || data.phone.trim() === '') {
      errors.push('Phone number is required.');
    }
    return {
      isValid: errors.length === 0,
      errors
    };
  },

  validateSupplier: (data) => {
    const errors = [];
    if (!data.name || typeof data.name !== 'string' || data.name.trim() === '') {
      errors.push('Supplier name is required.');
    }
    if (data.email && !validators.isValidEmail(data.email)) {
      errors.push('Invalid email format.');
    }
    if (data.gstin && !validators.isValidGSTIN(data.gstin)) {
      errors.push('Invalid GSTIN format. Expected format: 22AAAAA1111A1Z1');
    }
    if (!data.address || typeof data.address !== 'string' || data.address.trim() === '') {
      errors.push('Address is required.');
    }
    if (!data.phone || typeof data.phone !== 'string' || data.phone.trim() === '') {
      errors.push('Phone number is required.');
    }
    return {
      isValid: errors.length === 0,
      errors
    };
  },

  validateProduct: (data) => {
    const errors = [];
    if (!data.name || typeof data.name !== 'string' || data.name.trim() === '') {
      errors.push('Product name is required.');
    }
    if (!data.hsn_code || typeof data.hsn_code !== 'string' || data.hsn_code.trim() === '') {
      errors.push('HSN Code is required.');
    }
    if (data.gst_percent === undefined || data.gst_percent === null || isNaN(Number(data.gst_percent)) || Number(data.gst_percent) < 0) {
      errors.push('GST percentage must be a number greater than or equal to 0.');
    }
    if (data.default_rate === undefined || data.default_rate === null || isNaN(Number(data.default_rate)) || Number(data.default_rate) < 0) {
      errors.push('Default rate must be a number greater than or equal to 0.');
    }
    if (!data.unit || typeof data.unit !== 'string' || data.unit.trim() === '') {
      errors.push('Product unit is required (e.g. NOS, KGS).');
    }
    return {
      isValid: errors.length === 0,
      errors
    };
  },

  validateCompanyProfile: (data) => {
    const errors = [];
    if (!data.name || typeof data.name !== 'string' || data.name.trim() === '') {
      errors.push('Company name is required.');
    }
    if (!data.address || typeof data.address !== 'string' || data.address.trim() === '') {
      errors.push('Address is required.');
    }
    if (!data.gstin || !validators.isValidGSTIN(data.gstin)) {
      errors.push('Valid GSTIN is required.');
    }
    if (!data.pan || !validators.isValidPAN(data.pan)) {
      errors.push('Valid PAN is required.');
    }
    if (!data.email || !validators.isValidEmail(data.email)) {
      errors.push('Valid email is required.');
    }
    if (!data.phone || typeof data.phone !== 'string' || data.phone.trim() === '') {
      errors.push('Phone number is required.');
    }
    if (!data.bank_name || typeof data.bank_name !== 'string' || data.bank_name.trim() === '') {
      errors.push('Bank name is required.');
    }
    if (!data.bank_account_no || typeof data.bank_account_no !== 'string' || data.bank_account_no.trim() === '') {
      errors.push('Bank account number is required.');
    }
    if (!data.bank_ifsc || typeof data.bank_ifsc !== 'string' || data.bank_ifsc.trim() === '') {
      errors.push('Bank IFSC is required.');
    }
    return {
      isValid: errors.length === 0,
      errors
    };
  }
};

module.exports = validators;
