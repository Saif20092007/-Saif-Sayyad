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
      invoices: [],
      invoice_items: [],
      invoice_counters: {},
      audit_logs: []
    };
    fs.writeFileSync(dbFilePath, JSON.stringify(initialDb, null, 2), 'utf8');
  }
}

function getMockDb() {
  initMockDb();
  return JSON.parse(fs.readFileSync(dbFilePath, 'utf8'));
}

function saveMockDb(data) {
  fs.writeFileSync(dbFilePath, JSON.stringify(data, null, 2), 'utf8');
}

class Database {
  static async query(table, action, payload = {}) {
    if (action === 'rpc') {
      if (isMockMode) {
        return this.executeMockRpc(payload.function, payload.args);
      } else {
        return this.executeSupabaseRpc(payload.function, payload.args);
      }
    }

    if (isMockMode) {
      return this.executeMock(table, action, payload);
    } else {
      return this.executeSupabase(table, action, payload);
    }
  }

  static async executeSupabaseRpc(functionName, args) {
    const { data, error } = await supabase.rpc(functionName, args);
    if (error) {
      console.error(`Supabase RPC error calling ${functionName}:`, error);
      throw error;
    }
    return data;
  }

  static executeMockRpc(functionName, args = {}) {
    const db = getMockDb();

    if (functionName === 'get_next_invoice_number') {
      if (!db.invoice_counters) {
        db.invoice_counters = {};
      }
      const fy = args.fy || '2026-27';
      const current = db.invoice_counters[fy] || 0;
      const nextNum = current + 1;
      db.invoice_counters[fy] = nextNum;
      saveMockDb(db);
      return nextNum;
    }

    if (functionName === 'create_invoice_transaction') {
      const invoicePayload = args.invoice_payload || {};
      const itemsPayload = args.items_payload || [];

      const fy = invoicePayload.financial_year || '2026-27';
      if (!db.invoice_counters) db.invoice_counters = {};
      const currentCounter = db.invoice_counters[fy] || 0;
      const nextNum = currentCounter + 1;
      db.invoice_counters[fy] = nextNum;

      const invoice_no = 'SSPT/' + fy + '/' + String(nextNum).padStart(6, '0');
      const invoiceId = require('crypto').randomUUID();

      // Validate stock levels before decrementing
      for (const item of itemsPayload) {
        const prodId = item.product_id;
        const currentQty = db.stock[prodId]?.quantity_available || 0;
        if (currentQty < item.qty) {
          throw new Error(`Insufficient stock for product ID ${prodId}`);
        }
      }

      // Decrement stock levels
      for (const item of itemsPayload) {
        const prodId = item.product_id;
        db.stock[prodId].quantity_available -= item.qty;
        db.stock[prodId].last_updated = new Date().toISOString();
      }

      // Insert invoice
      const invoiceRow = {
        id: invoiceId,
        invoice_no,
        financial_year: fy,
        running_number: nextNum,
        invoice_date: invoicePayload.invoice_date || new Date().toISOString().split('T')[0],
        customer_id: invoicePayload.customer_id,
        po_number: invoicePayload.po_number || null,
        place_of_supply: invoicePayload.place_of_supply,
        tax_type: invoicePayload.tax_type,
        taxable_value: invoicePayload.taxable_value,
        cgst_total: invoicePayload.cgst_total || 0,
        sgst_total: invoicePayload.sgst_total || 0,
        igst_total: invoicePayload.igst_total || 0,
        round_off: invoicePayload.round_off || 0,
        grand_total: invoicePayload.grand_total,
        invoice_status: 'Active',
        payment_status: 'Draft',
        copy_type: invoicePayload.copy_type || 'Original',
        is_signed_digital: !!invoicePayload.is_signed_digital,
        verify_token: require('crypto').randomUUID(),
        pdf_url: null,
        pdf_generation_status: 'pending',
        snapshot_customer_name: invoicePayload.snapshot_customer_name,
        snapshot_customer_address: invoicePayload.snapshot_customer_address,
        snapshot_customer_gstin: invoicePayload.snapshot_customer_gstin,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      if (!db.invoices) db.invoices = [];
      db.invoices.push(invoiceRow);

      // Insert items
      if (!db.invoice_items) db.invoice_items = [];
      for (const item of itemsPayload) {
        db.invoice_items.push({
          id: require('crypto').randomUUID(),
          invoice_id: invoiceId,
          product_id: item.product_id,
          snapshot_description: item.snapshot_description,
          snapshot_hsn: item.snapshot_hsn,
          snapshot_gst_percent: item.snapshot_gst_percent,
          qty: item.qty,
          rate: item.rate,
          taxable_amount: item.taxable_amount,
          cgst_amount: item.cgst_amount || 0,
          sgst_amount: item.sgst_amount || 0,
          igst_amount: item.igst_amount || 0,
          line_total: item.line_total
        });
      }

      saveMockDb(db);
      return invoiceId;
    }

    throw new Error(`Unsupported Mock RPC function: ${functionName}`);
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
