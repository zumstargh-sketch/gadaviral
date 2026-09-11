import fs from 'fs';

const f = 'C:/Users/I AM/Documents/Datila/GADAVIRAL/wordpress/gadaviral-api/gadaviral-api.php';
let txt = fs.readFileSync(f, 'utf8');

// Repair: re-attach the gadv_user_get_me declaration that was consumed by
// the stream-embed insertion. The orphaned body starts right after the
// gadv_stream_embed_url closing brace.
const orphan = /(\r?\n\}\r?\n)(\s*\$user = gadv_get_request_user\(\$request\);\s*\r?\n\s*if \(!\$user\) return new WP_Error\('unauthorized')/;
if (txt.includes('function gadv_user_get_me')) { console.log('already restored'); process.exit(0); }
const m = orphan.exec(txt);
if (!m) { console.log('ORPHAN NOT FOUND'); process.exit(1); }
const insert = m[1] + '\n/** GET /users/me — the profile page reads this; PATCH returns the same shape. */\nfunction gadv_user_get_me($request) {';
txt = txt.slice(0, m.index) + insert + txt.slice(m.index + m[0].length);

fs.writeFileSync(f, txt, 'utf8');
const check = fs.readFileSync(f, 'utf8');
console.log('get_me restored:', check.includes('function gadv_user_get_me'));
console.log('single get_me:', (check.match(/function gadv_user_get_me/g) || []).length === 1);
console.log('stream fn intact:', check.includes('function gadv_stream_embed_url'));

