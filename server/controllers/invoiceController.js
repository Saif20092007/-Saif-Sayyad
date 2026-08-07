// Invoice Management Controllers
const Database = require('../database/db');
const validators = require('../validators/validators');
const calculateGST = require('../utils/gstCalculator');
const logger = require('../utils/logger');
const pdfService = require('../services/pdfService');

function getFinancialYear(dateStr) {
  const date = new Date(dateStr);
  const month = date.getMonth(); // 0-indexed (0=Jan, 3=April)
  const year = date.getFullYear();
  if (month >= 3) { // April or later
    return `${year}-${String(year + 1).slice(-2)}`;
  } else {
    return `${year - 1}-${String(year).slice(-2)}`;
  }
}

exports.createInvoice = async (req, reqRes, next) => {
  try {
    // 1. Validation
    const validation = validators.validateInvoice(req.body);
    if (!validation.isValid) {
      const err = new Error(validation.errors.join(' '));
      err.status = 400;
      return next(err);
    }

    const { customer_id, invoice_date, po_number, place_of_supply, tax_type, items, signature_mode, copy_type } = req.body;

    // 2. Verify Customer Exists
    const customer = await Database.query('customers', 'select', { id: customer_id });
    if (!customer) {
      const err = new Error('Customer does not exist.');
      err.status = 400;
      return next(err);
    }

    // 3. Verify Products Exist
    const validatedItems = [];
    for (const item of items) {
      const product = await Database.query('products', 'select', { id: item.product_id });
      if (!product) {
        const err = new Error(`Product with ID ${item.product_id} does not exist.`);
        err.status = 400;
        return next(err);
      }
      validatedItems.push({
        product_id: item.product_id,
        qty: Number(item.qty),
        rate: Number(item.rate),
        gst_percent: Number(product.gst_percent),
        snapshot_description: product.name,
        snapshot_hsn: product.hsn_code
      });
    }

    // 4. Compute GST Calculations
    const gstResult = calculateGST(validatedItems, tax_type);

    // 5. Prepare Payload for Atomic DB Transaction
    const fy = getFinancialYear(invoice_date);
    const invoicePayload = {
      financial_year: fy,
      invoice_date,
      customer_id,
      po_number: po_number || null,
      place_of_supply,
      tax_type,
      taxable_value: gstResult.taxable_value,
      cgst_total: gstResult.cgst_total,
      sgst_total: gstResult.sgst_total,
      igst_total: gstResult.igst_total,
      round_off: gstResult.round_off,
      grand_total: gstResult.grand_total,
      copy_type: copy_type || 'Original',
      is_signed_digital: signature_mode === 'online',
      snapshot_customer_name: customer.name,
      snapshot_customer_address: customer.billing_address,
      snapshot_customer_gstin: customer.gstin || null
    };

    // 6. Invoke Atomic Create Stored Procedure / Transaction Fallback
    let invoiceId;
    try {
      invoiceId = await Database.query(null, 'rpc', {
        function: 'create_invoice_transaction',
        args: {
          invoice_payload: invoicePayload,
          items_payload: gstResult.lines
        }
      });
    } catch (txErr) {
      if (txErr.message && txErr.message.includes('Insufficient stock')) {
        const err = new Error(txErr.message);
        err.status = 409; // Conflict
        return next(err);
      }
      throw txErr;
    }

    // 7. Async decoupled PDF generation
    pdfService.generateInvoicePDF(invoiceId).catch(err => {
      console.error('Asynchronous PDF generation failure on create:', err);
    });

    // 8. Audit Log & Output
    await logger.audit(req.user ? req.user.id : null, 'Create Invoice', 'invoices', invoiceId);

    // Fetch the newly created invoice with sequence details to return
    const createdInvoice = await Database.query('invoices', 'select', { id: invoiceId });

    reqRes.status(201).json({
      success: true,
      data: createdInvoice
    });
  } catch (error) {
    next(error);
  }
};

const https = require('https');
const http = require('http');

function fetchPdfBuffer(pdfUrl) {
  return new Promise((resolve, reject) => {
    if (pdfUrl.startsWith('/storage/')) {
      // Local file
      const localPath = path.join(__dirname, '../../client', pdfUrl);
      fs.readFile(localPath, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    } else {
      // Remote URL
      const client = pdfUrl.startsWith('https') ? https : http;
      client.get(pdfUrl, (res) => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', err => reject(err));
      }).on('error', err => reject(err));
    }
  });
}

