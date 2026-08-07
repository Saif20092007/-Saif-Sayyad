const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');

router.get('/gst', reportController.getGSTReport);
router.get('/gst/export', reportController.exportGSTReportToExcel);
router.get('/sales/export', reportController.exportSalesToExcel);

module.exports = router;
