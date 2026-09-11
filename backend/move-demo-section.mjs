import fs from 'fs';
import { execSync } from 'child_process';

// Extract the zip's gadaviral-api.php into a temp file and audit it.
const root = 'C:/Users/I AM/Documents/Datila/GADAVIRAL';
const tmp = root + '/backend/zip-audit-tmp.php';
execSync(`powershell -NoProfile -Command "Expand-Archive -Path 'C:\\Users\\I AM\\Documents\\Datila\\GADAVIRAL\\wordpress\\gadaviral-api\\gadaviral-api.zip' -DestinationPath 'C:\\Users\\I AM\\Documents\\Datila\\GADAVIRAL\\backend\\zip-audit' -Force"`);
const t = fs.readFileSync(root + '/backend/zip-audit/gadaviral-api.php', 'utf8');

const fns = ['gadv_user_get_me', 'gadv_user_update_me', 'gadv_stream_embed_url', 'gadv_media_serve', 'gadv_comments_create', 'gadv_posts_create', 'gadv_hydrate_post', 'gadv_community_highlights', 'gadv_health'];
let ok = true;
for (const fn of fns) {
  const n = (t.match(new RegExp('function ' + fn + '\\(', 'g')) || []).length;
  if (n !== 1) { ok = false; console.log('BAD: ' + fn + ' x' + n); }
}
console.log('v0.2.21:', t.includes(' * Version: 0.2.21'));
console.log('broken splice gone:', !t.includes('get_me($request) {,'));
console.log('braces:', (t.match(/\{/g) || []).length, '/', (t.match(/\}/g) || []).length);
console.log('LIVE posts:', t.includes("in_array($type, ['TEXT', 'PHOTO', 'VIDEO', 'POLL', 'ANNOUNCEMENT', 'LIVE']"));
console.log('stream hydrate:', (t.match(/gadv_stream_url/g) || []).length >= 2);
console.log(ok ? 'ZIP AUDIT PASS' : 'ZIP AUDIT FAIL');
fs.rmSync(root + '/backend/zip-audit', { recursive: true, force: true });
fs.rmSync(tmp, { force: true });



