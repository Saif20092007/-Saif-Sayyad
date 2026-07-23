// Public Verification Controller
const Database = require('../database/db');

exports.verifyInvoice = async (req, reqRes, next) => {
  try {
    const { verify_token } = req.params;

    const invoices = await Database.query('invoices', 'select', {
      filters: { verify_token }
    });

    if (!invoices || invoices.length === 0) {
      const err = new Error('Invalid verification token. No invoice matches this record.');
      err.status = 404;
      return next(err);
    }

    const invoice = invoices[0];
    const profileList = await Database.query('company_profile', 'select');
    const profileName = profileList && profileList.length > 0 ? profileList[0].name : 'SS Plastotech';

    reqRes.json({
      success: true,
      data: {
        company_name: profileName,
        invoice_no: invoice.invoice_no,
        invoice_date: invoice.invoice_date,
        snapshot_customer_name: invoice.snapshot_customer_name,
        grand_total: invoice.grand_total,
        invoice_status: invoice.invoice_status
      }
    });
  } catch (error) {
    next(error);
  }
};
