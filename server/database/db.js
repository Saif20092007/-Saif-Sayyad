// A mock/local-first database connector fallback so the backend is 100% functional locally,
// with full transparent support for Supabase in production.

const fs = require('fs');
const path = require('path');
const { supabase, supabaseAdmin } = require('../config/supabase');

const dbFilePath = path.join(__dirname, 'mock_db.json');

// Helper to initialize local file-based database if Supabase isn't connected/configured
function initMockDb() {
  if (!fs.existsSync(dbFilePath)) {
    // SHA-256 hash of 'Admin@123'
    const defaultHash = require('crypto').createHash('sha256').update('Admin@123').digest('hex');
    const initialDb = {
      settings: [
        {
          id: "def00000-0000-0000-0000-000000000000",
          inactivity_timeout_minutes: 60,
          invoice_prefix: "SSPT",
          backup_time: "02:00:00"
        }
      ],
      users: [
        {
          id: "3c3a9d4e-b5f7-4180-87a3-cb20ea85fc1a",
          email: "owner@ssplastotech.com",
          password_hash: defaultHash,
          last_login: null
        }
      ],
      company_profile: [],
      customers: [],
      suppliers: [],
      products: [],
      stock: {},
      invoices: [],
      invoice_items: [],
      purchases: [],
      purchase_items: [],
      payments: [],
      audit_logs: []
    };
    fs.writeFileSync(dbFilePath, JSON.stringify(initialDb, null, 2), 'utf8');
  }
}

// Write mock db helper
function getMockDb() {
  initMockDb();
  return JSON.parse(fs.readFileSync(dbFilePath, 'utf8'));
}

function saveMockDb(data) {
  fs.writeFileSync(dbFilePath, JSON.stringify(data, null, 2), 'utf8');
}

// Memoized / Cached connection state for Supabase
let cachedSupabaseConnection = null;

// Checks if Supabase credentials are valid/connected
async function isSupabaseConnected() {
  if (cachedSupabaseConnection !== null) {
    return cachedSupabaseConnection;
  }
  if (!process.env.SUPABASE_URL || process.env.SUPABASE_URL.includes('your-project')) {
    cachedSupabaseConnection = false;
    return false;
  }
  try {
    const { error } = await supabase.from('settings').select('id').limit(1);
    cachedSupabaseConnection = !error;
    return cachedSupabaseConnection;
  } catch (err) {
    cachedSupabaseConnection = false;
    return false;
  }
}

// Type-safe abstract query executor
class Database {
  static async query(table, action, payload = {}) {
    const connected = await isSupabaseConnected();
    if (connected) {
      try {
        return await this.executeSupabase(table, action, payload);
      } catch (err) {
        console.error(`Supabase error on ${table}.${action}, falling back to mock:`, err);
        return this.executeMock(table, action, payload);
      }
    } else {
      return this.executeMock(table, action, payload);
    }
  }

  static async executeSupabase(table, action, payload) {
    let query = supabase.from(table);

    switch (action) {
      case 'select':
        if (payload.id) {
          const { data, error } = await query.select('*').eq('id', payload.id).single();
          if (error) throw error;
          return data;
        } else {
          let q = query.select('*');
          if (payload.filters) {
            for (const [key, val] of Object.entries(payload.filters)) {
              if (val !== undefined && val !== null) {
                q = q.eq(key, val);
              }
            }
          }
          if (payload.orderBy) {
            q = q.order(payload.orderBy, { ascending: payload.ascending !== false });
          }
          const { data, error } = await q;
          if (error) throw error;
          return data;
        }

      case 'insert': {
        const { data, error } = await query.insert(payload.data).select().single();
        if (error) throw error;
        return data;
      }

      case 'update': {
        const { data, error } = await query.update(payload.data).eq('id', payload.id).select().single();
        if (error) throw error;
        return data;
      }

      case 'delete': {
        const { data, error } = await query.delete().eq('id', payload.id).select().single();
        if (error) throw error;
        return data;
      }

      default:
        throw new Error(`Unsupported database action: ${action}`);
    }
  }

  static executeMock(table, action, payload = {}) {
    const db = getMockDb();
    if (!db[table]) {
      db[table] = [];
    }

    switch (action) {
      case 'select':
        if (payload && payload.id) {
          const item = db[table].find(i => i.id === payload.id);
          return item || null;
        } else {
          let items = [...db[table]];
          if (payload && payload.filters) {
            items = items.filter(item => {
              return Object.entries(payload.filters).every(([key, val]) => {
                if (val === undefined || val === null) return true;
                return item[key] === val;
              });
            });
          }
          if (payload && payload.orderBy) {
            items.sort((a, b) => {
              const valA = a[payload.orderBy];
              const valB = b[payload.orderBy];
              if (valA < valB) return payload.ascending !== false ? -1 : 1;
              if (valA > valB) return payload.ascending !== false ? 1 : -1;
              return 0;
            });
          }
          return items;
        }

      case 'insert': {
        const newRecord = {
          id: payload.data.id || require('crypto').randomUUID(),
          ...payload.data,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        db[table].push(newRecord);

        // Auto-create stock entry for new product
        if (table === 'products') {
          if (!db.stock) db.stock = {};
          db.stock[newRecord.id] = {
            product_id: newRecord.id,
            quantity_available: 0.000,
            last_updated: new Date().toISOString()
          };
        }

        saveMockDb(db);
        return newRecord;
      }

      case 'update': {
        const index = db[table].findIndex(i => i.id === payload.id);
        if (index === -1) throw new Error(`Record with id ${payload.id} not found in ${table}`);
        const updatedRecord = {
          ...db[table][index],
          ...payload.data,
          updated_at: new Date().toISOString()
        };
        db[table][index] = updatedRecord;
        saveMockDb(db);
        return updatedRecord;
      }

      case 'delete': {
        const index = db[table].findIndex(i => i.id === payload.id);
        if (index === -1) throw new Error(`Record with id ${payload.id} not found in ${table}`);
        const deletedRecord = db[table].splice(index, 1)[0];
        saveMockDb(db);
        return deletedRecord;
      }

      default:
        throw new Error(`Unsupported database action: ${action}`);
    }
  }
}

module.exports = Database;
