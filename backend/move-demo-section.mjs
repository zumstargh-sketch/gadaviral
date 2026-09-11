import fs from 'fs';

const f = 'C:/Users/I AM/Documents/Datila/GADAVIRAL/wordpress/gadaviral-api/gadaviral-api.php';
let txt = fs.readFileSync(f, 'utf8');

const h2idx = txt.indexOf('<h2>Demo community');
if (h2idx < 0) { console.log('NOT FOUND'); process.exit(1); }
const start = txt.lastIndexOf('\n', h2idx) + 1;
// Precise end marker: the settings-page render block "<?php" + "$upload = …"
// (the function-definition occurrence uses a single tab — never matches).
const re = /\t\t<\?php\s*\n\s*\$upload = wp_upload_dir\(\);/;
const m = re.exec(txt);
if (!m || m.index < h2idx) { console.log('MARKER ISSUE at ' + (m ? m.index : -1)); process.exit(1); }
const section = txt.slice(start, m.index);
txt = txt.slice(0, start) + txt.slice(m.index);

const h1idx = txt.indexOf('<h1>GADAVIRAL');
const afterH1 = txt.indexOf('\n', h1idx) + 1;
const box = '\t\t<div style="border:2px solid #F2A900;border-radius:8px;padding:12px 16px;margin:16px 0;background:#fffbe8">\n'
  + section
  + '\t\t</div>\n';
txt = txt.slice(0, afterH1) + box + txt.slice(afterH1);

fs.writeFileSync(f, txt, 'utf8');
const check = fs.readFileSync(f, 'utf8');
console.log('section before Google h2:', check.indexOf('<h2>Demo community') < check.indexOf('<h2>Google Sign-in'));
console.log('single occurrence:', (check.match(/<h2>Demo community/g) || []).length === 1);
console.log('mail_log x' + (check.match(/function gadv_mail_log/g) || []).length);
console.log('settings x' + (check.match(/function gadv_google_settings_page/g) || []).length);
console.log('box present:', check.includes('border:2px solid #F2A900'));
