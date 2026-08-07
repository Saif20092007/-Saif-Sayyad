// Backup & Restore Service
const fs = require('fs');
const path = require('path');
const Database = require('../database/db');
const logger = require('../utils/logger');

const backupDir = path.join(__dirname, '../storage/backups');

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

// Perform full database dump as a structured JSON object
async function dumpDatabase() {
  const isMockMode = process.env.USE_MOCK_DB === 'true' ||
                     !process.env.SUPABASE_URL ||
                     process.env.SUPABASE_URL.includes('your-project.supabase.co');

  if (isMockMode) {
    const mockDbPath = path.join(__dirname, '../database/mock_db.json');
    if (fs.existsSync(mockDbPath)) {
      return JSON.parse(fs.readFileSync(mockDbPath, 'utf8'));
    }
    throw new Error('Local mock database file not found.');
  } else {
    // Live Supabase mode: Dump all tables
    const tables = [
      'settings', 'users', 'company_profile', 'customers',
      'suppliers', 'products', 'stock', 'invoices',
      'invoice_items', 'invoice_counters', 'payments', 'audit_logs'
    ];

    const backupData = {};
    for (const table of tables) {
      try {
        const data = await Database.query(table, 'select');
        backupData[table] = data || [];
      } catch (err) {
        backupData[table] = [];
        console.error(`Failed to dump table ${table} during backup:`, err);
      }
    }
    return backupData;
  }
}

// Restore a database dump
async function restoreDatabase(backupData) {
  const isMockMode = process.env.USE_MOCK_DB === 'true' ||
                     !process.env.SUPABASE_URL ||
                     process.env.SUPABASE_URL.includes('your-project.supabase.co');

  if (isMockMode) {
    const mockDbPath = path.join(__dirname, '../database/mock_db.json');
    fs.writeFileSync(mockDbPath, JSON.stringify(backupData, null, 2), 'utf8');
    return true;
  } else {
    // Live Supabase mode: Restore tables by inserting
    const { supabaseAdmin } = require('../config/supabase');
    const tables = [
      'settings', 'users', 'company_profile', 'customers',
      'suppliers', 'products', 'stock', 'invoices',
      'invoice_items', 'invoice_counters', 'payments', 'audit_logs'
    ];

    for (const table of tables) {
      if (backupData[table] && Array.isArray(backupData[table])) {
        // Delete existing rows
        const { error: delErr } = await supabaseAdmin.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (delErr) {
          console.error(`Error clearing table ${table} during restore:`, delErr);
        }

        // Batch insert new records if any
        if (backupData[table].length > 0) {
          const { error: insErr } = await supabaseAdmin.from(table).insert(backupData[table]);
          if (insErr) {
            console.error(`Error inserting table ${table} during restore:`, insErr);
          }
        }
      }
    }
    return true;
  }
}

// Background auto backup scheduler
let lastBackupDate = '';

function startAutoBackupScheduler() {
  logger.info('Auto-backup scheduler initialized.');

  setInterval(async () => {
    try {
      // Get settings
      const settingsList = await Database.query('settings', 'select');
      const settings = settingsList && settingsList.length > 0 ? settingsList[0] : null;
      if (!settings) return;

      const backupTime = settings.backup_time || '02:00:00'; // HH:MM:SS format
      const targetHHMM = backupTime.slice(0, 5); // HH:MM

      const now = new Date();
      const currentHHMM = now.toTimeString().slice(0, 5);
      const currentDateStr = now.toISOString().split('T')[0];

      if (currentHHMM === targetHHMM && lastBackupDate !== currentDateStr) {
        logger.info(`Starting automatic daily database backup for ${currentDateStr}...`);
        const dump = await dumpDatabase();

        const filename = `autobackup_${currentDateStr}_${Date.now()}.json`;
        const filepath = path.join(backupDir, filename);
        fs.writeFileSync(filepath, JSON.stringify(dump, null, 2), 'utf8');

        lastBackupDate = currentDateStr;
        logger.info(`Automatic daily database backup successful: ${filename}`);
      }
    } catch (err) {
      console.error('Error in automatic background backup scheduler:', err);
    }
  }, 60000); // Check once a minute
}

module.exports = {
  dumpDatabase,
  restoreDatabase,
  startAutoBackupScheduler,
  backupDir
};
