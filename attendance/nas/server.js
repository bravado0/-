#!/usr/bin/env node
/*
 * 일일 근태현황 : 사내 서버(시놀로지 NAS 등)용
 *
 * 구글 Apps Script 대신 이 프로그램 하나가 화면 파일과 서버 기능을 모두 맡습니다.
 * 서버 로직은 구글 쪽과 똑같은 ../core.js 를 그대로 쓰고, 저장만 이 폴더 밖의 JSON 파일로 합니다.
 * 외부 라이브러리 없음 (Node.js 16 이상).
 *
 *   실행          node nas/server.js
 *   데이터 넣기    node nas/server.js --import 근태현황_NAS이전.json   (이미 있으면 --force 로 덮어씀)
 *
 *   환경 변수     PORT      기본 8080
 *                DATA_DIR  기본 ../../attendance-data  (웹 폴더 밖에 두세요)
 */
'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var APP_DIR = path.resolve(__dirname, '..');
var PORT = Number(process.env.PORT) || 8080;
var DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(APP_DIR, '..', 'attendance-data'));
var BACKUP_KEEP = 30;          // 날마다 남기는 사본 개수

var Core = require(path.join(APP_DIR, 'core.js'));

/* ---------- 저장소 : 표 하나 = JSON 파일 하나 ---------- */

fs.mkdirSync(DATA_DIR, { recursive: true });
var tables = {};

function file(t) { return path.join(DATA_DIR, t + '.json'); }

function load(t) {
  if (tables[t]) return tables[t];
  try { tables[t] = JSON.parse(fs.readFileSync(file(t), 'utf8')); } catch (e) { tables[t] = []; }
  return tables[t];
}

// 임시 파일에 쓰고 이름을 바꿔서, 쓰는 도중 전원이 나가도 파일이 깨지지 않게
function save(t) {
  backupOncePerDay();
  var tmp = file(t) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(tables[t]));
  fs.renameSync(tmp, file(t));
}

var lastBackup = '';
function backupOncePerDay() {
  var day = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  if (day === lastBackup) return;
  lastBackup = day;
  var dir = path.join(DATA_DIR, 'backups', day);
  if (fs.existsSync(dir)) return;
  fs.mkdirSync(dir, { recursive: true });
  Object.keys(Core.TABLES).forEach(function (t) {
    if (fs.existsSync(file(t))) fs.copyFileSync(file(t), path.join(dir, t + '.json'));
  });
  var all = fs.readdirSync(path.join(DATA_DIR, 'backups')).sort();
  all.slice(0, Math.max(0, all.length - BACKUP_KEEP)).forEach(function (d) {
    fs.rmSync(path.join(DATA_DIR, 'backups', d), { recursive: true, force: true });
  });
}

function norm(t, row) {
  var o = {};
  Core.TABLES[t].fields.forEach(function (f) { o[f] = row[f] == null ? '' : String(row[f]); });
  return o;
}

function match(keys, a, b) {
  for (var i = 0; i < keys.length; i++) if (String(a[keys[i]]) !== String(b[keys[i]])) return false;
  return true;
}

var memo = {};
var env = {
  read: function (t) { return load(t); },
  upsert: function (t, keys, row) {
    var list = load(t), o = norm(t, row);
    var i = list.findIndex(function (r) { return match(keys, r, o); });
    if (i >= 0) list[i] = o; else list.push(o);
    save(t);
  },
  append: function (t, row) {
    var list = load(t);
    list.push(norm(t, row));
    if (t === 'log' && list.length > 20000) list.splice(0, list.length - 20000);
    save(t);
  },
  appendMany: function (t, rows) {
    var list = load(t);
    rows.forEach(function (r) { list.push(norm(t, r)); });
    save(t);
  },
  remove: function (t, keys, m) {
    tables[t] = load(t).filter(function (r) { return !match(keys, r, m); });
    save(t);
  },
  lock: function (fn) { return fn(); },     // Node 는 한 번에 한 요청씩 처리하므로 잠금이 필요 없음
  secret: function () {
    var f = path.join(DATA_DIR, 'secret.txt');
    if (!memo.secret) {
      try { memo.secret = fs.readFileSync(f, 'utf8').trim(); } catch (e) { /* 처음 */ }
      if (!memo.secret) { memo.secret = crypto.randomBytes(32).toString('hex'); fs.writeFileSync(f, memo.secret, { mode: 0o600 }); }
    }
    return memo.secret;
  },
  now: function () { return new Date(); },
  uuid: function () { return crypto.randomUUID(); },
  cacheGet: function (k) { var c = memo['c:' + k]; return c && c.exp > Date.now() ? c.v : null; },
  cachePut: function (k, v, ttl) { memo['c:' + k] = { v: v, exp: Date.now() + ttl * 1000 }; },
  cacheRemove: function (k) { delete memo['c:' + k]; }
};

