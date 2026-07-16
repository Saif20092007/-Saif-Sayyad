// Company Profile Controller
const Database = require('../database/db');
const validators = require('../validators/validators');
const logger = require('../utils/logger');

exports.getCompanyProfile = async (req, reqRes, next) => {
  try {
    const profiles = await Database.query('company_profile', 'select');
    if (!profiles || profiles.length === 0) {
      // Return a blank structure for first time initialization
      return reqRes.json({
        success: true,
        data: null
      });
    }
    reqRes.json({ success: true, data: profiles[0] });
  } catch (error) {
    next(error);
  }
};

exports.updateCompanyProfile = async (req, reqRes, next) => {
  try {
    const validation = validators.validateCompanyProfile(req.body);
    if (!validation.isValid) {
      const err = new Error(validation.errors.join(' '));
      err.status = 400;
      return next(err);
    }

    const profiles = await Database.query('company_profile', 'select');
    let result;
    if (!profiles || profiles.length === 0) {
      result = await Database.query('company_profile', 'insert', { data: req.body });
    } else {
      result = await Database.query('company_profile', 'update', { id: profiles[0].id, data: req.body });
    }

    await logger.audit(req.user ? req.user.id : null, 'Update Company Profile', 'company_profile', result.id);
    reqRes.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};
