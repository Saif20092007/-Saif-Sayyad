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
  },

  validateInvoice: (data) => {
    const errors = [];
    if (!data.customer_id) {
      errors.push('Customer ID is required.');
    }
    if (!data.invoice_date) {
      errors.push('Invoice date is required.');
    }
    if (!data.place_of_supply || typeof data.place_of_supply !== 'string' || data.place_of_supply.trim() === '') {
      errors.push('Place of supply is required.');
    }
    if (!data.tax_type || !['CGST_SGST', 'IGST'].includes(data.tax_type)) {
      errors.push('Tax type must be CGST_SGST or IGST.');
    }
    if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
      errors.push('At least one line item is required.');
    } else if (data.items.length > 50) {
      errors.push('An invoice cannot contain more than 50 line items.');
    } else {
      data.items.forEach((item, index) => {
        if (!item.product_id) {
          errors.push(`Item #${index + 1} is missing product ID.`);
        }
        const qty = Number(item.qty);
        if (isNaN(qty) || qty <= 0 || qty > 100000) {
          errors.push(`Item #${index + 1} quantity must be a positive number greater than 0 and up to 100,000.`);
        }
        const rate = Number(item.rate);
        if (isNaN(rate) || rate < 0 || rate > 10000000) {
          errors.push(`Item #${index + 1} rate must be greater than or equal to 0 and up to 10,000,000.`);
        }
      });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
};

module.exports = validators;
