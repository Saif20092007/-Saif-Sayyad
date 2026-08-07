const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoiceController');

router.post('/', invoiceController.createInvoice);
router.get('/', invoiceController.getInvoices);
router.get('/:id', invoiceController.getInvoiceById);
router.get('/:id/pdf', invoiceController.getInvoicePDF);
router.post('/:id/regenerate-pdf', invoiceController.regeneratePDF);
router.put('/:id/cancel', invoiceController.cancelInvoice);
router.post('/:id/email', invoiceController.emailInvoice);

module.exports = router;
