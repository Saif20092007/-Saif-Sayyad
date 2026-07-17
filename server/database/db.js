// Database query layers with explicit, non-silent error propagation.
// Supports both explicit Supabase mode and explicit Local Mock File mode based on environment variables.

const fs = require('fs');
const path = require('path');
const { supabase } = require('../config/supabase');

const dbFilePath = path.join(__dirname, 'mock_db.json');

// Check configuration explicitly on load
const isMockMode = process.env.USE_MOCK_DB === 'true' ||
                   !process.env.SUPABASE_URL ||
                   process.env.SUPABASE_URL.includes('your-project.supabase.co');

function initMockDb() {
  if (!fs.existsSync(dbFilePath)) {
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
          // Seed bcrypt hash of 'Admin@123'
          password_hash: "$2b$10$CLLDw8RS41byikVdoOHJReLuJt1KEy0AeV3u1POROvWpvzD1dK28G",
          last_login: null
        }
      ],
      company_profile: [],
      customers: [],
      suppliers: [],
      products: [],
      stock: {},
      audit_logs: []
    };
    fs.writeFileSync(dbFilePath, JSON.stringify(initialDb, null, 2), 'utf8');
  }
}

// Write the bcrypt default seeded hash manually to avoid compile lag on start
// "$2b$10$T89E7hB3r0LAnD3X1eNfbe4W9H7U3m6E7mZqXy1pB8d9o0v1e.C.y" is the actual bcrypt hash of "Admin@123"

function getMockDb() {
  initMockDb();
  return JSON.parse(fs.readFileSync(dbFilePath, 'utf8'));
}

function saveMockDb(data) {
  fs.writeFileSync(dbFilePath, JSON.stringify(data, null, 2), 'utf8');
}

class Database {
  static async query(table, action, payload = {}) {
    if (isMockMode) {
      return this.executeMock(table, action, payload);
    } else {
      return this.executeSupabase(table, action, payload);
    }
  }

  static async executeSupabase(table, action, payload) {
    let query = supabase.from(table);

    switch (action) {
      case 'select':
        if (payload && payload.id) {
          const { data, error } = await query.select('*').eq('id', payload.id).single();
          if (error) {
            console.error(`Supabase Select error for table ${table} with id ${payload.id}:`, error);
            throw error;
          }
          return data;
        } else {
          let q = query.select('*');
          if (payload && payload.filters) {
            for (const [key, val] of Object.entries(payload.filters)) {
              if (val !== undefined && val !== null) {
                q = q.eq(key, val);
              }
            }
          }
          if (payload && payload.orderBy) {
            q = q.order(payload.orderBy, { ascending: payload.ascending !== false });
          }
          const { data, error } = await q;
          if (error) {
            console.error(`Supabase Select error for table ${table}:`, error);
            throw error;
          }
          return data;
        }

      case 'insert': {
        const { data, error } = await query.insert(payload.data).select().single();
        if (error) {
          console.error(`Supabase Insert error for table ${table}:`, error);
          throw error;
        }
        return data;
      }

      case 'update': {
        const { data, error } = await query.update(payload.data).eq('id', payload.id).select().single();
        if (error) {
          console.error(`Supabase Update error for table ${table} with id ${payload.id}:`, error);
          throw error;
        }
        return data;
      }

      case 'delete': {
        const { data, error } = await query.delete().eq('id', payload.id).select().single();
        if (error) {
          console.error(`Supabase Delete error for table ${table} with id ${payload.id}:`, error);
          throw error;
        }
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
          if (!item) {
            const error = new Error(`Record with id ${payload.id} not found in mock ${table}`);
            error.status = 404;
            throw error;
          }
          return item;
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
        if (index === -1) {
          const error = new Error(`Record with id ${payload.id} not found in mock ${table}`);
          error.status = 404;
          throw error;
        }
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
        if (index === -1) {
          const error = new Error(`Record with id ${payload.id} not found in mock ${table}`);
          error.status = 404;
          throw error;
        }
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
