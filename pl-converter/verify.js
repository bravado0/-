// 사용법: node verify.js <원본(프로젝트).xlsx> [계정별 원장.xlsx] [재공품.xlsx] [출력.xlsx]
// dist/ 에 build.py 결과(template.xlsx, plan.json)가 있어야 한다.
const fs = require('fs');
const path = require('path');
const XLSX = require('../academy-ledger/vendor/xlsx-0.18.5.full.min.js');
const core = require('./core.js');

const [rawPath, ledgerPath, wipPath, outPath] = process.argv.slice(2);
const dist = path.join(__dirname, 'dist');
const plan = JSON.parse(fs.readFileSync(path.join(dist, 'plan.json'), 'utf8'));
const template = new Uint8Array(fs.readFileSync(path.join(dist, 'template.xlsx')));
const read = p => (p && p !== '-' ? XLSX.read(fs.readFileSync(p), { type: 'buffer' }) : null);

const rawWb = read(rawPath);
console.error('종류:', core.classify(XLSX, rawWb, path.basename(rawPath)));
const res = core.convert(XLSX, plan, template, rawWb, read(ledgerPath), read(wipPath));
fs.writeFileSync(outPath || path.join(dist, res.project + '.xlsx'), Buffer.from(res.bytes));
console.log(JSON.stringify({ project: res.project, summary: res.summary, unmapped: res.unmapped }, null, 1));
