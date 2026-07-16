const express = require('express');
const router = express.Router();
const companyProfileController = require('../controllers/companyProfileController');
const authMiddleware = require('../middleware/auth');

router.get('/', authMiddleware, companyProfileController.getCompanyProfile);
router.put('/', authMiddleware, companyProfileController.updateCompanyProfile);

module.exports = router;
