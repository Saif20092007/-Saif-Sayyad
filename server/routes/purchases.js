const express = require('express');
const router = express.Router();
const purchaseController = require('../controllers/purchaseController');

router.get('/', purchaseController.getPurchases);
router.get('/:id', purchaseController.getPurchaseById);
router.post('/', purchaseController.createPurchase);

module.exports = router;
