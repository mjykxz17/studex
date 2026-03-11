const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

// Load .env.local
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

async function auditData() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('SUPABASE_URL or SUPABASE_SERVICE_KEY is missing in .env.local');
    return;
  }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  
  const tables = ['modules', 'tasks', 'announcements', 'canvas_files'];
  
  for (const table of tables) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      console.error(`Error counting ${table}:`, error.message);
    } else {
      console.log(`${table}: ${count}`);
    }
  }

  // Also check for distinct canvas_files to see if there are duplicates or something weird
  const { data: files, error: fileError } = await supabase.from('canvas_files').select('id, filename').limit(10);
  if (fileError) {
    console.error('Error fetching canvas_files sample:', fileError.message);
  } else {
    console.log('Sample canvas_files:', files);
  }
}

auditData();
