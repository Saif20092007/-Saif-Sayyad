const express = require('express');
const router = express.Router();
const verifyController = require('../controllers/verifyController');

router.get('/:verify_token', verifyController.verifyInvoice);

module.exports = router;
