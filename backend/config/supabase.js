const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL?.trim();

const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl) {
  throw new Error(
    'SUPABASE_URL missing'
  );
}

if (!supabaseKey) {
  throw new Error(
    'SUPABASE_SERVICE_ROLE_KEY missing'
  );
}

console.log(
  'SUPABASE URL:',
  supabaseUrl
);

const supabase = createClient(
  supabaseUrl,
  supabaseKey
);

module.exports = supabase;