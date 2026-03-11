const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function run() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  
  // Since we can't run raw DDL via the standard data API, and RPC isn't guaranteed to exist for raw queries,
  // we will instruct the user to run it in the SQL editor, but we'll do a check first.
  const { data, error } = await supabase.from('modules').select('sync_enabled').limit(1);
  if (error && error.code === 'PGRST204') {
    console.log("COLUMN_MISSING");
  } else if (error) {
    console.log("ERROR", error.message);
  } else {
    console.log("COLUMN_EXISTS");
  }
}
run();