exports.emailInvoice = async (req, reqRes, next) => {
  try {
    const invoiceId = req.params.id;
    const invoice = await Database.query('invoices', 'select', { id: invoiceId });
    if (!invoice) {
      const err = new Error('Invoice not found.');
      err.status = 404;
      return next(err);
    }

    // Look up customer email
    const customer = await Database.query('customers', 'select', { id: invoice.customer_id });
    const targetEmail = customer ? customer.email : null;

    if (!targetEmail || targetEmail.trim() === '') {
      const err = new Error('Customer does not have a registered email address.');
      err.status = 400;
      return next(err);
    }

    // Ensure PDF is generated
    let pdfUrl = invoice.pdf_url;
    if (!pdfUrl || invoice.pdf_generation_status !== 'success') {
      // Try generating it synchronously now
      pdfUrl = await pdfService.generateInvoicePDF(invoiceId);
    }

    // Retrieve PDF buffer
    let pdfBuffer;
    try {
      pdfBuffer = await fetchPdfBuffer(pdfUrl);
    } catch (err) {
      const error = new Error(`Failed to retrieve invoice PDF attachment: ${err.message}`);
      error.status = 500;
      return next(error);
    }

    const emailUser = process.env.EMAIL_USERNAME || '';
    const emailPass = process.env.EMAIL_PASSWORD || '';
    const isMockEmail = emailUser.includes('example.com') || emailUser === '' || emailPass === 'emailpassword';

    const subject = `Tax Invoice ${invoice.invoice_no} from SS Plastotech`;
    const textBody = `Dear ${customer.name},\n\nPlease find attached tax invoice ${invoice.invoice_no} dated ${new Date(invoice.invoice_date).toLocaleDateString('en-GB')} from SS Plastotech.\n\nTotal Amount Due: INR ${Number(invoice.grand_total).toFixed(2)}\n\nThank you for your business!\n\nBest Regards,\nSS Plastotech ERP`;

    if (isMockEmail) {
      logger.info(`[MOCK EMAIL SENT] to: ${targetEmail} | Subject: ${subject}`);
      logger.info(`Attachment details: file="${invoice.invoice_no.replace(/\//g, '_')}.pdf" size=${pdfBuffer.length} bytes`);
      reqRes.json({
        success: true,
        message: `Email simulation successful. Dispatched to: ${targetEmail}`
      });
    } else {
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com', // or generic smtp
        port: 465,
        secure: true,
        auth: {
          user: emailUser,
          pass: emailPass
        }
      });

      await transporter.sendMail({
        from: `"SS Plastotech" <${emailUser}>`,
        to: targetEmail,
        subject: subject,
        text: textBody,
        attachments: [
          {
            filename: `${invoice.invoice_no.replace(/\//g, '_')}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf'
          }
        ]
      });

      reqRes.json({
        success: true,
        message: `Invoice emailed successfully to ${targetEmail}.`
      });
    }
  } catch (error) {
    next(error);
  }
};

exports.cancelInvoice = async (req, reqRes, next) => {
  try {
    const invoiceId = req.params.id;

    // Check if invoice exists
    const invoice = await Database.query('invoices', 'select', { id: invoiceId });
    if (!invoice) {
      const err = new Error('Invoice not found.');
      err.status = 404;
      return next(err);
    }

    if (invoice.invoice_status === 'Cancelled') {
      const err = new Error('Invoice is already cancelled.');
      err.status = 400;
      return next(err);
    }

    // Call atomic cancel RPC
    await Database.query(null, 'rpc', {
      function: 'cancel_invoice_transaction',
      args: { p_invoice_id: invoiceId }
    });

    // Log the action to audit logs
    await logger.audit(req.user ? req.user.id : null, 'Cancel Invoice', 'invoices', invoiceId);

    reqRes.json({
      success: true,
      message: 'Invoice cancelled successfully and stock restored.'
    });
  } catch (error) {
    next(error);
  }
};

exports.getInvoices = async (req, reqRes, next) => {
  try {
    const invoices = await Database.query('invoices', 'select', { orderBy: 'created_at', ascending: false });
    reqRes.json({ success: true, data: invoices });
  } catch (error) {
    next(error);
  }
};

exports.getInvoiceById = async (req, reqRes, next) => {
  try {
    const invoice = await Database.query('invoices', 'select', { id: req.params.id });
    if (!invoice) {
      const err = new Error('Invoice not found.');
      err.status = 404;
      return next(err);
    }
    const items = await Database.query('invoice_items', 'select', { filters: { invoice_id: req.params.id } });
    reqRes.json({
      success: true,
      data: {
        ...invoice,
        items
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.getInvoicePDF = async (req, reqRes, next) => {
  try {
    const invoice = await Database.query('invoices', 'select', { id: req.params.id });
    if (!invoice) {
      const err = new Error('Invoice not found.');
      err.status = 404;
      return next(err);
    }
    reqRes.json({
      success: true,
      pdf_url: invoice.pdf_url,
      pdf_generation_status: invoice.pdf_generation_status
    });
  } catch (error) {
    next(error);
  }
};

exports.regeneratePDF = async (req, reqRes, next) => {
  try {
    const invoice = await Database.query('invoices', 'select', { id: req.params.id });
    if (!invoice) {
      const err = new Error('Invoice not found.');
      err.status = 404;
      return next(err);
    }

    if (invoice.pdf_generation_status === 'success') {
      const err = new Error('Cannot regenerate a successfully generated finalized PDF.');
      err.status = 400;
      return next(err);
    }

    // Trigger regeneration
    const url = await pdfService.generateInvoicePDF(req.params.id);
    reqRes.json({
      success: true,
      pdf_url: url
    });
  } catch (error) {
    next(error);
  }
};
