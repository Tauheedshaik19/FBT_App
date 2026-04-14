const SUPABASE_URL = 'https://niznuelbasloxvoodlnf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5pem51ZWxiYXNsb3h2b29kbG5mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1ODk3MjksImV4cCI6MjA5MTE2NTcyOX0.3amaPpHDibGgGSVGZ8vK3vX89okz7Dr60fMBEcQNegE';

// Initialize and expose precisely to the global window
if (window.supabase) {
    window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log("Supabase Client Globally Initialized.");
} else {
    console.error("Supabase CDN not loaded.");
}
