// Leaderboard connection (Supabase). These two values are meant to be public:
// the "publishable" (or "anon") key only allows what the database functions allow,
// and every function also needs your private family code, which is NOT stored here.
window.JASPER_CONFIG = {
  supabaseUrl: '',   // e.g. https://abcdefghijkl.supabase.co
  supabaseKey: '',   // Project Settings -> API Keys -> publishable key (sb_publishable_...)
};
