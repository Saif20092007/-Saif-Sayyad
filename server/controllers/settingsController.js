// Settings Controller
const Database = require('../database/db');
const logger = require('../utils/logger');
const backupService = require('../services/backupService');

exports.exportBackup = async (req, reqRes, next) => {
  try {
    const dump = await backupService.dumpDatabase();

    reqRes.setHeader('Content-Type', 'application/json');
    reqRes.setHeader('Content-Disposition', `attachment; filename=ss_plastotech_backup_${Date.now()}.json`);
    reqRes.send(JSON.stringify(dump, null, 2));
  } catch (error) {
    next(error);
  }
};

exports.importBackup = async (req, reqRes, next) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      const err = new Error('Invalid or empty backup data payload.');
      err.status = 400;
      return next(err);
    }

    await backupService.restoreDatabase(req.body);
    await logger.audit(req.user ? req.user.id : null, 'Restore Backup', 'settings', null);

    reqRes.json({
      success: true,
      message: 'Database backup restored successfully.'
    });
  } catch (error) {
    next(error);
  }
};

exports.getSettings = async (req, reqRes, next) => {
  try {
    const list = await Database.query('settings', 'select');
    if (!list || list.length === 0) {
      // Seed default settings if not exists
      const defaults = {
        inactivity_timeout_minutes: 60,
        invoice_prefix: 'SSPT',
        backup_time: '02:00:00'
      };
      const created = await Database.query('settings', 'insert', { data: defaults });
      return reqRes.json({ success: true, data: created });
    }
    reqRes.json({ success: true, data: list[0] });
  } catch (error) {
    next(error);
  }
};

exports.updateSettings = async (req, reqRes, next) => {
  try {
    const list = await Database.query('settings', 'select');
    let result;
    const updateData = {
      inactivity_timeout_minutes: Number(req.body.inactivity_timeout_minutes || 60),
      invoice_prefix: req.body.invoice_prefix || 'SSPT',
      backup_time: req.body.backup_time || '02:00:00'
    };

    if (!list || list.length === 0) {
      result = await Database.query('settings', 'insert', { data: updateData });
    } else {
      result = await Database.query('settings', 'update', { id: list[0].id, data: updateData });
    }

    await logger.audit(req.user ? req.user.id : null, 'Update Settings', 'settings', result.id);
    reqRes.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

exports.getAuditLogs = async (req, reqRes, next) => {
  try {
    const logs = await Database.query('audit_logs', 'select', { orderBy: 'created_at', ascending: false });
    reqRes.json({ success: true, data: logs });
  } catch (error) {
    next(error);
  }
};
