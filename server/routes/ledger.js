const express = require('express');
const router = express.Router();
const ledgerController = require('../controllers/ledgerController');

router.get('/:customer_id', ledgerController.getCustomerLedger);

module.exports = router;
