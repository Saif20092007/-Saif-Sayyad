require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Warning: SUPABASE_URL or SUPABASE_ANON_KEY is missing from environment variables.');
}

const supabase = createClient(supabaseUrl || 'http://localhost:8000', supabaseAnonKey || 'dummy-key', {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl || 'http://localhost:8000', supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : supabase;

module.exports = {
  supabase,
  supabaseAdmin
};