/* ---------- 구글에서 내보낸 데이터 넣기 ---------- */

function importFile(p, force) {
  var data = JSON.parse(fs.readFileSync(p, 'utf8'));
  var src = data.tables || data;
  var counts = [];
  Object.keys(Core.TABLES).forEach(function (t) {
    if (!Array.isArray(src[t])) return;
    if (load(t).length && !force) {
      console.log('  ' + t + ': 이미 데이터가 있어 건너뜀 (덮어쓰려면 끝에 --force)');
      return;
    }
    tables[t] = src[t].map(function (r) { return norm(t, r); });
    save(t);
    counts.push(t + ' ' + tables[t].length);
  });
  console.log('가져오기 끝: ' + (counts.join(', ') || '없음'));
  console.log('데이터 폴더: ' + DATA_DIR);
}

/* ---------- 웹 서버 ---------- */

// 밖으로 내보내도 되는 화면 파일만 (서버 코드·데이터·설명서는 제공하지 않음)
var PUBLIC = /^\/(index\.html|app\.js|core\.js|local-backend\.js|import-excel\.js|vendor\/[\w.\-]+\.js|assets\/[\w.\-]+\.(png|svg|jpg|ico))$/;
var TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8' };

function send(res, code, type, body, extra) {
  var h = { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
  for (var k in extra || {}) h[k] = extra[k];
  res.writeHead(code, h);
  res.end(body);
}

var server = http.createServer(function (req, res) {
  var url = decodeURIComponent(req.url.split('?')[0]);

  if (url === '/api' || url.slice(-4) === '/api') {
    if (req.method === 'GET') return send(res, 200, TYPES['.json'], JSON.stringify({ ok: true, service: 'attendance', message: '근태현황 서버가 켜져 있습니다.' }));
    if (req.method !== 'POST') return send(res, 405, 'text/plain', 'POST only');
    var body = '';
    req.on('data', function (c) { body += c; if (body.length > 4e6) req.destroy(); });
    req.on('end', function () {
      var out;
      try { out = Core.handle(JSON.parse(body), env); }
      catch (e) { out = { ok: false, error: 'BAD_REQUEST', message: '요청 형식이 올바르지 않습니다.' }; }
      send(res, 200, TYPES['.json'], JSON.stringify(out), { 'Cache-Control': 'no-store' });
    });
    return;
  }

  // 화면이 이 서버를 쓰도록 설정 파일은 여기서 만들어 줌
  if (url === '/config.js' || url.slice(-10) === '/config.js') {
    return send(res, 200, TYPES['.js'], "window.ATTENDANCE_CONFIG = { apiUrl: 'api' };\n", { 'Cache-Control': 'no-store' });
  }

  if (url === '/' || url === '') url = '/index.html';
  if (!PUBLIC.test(url)) return send(res, 404, 'text/plain; charset=utf-8', '없는 페이지입니다.');
  fs.readFile(path.join(APP_DIR, url), function (err, data) {
    if (err) return send(res, 404, 'text/plain; charset=utf-8', '없는 페이지입니다.');
    send(res, 200, TYPES[path.extname(url)] || 'application/octet-stream', data,
      { 'Cache-Control': url === '/index.html' ? 'no-cache' : 'max-age=300' });
  });
});

var args = process.argv.slice(2);
if (args[0] === '--import') {
  if (!args[1]) { console.log('사용법: node nas/server.js --import <내보낸 파일.json>'); process.exit(1); }
  importFile(args[1], args.indexOf('--force') >= 0);
} else {
  Core.handle({ action: 'me' }, env);          // 처음이면 기본 데이터를 만듦
  server.listen(PORT, '0.0.0.0', function () {
    console.log(new Date().toISOString() + ' 근태현황 서버 시작 : http://<NAS 주소>:' + PORT + '/  (데이터: ' + DATA_DIR + ')');
  });
}
