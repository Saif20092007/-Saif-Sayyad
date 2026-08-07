const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const authMiddleware = require('../middleware/auth');

router.get('/', authMiddleware, settingsController.getSettings);
router.put('/', authMiddleware, settingsController.updateSettings);
router.get('/audit-logs', authMiddleware, settingsController.getAuditLogs);
router.get('/backup', authMiddleware, settingsController.exportBackup);
router.post('/restore', authMiddleware, settingsController.importBackup);

module.exports = router;
