const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

// Load .env.local
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

async function checkData() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  
  const { data: users, error: userError } = await supabase.from('users').select('*');
  console.log('Users:', users?.length || 0);
  if (userError) console.error(userError);

  const { data: modules, error: modError } = await supabase.from('modules').select('*').limit(1);
  console.log('Modules:', modules?.length || 0);
  if (modules && modules.length > 0) {
    console.log('Sample Module:', modules[0]);
  }
  if (modError) console.error(modError);

  const { data: syncLogs, error: syncError } = await supabase.from('sync_log').select('*').order('ran_at', { ascending: false }).limit(5);
  console.log('Recent Sync Logs:', syncLogs);
}

checkData();
