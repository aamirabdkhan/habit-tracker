// Optional cloud sync (Supabase). Per-key last-write-wins: the template and each
// day are separate rows, keyed "w2:<key>" so they never collide with the old app's
// "ht_*" rows in the shared user_data table. Merge logic lives in store.applyRemote.
//
// Security: relies entirely on Row Level Security scoping user_data to auth.uid().
// The publishable key below is public by design; it is safe ONLY if those RLS
// policies are correct (see DEVELOPMENT & DEPLOYMENT.md).
import { syncRows, applyRemote } from './store.js';
import { set } from '../core/state.js';

const SUPABASE_URL = 'https://yyxisjdkfdpcxjjthqsw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_XhnrBPEJDFSgX0fB4AYnhg_nwrOYlf9';
const PREFIX = 'w2:';

let sb = null, user = null, channel = null;
export const currentUser = () => user;

export function initSync() {
  if (sb || !window.supabase) return;
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  sb.auth.onAuthStateChange((_e, session) => {
    user = session ? session.user : null;
    set({}); // refresh Settings' cloud section
    if (user) { subscribeRealtime(); syncDown().then(syncUp); }
    else if (channel) { sb.removeChannel(channel); channel = null; }
  });
}

const rowKey = (k) => PREFIX + k;
const storeKey = (rk) => rk.slice(PREFIX.length);

/** Pull remote rows and merge the newer ones into the local store. */
export function syncDown() {
  if (!sb || !user) return Promise.resolve();
  return sb.from('user_data').select('key,value,updated_at').like('key', PREFIX + '%').then(({ data, error }) => {
    if (error || !data) return;
    let changed = false;
    data.forEach((row) => { if (applyRemote(storeKey(row.key), row.value, row.updated_at)) changed = true; });
    if (changed) set({});
  });
}

/** Push local rows (safe after syncDown: local already holds any newer remote). */
export function syncUp() {
  if (!sb || !user) return Promise.resolve();
  const rows = syncRows().map((r) => ({
    user_id: user.id, key: rowKey(r.k), value: r.v,
    updated_at: new Date(r.mt || Date.now()).toISOString(),
  }));
  return sb.from('user_data').upsert(rows, { onConflict: 'user_id,key' }).then(() => {});
}

function subscribeRealtime() {
  if (channel) sb.removeChannel(channel);
  channel = sb.channel('w2-' + user.id)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'user_data', filter: 'user_id=eq.' + user.id },
      (payload) => {
        const row = payload.new;
        if (row && row.key && row.key.startsWith(PREFIX) && applyRemote(storeKey(row.key), row.value, row.updated_at)) set({});
      })
    .subscribe();
}

// ---- auth (used by Settings) ----
export const signIn = (email, pw) => sb.auth.signInWithPassword({ email, password: pw });
export const signUp = (email, pw) => sb.auth.signUp({ email, password: pw });
export const signOut = () => sb.auth.signOut();
export const syncNow = () => syncDown().then(syncUp);
