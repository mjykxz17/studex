const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

// Load .env.local
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

async function migrate() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  
  console.log('Attempting to add sync_enabled column to modules table...');
  
  // Since we can't run raw SQL directly through the client easily without a stored function,
  // we'll try to update a non-existent row and see if the column is recognized, or just hope the user runs the schema.sql.
  // Actually, we can use the 'rpc' if they have an 'exec_sql' function, but they likely don't.
  
  // Alternatively, we can try to insert a row with the new column and see if it fails.
  const { error } = await supabase.from('modules').update({ sync_enabled: true }).eq('id', '00000000-0000-0000-0000-000000000000');
  
  if (error && error.message.includes('column "sync_enabled" of relation "modules" does not exist')) {
    console.log('Column "sync_enabled" does not exist. You need to run the following SQL in your Supabase SQL Editor:');
    console.log('ALTER TABLE modules ADD COLUMN sync_enabled BOOLEAN DEFAULT TRUE;');
  } else if (error) {
    console.log('Migration check returned error (this might be normal if the column exists but ID was not found):', error.message);
    if (!error.message.includes('column "sync_enabled" of relation "modules" does not exist')) {
        console.log('Column "sync_enabled" likely exists.');
    }
  } else {
    console.log('Column "sync_enabled" exists or was successfully checked.');
  }
}

migrate();
