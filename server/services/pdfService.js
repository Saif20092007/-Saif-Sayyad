// PDF Generation Service using Puppeteer.
// Renders professional, byte-identical invoice PDFs matching the reference image.

const puppeteer = require('puppeteer');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const Database = require('../database/db');
const numberToWords = require('../utils/numberToWords');

exports.generateInvoicePDF = async (invoiceId) => {
  let browser;
  try {
    // 1. Fetch full detailed invoice, line items, and company profile
    const invoice = await Database.query('invoices', 'select', { id: invoiceId });
    if (!invoice) throw new Error('Invoice not found');

    const items = await Database.query('invoice_items', 'select', { filters: { invoice_id: invoiceId } });
    const profileList = await Database.query('company_profile', 'select');
    const profile = profileList && profileList.length > 0 ? profileList[0] : null;

    if (!profile) {
      throw new Error('Company profile must be configured before generating PDFs');
    }

    // 2. Generate Verification QR code base64
    const publicAppUrl = process.env.PUBLIC_APP_URL || '';
    if (process.env.NODE_ENV === 'production' && (!publicAppUrl || publicAppUrl.trim() === '')) {
      throw new Error('PUBLIC_APP_URL environment variable is missing or empty in production mode.');
    }
    const baseUrl = publicAppUrl.trim() !== ''
      ? publicAppUrl.replace(/\/$/, '')
      : `http://${process.env.HOST || 'localhost'}:${process.env.PORT || '5000'}`;

    const verifyUrl = `${baseUrl}/verify/${invoice.verify_token}`;
    const qrBase64 = await qrcode.toDataURL(verifyUrl, { margin: 1, width: 140 });

    // 3. Prepare amount in words
    const amountInWordsStr = numberToWords(invoice.grand_total) + ' ONLY';

    // 4. Determine tax values per line
    const rowsHtml = items.map((item, index) => {
      const gstLabel = invoice.tax_type === 'CGST_SGST'
        ? `${Number(item.snapshot_gst_percent) / 2}%`
        : `${item.snapshot_gst_percent}%`;

      return `
        <tr class="item-row">
          <td class="text-center font-mono" style="padding: 6px;">${index + 1}</td>
          <td style="padding: 6px; font-weight: 600;">${item.snapshot_description}</td>
          <td class="text-center font-mono" style="padding: 6px;">${item.snapshot_hsn}</td>
          <td class="text-center font-mono" style="padding: 6px;">${item.snapshot_gst_percent}%</td>
          <td class="text-center font-mono" style="padding: 6px;">${Number(item.qty).toFixed(0)}</td>
          <td class="text-right font-mono" style="padding: 6px;">${Number(item.rate).toFixed(2)}</td>
          <td class="text-right font-mono" style="padding: 6px;">${Number(item.taxable_amount).toFixed(2)}</td>
          ${invoice.tax_type === 'CGST_SGST' ? `
            <td class="text-right font-mono" style="padding: 6px;">${Number(item.cgst_amount).toFixed(2)}</td>
            <td class="text-right font-mono" style="padding: 6px;">${Number(item.sgst_amount).toFixed(2)}</td>
          ` : `
            <td class="text-right font-mono" style="padding: 6px;" colspan="2">${Number(item.igst_amount).toFixed(2)}</td>
          `}
          <td class="text-right font-mono" style="padding: 6px; font-weight: 700;">${Number(item.line_total).toFixed(2)}</td>
        </tr>
      `;
    }).join('');

    const formattedDate = new Date(invoice.invoice_date).toLocaleDateString('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });

    const copyLabel = invoice.copy_type === 'Original' ? 'ORIGINAL FOR RECIPIENT' :
                     invoice.copy_type === 'Duplicate' ? 'DUPLICATE FOR TRANSPORTER' :
                     'TRIPLICATE FOR SUPPLIER';

    // 5. Construct highly-polished HTML layout
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
          body {
            font-family: 'Inter', sans-serif;
            margin: 0;
            padding: 20px;
            color: #1e293b;
            font-size: 11px;
            line-height: 1.4;
            background: #fff;
          }
          .border-box {
            border: 1.5px solid #0f172a;
            border-radius: 4px;
            overflow: hidden;
          }
          .header-table {
            width: 100%;
            border-collapse: collapse;
            border-bottom: 1.5px solid #0f172a;
          }
          .header-table td {
            padding: 10px;
            vertical-align: top;
          }
          .company-title {
            font-size: 16px;
            font-weight: 800;
            color: #0f172a;
            margin: 0 0 4px 0;
            letter-spacing: -0.025em;
          }
          .copy-tag {
            background: #f1f5f9;
            border: 1px solid #cbd5e1;
            padding: 4px 8px;
            font-weight: 700;
            border-radius: 3px;
            text-align: center;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }
          .info-table {
            width: 100%;
            border-collapse: collapse;
            border-bottom: 1.5px solid #0f172a;
          }
          .info-table td {
            width: 50%;
            padding: 8px 12px;
            border-right: 1.5px solid #0f172a;
            vertical-align: top;
          }
          .info-table td:last-child {
            border-right: none;
          }
          .section-title {
            font-size: 11px;
            font-weight: 700;
            color: #475569;
            text-transform: uppercase;
            border-bottom: 1px solid #cbd5e1;
            padding-bottom: 4px;
            margin-bottom: 6px;
            letter-spacing: 0.025em;
          }
          .item-table {
            width: 100%;
            border-collapse: collapse;
            border-bottom: 1.5px solid #0f172a;
          }
          .item-table th {
            background: #f8fafc;
            border-bottom: 1.5px solid #0f172a;
            border-right: 1px solid #cbd5e1;
            padding: 8px 6px;
            font-weight: 700;
            text-align: center;
            text-transform: uppercase;
            font-size: 9.5px;
          }
          .item-table th:last-child {
            border-right: none;
          }
          .item-row td {
            border-bottom: 1px solid #e2e8f0;
            border-right: 1px solid #cbd5e1;
          }
          .item-row td:last-child {
            border-right: none;
          }
          .summary-container {
            display: flex;
            border-bottom: 1.5px solid #0f172a;
          }
          .summary-left {
            width: 60%;
            padding: 12px;
            border-right: 1.5px solid #0f172a;
          }
          .summary-right {
            width: 40%;
          }
          .summary-table {
            width: 100%;
            border-collapse: collapse;
          }
          .summary-table td {
            padding: 6px 12px;
            border-bottom: 1px solid #e2e8f0;
          }
          .summary-table tr:last-child td {
            border-bottom: none;
          }
          .footer-container {
            display: flex;
            min-height: 110px;
          }
          .footer-left {
            width: 50%;
            padding: 12px;
            border-right: 1.5px solid #0f172a;
          }
          .footer-right {
            width: 50%;
            padding: 12px;
            text-align: right;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            align-items: flex-end;
          }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .font-semibold { font-weight: 600; }
          .font-bold { font-weight: 700; }
          .font-mono { font-family: monospace; }
        </style>
      </head>
      <body>
        <div class="border-box">
          <!-- Header section -->
          <table class="header-table">
            <tr>
              <td style="width: 15%;">
                ${profile.logo_url ? `<img src="${profile.logo_url}" style="max-height: 55px; max-width: 100%;" />` : `<div style="width:55px; height:55px; border:1px dashed #cbd5e1;"></div>`}
              </td>
              <td style="width: 55%;">
                <h1 class="company-title">${profile.name}</h1>
                <div style="color: #475569; font-size: 10px; line-height: 1.3;">
                  ${profile.address}<br/>
                  Phone: ${profile.phone} | Email: ${profile.email}<br/>
                  <strong>GSTIN:</strong> ${profile.gstin} | <strong>PAN:</strong> ${profile.pan} ${profile.cin ? `| <strong>CIN:</strong> ${profile.cin}` : ''}
                </div>
              </td>
              <td style="width: 30%; text-align: right;" class="text-right">
                <div class="copy-tag" style="margin-bottom: 8px;">${copyLabel}</div>
                <img src="${qrBase64}" style="width: 75px; height: 75px;" />
              </td>
            </tr>
          </table>

          <!-- Meta and Customer Details -->
          <table class="info-table">
            <tr>
              <td>
                <div class="section-title">Bill To / Ship To Details</div>
                <div style="font-size: 11px; font-weight: 700; color: #0f172a; margin-bottom: 4px;">${invoice.snapshot_customer_name}</div>
                <div style="color: #475569; line-height: 1.35; margin-bottom: 6px;">
                  ${invoice.snapshot_customer_address}
                </div>
                ${invoice.snapshot_customer_gstin ? `<strong>GSTIN:</strong> <span class="font-mono">${invoice.snapshot_customer_gstin}</span>` : '<strong>GSTIN:</strong> N/A'}
              </td>
              <td>
                <div class="section-title">Invoice Information</div>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr style="height: 22px;">
                    <td style="width: 45%; padding: 2px 0;" class="font-semibold">Invoice No:</td>
                    <td style="width: 55%; padding: 2px 0;" class="font-bold font-mono text-indigo-700">${invoice.invoice_no}</td>
                  </tr>
                  <tr style="height: 22px;">
                    <td style="padding: 2px 0;" class="font-semibold">Invoice Date:</td>
                    <td style="padding: 2px 0;" class="font-mono">${formattedDate}</td>
                  </tr>
                  <tr style="height: 22px;">
                    <td style="padding: 2px 0;" class="font-semibold">PO Number:</td>
                    <td style="padding: 2px 0;" class="font-mono">${invoice.po_number || 'NA'}</td>
                  </tr>
                  <tr style="height: 22px;">
                    <td style="padding: 2px 0;" class="font-semibold">Place of Supply:</td>
                    <td style="padding: 2px 0;">${invoice.place_of_supply}</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <!-- Line Items Table -->
          <table class="item-table">
            <thead>
              <tr>
                <th style="width: 5%;">#</th>
                <th style="width: 35%;">Description & Specification of Goods</th>
                <th style="width: 10%;">HSN Code</th>
                <th style="width: 8%;">GST</th>
                <th style="width: 6%;">Qty</th>
                <th style="width: 10%;">Rate (₹)</th>
                <th style="width: 10%;">Taxable (₹)</th>
                ${invoice.tax_type === 'CGST_SGST' ? `
                  <th style="width: 8%;">CGST (₹)</th>
                  <th style="width: 8%;">SGST (₹)</th>
                ` : `
                  <th style="width: 16%;" colspan="2">IGST (₹)</th>
                `}
                <th style="width: 10%;">Total (₹)</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <!-- Summary Block -->
          <div class="summary-container">
            <div class="summary-left">
              <div class="section-title" style="margin-bottom: 8px;">Amount in Words</div>
              <div style="font-weight: 700; font-size: 10.5px; color: #0f172a; line-height: 1.4;">
                ${amountInWordsStr}
              </div>
              <div style="margin-top: 15px; font-size: 9px; color: #64748b;">
                <strong>Terms & Conditions:</strong><br/>
                Payment is due on delivery or as agreed. Goods once sold will not be taken back. All disputes subject to local jurisdiction.
              </div>
            </div>
            <div class="summary-right">
              <table class="summary-table">
                <tr>
                  <td class="font-semibold" style="width: 55%;">Taxable Value:</td>
                  <td class="text-right font-mono font-semibold" style="width: 45%;">₹${Number(invoice.taxable_value).toFixed(2)}</td>
                </tr>
                ${invoice.tax_type === 'CGST_SGST' ? `
                  <tr>
                    <td style="padding-left: 20px; color: #475569;">Add: CGST Total:</td>
                    <td class="text-right font-mono" style="color: #475569;">₹${Number(invoice.cgst_total).toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td style="padding-left: 20px; color: #475569;">Add: SGST Total:</td>
                    <td class="text-right font-mono" style="color: #475569;">₹${Number(invoice.sgst_total).toFixed(2)}</td>
                  </tr>
                ` : `
                  <tr>
                    <td style="padding-left: 20px; color: #475569;">Add: IGST Total:</td>
                    <td class="text-right font-mono" style="color: #475569;">₹${Number(invoice.igst_total).toFixed(2)}</td>
                  </tr>
                `}
                <tr>
                  <td class="font-semibold">Round Off:</td>
                  <td class="text-right font-mono">${invoice.round_off >= 0 ? '+' : ''}${Number(invoice.round_off).toFixed(2)}</td>
                </tr>
                <tr style="background: #f8fafc; font-size: 12px;">
                  <td class="font-bold" style="color: #0f172a; padding: 10px 12px;">Grand Total:</td>
                  <td class="text-right font-mono font-bold" style="color: #4f46e5; padding: 10px 12px;">₹${Number(invoice.grand_total).toFixed(2)}</td>
                </tr>
              </table>
            </div>
          </div>

          <!-- Bottom Footer Details -->
          <div class="footer-container">
            <div class="footer-left">
              <div class="section-title">Bank Details</div>
              <table style="width: 100%; border-collapse: collapse; line-height: 1.4;">
                <tr>
                  <td class="font-semibold" style="width: 35%;">Bank:</td>
                  <td>${profile.bank_name}</td>
                </tr>
                <tr>
                  <td class="font-semibold">A/C No:</td>
                  <td class="font-mono">${profile.bank_account_no}</td>
                </tr>
                <tr>
                  <td class="font-semibold">IFSC Code:</td>
                  <td class="font-mono">${profile.bank_ifsc}</td>
                </tr>
              </table>
            </div>
            <div class="footer-right">
              <span style="font-weight: 700; font-size: 9px; text-transform: uppercase;">For ${profile.name}</span>
              ${invoice.is_signed_digital && profile.signature_image_url ? `
                <img src="${profile.signature_image_url}" style="max-height: 45px; max-width: 160px; margin: 4px 0;" />
              ` : `<div style="height: 45px;"></div>`}
              <span class="font-bold" style="font-size: 9.5px; border-top: 1px dashed #0f172a; padding-top: 4px; width: 180px; text-align: center;">Authorised Signatory</span>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    // 6. Generate PDF via Puppeteer (returns Buffer)
    browser = await puppeteer.launch({
      headless: 'shell',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' }
    });

    const isMockMode = process.env.USE_MOCK_DB === 'true' ||
                       !process.env.SUPABASE_URL ||
                       process.env.SUPABASE_URL.includes('your-project.supabase.co');

    let finalPdfUrl;

    if (isMockMode) {
      // Ensure storage path directories exist
      const storageDir = path.join(__dirname, '../storage/pdfs');
      if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
      }

      const pdfFilename = `${invoice.invoice_no.replace(/\//g, '_')}.pdf`;
      const pdfPath = path.join(storageDir, pdfFilename);
      fs.writeFileSync(pdfPath, pdfBuffer);
      finalPdfUrl = `/storage/pdfs/${pdfFilename}`;
    } else {
      // Live Supabase mode: upload to Supabase Storage
      const { supabaseAdmin } = require('../config/supabase');
      const bucketName = 'invoices';

      // Attempt bucket creation if not exists, but ignore errors if it exists
      try {
        await supabaseAdmin.storage.createBucket(bucketName, { public: true });
      } catch (bucketErr) {
        // Ignored if bucket exists
      }

      const storagePath = `${invoice.financial_year}/${invoice.invoice_no.replace(/\//g, '_')}.pdf`;

      const { data, error } = await supabaseAdmin.storage
        .from(bucketName)
        .upload(storagePath, pdfBuffer, {
          contentType: 'application/pdf',
          upsert: true
        });

      if (error) {
        throw new Error(`Supabase Storage upload failed: ${error.message}`);
      }

      const { data: urlData } = supabaseAdmin.storage
        .from(bucketName)
        .getPublicUrl(storagePath);

      finalPdfUrl = urlData.publicUrl;
    }

    // 7. Update PDF creation status
    await Database.query('invoices', 'update', {
      id: invoiceId,
      data: {
        pdf_url: finalPdfUrl,
        pdf_generation_status: 'success'
      }
    });

    return finalPdfUrl;
  } catch (error) {
    console.error('Puppeteer generation error:', error);
    try {
      await Database.query('invoices', 'update', {
        id: invoiceId,
        data: { pdf_generation_status: 'failed' }
      });
    } catch (e) {}
    throw error;
  } finally {
    if (browser) await browser.close();
  }
};
