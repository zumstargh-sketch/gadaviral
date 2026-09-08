const t = require('fs').readFileSync('seeds/demoEngage.ts', 'utf8');
let d = 0;
const lines = t.split(/\r?\n/);
lines.forEach((l, i) => {
  const before = d;
  for (const c of l) { if (c === '{') d++; if (c === '}') d--; }
  if (i + 1 >= 55 && i + 1 <= 105) {
    console.log(`${i + 1} [${before}->${d}] ${l.slice(0, 70)}`);
  }
});
console.log('final depth', d);
