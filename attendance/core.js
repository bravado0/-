/*
 * 근태현황 서버 로직 (공용)
 *
 * 이 파일 하나가 두 곳에서 똑같이 돌아갑니다.
 *   - Google Apps Script (apps-script/Code.gs 안에 그대로 들어감) : 실제 운영
 *   - 브라우저 (local-backend.js)                                 : 체험 모드
 * 저장소 접근은 env 객체가 맡습니다 (read / upsert / remove / append / cache / lock ...).
 */
var AttendanceCore = (function () {
  'use strict';

  var TABLES = {
    depts:    { name: '부서',       fields: ['id', 'name', 'level', 'order', 'total', 'active'],
                labels: ['ID', '부서명', '단계(0상위/1하위)', '순서', '기본 총인원', '사용'] },
    partners: { name: '협력사',     fields: ['id', 'name', 'order', 'total', 'active'],
                labels: ['ID', '업체명', '순서', '기본 총인원', '사용'] },
    users:    { name: '계정',       fields: ['id', 'name', 'role', 'scope', 'salt', 'pinHash', 'mustChange', 'active', 'updatedAt'],
                labels: ['ID', '이름', '권한', '담당', 'salt', 'PIN해시', 'PIN변경필요', '사용', '수정시각'] },
    daily:    { name: '부서일일',   fields: ['date', 'deptId', 'total', 'working', 'trip', 'hq', 'edu', 'leave', 'by', 'at'],
                labels: ['날짜', '부서ID', '총인원', '근무자', '출장', '본사근무', '교육', '휴가', '입력자', '입력시각'] },
    pdaily:   { name: '협력사일일', fields: ['date', 'partnerId', 'total', 'working', 'by', 'at'],
                labels: ['날짜', '협력사ID', '총인원', '근무자', '입력자', '입력시각'] },
    periods:  { name: '기간',       fields: ['id', 'deptId', 'cat', 'name', 'note', 'from', 'to', 'by', 'at'],
                labels: ['ID', '부서ID', '항목', '이름', '메모', '시작일', '종료일', '입력자', '입력시각'] },
    etc:      { name: '기타작업',   fields: ['date', 'text', 'by', 'at'],
                labels: ['날짜', '내용', '입력자', '입력시각'] },
    log:      { name: '기록',       fields: ['at', 'user', 'action', 'detail'],
                labels: ['시각', '사용자', '동작', '내용'] },
    settings: { name: '설정',       fields: ['key', 'value'],
                labels: ['항목', '값'] }
  };

  var CATEGORIES = ['trip', 'hq', 'edu', 'leave'];
  // 근무자 수에서 빼는 항목 (본사근무는 근무로 셈)
  var ABSENT_CATEGORIES = ['trip', 'edu', 'leave'];

  var DEFAULT_SETTINGS = {
    orgName: '회전기사업본부',
    partnerTitle: '사내협력사',
    partnerNote: '생산관리Part 취합',
    etcTitle: '기타(공장내 작업)',
    editDays: '7'
  };

  var ROLES = { admin: '관리자', editor: '입력 담당', viewer: '조회 전용' };
  var MAX_FAILS = 5;
  var LOCK_SECONDS = 600;
  var SHORT_SESSION = 12 * 3600 * 1000;
  var LONG_SESSION = 30 * 24 * 3600 * 1000;

  /* ---------- SHA-256 / HMAC (순수 JS, Apps Script·브라우저 공용) ---------- */

  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function utf8(str) {
    var out = [];
    str = String(str);
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
        c = 0x10000 + ((c - 0xd800) << 10) + (str.charCodeAt(++i) - 0xdc00);
      }
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }

  function sha256Bytes(bytes) {
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var msg = bytes.slice();
    var bitLen = bytes.length * 8;
    msg.push(0x80);
    while (msg.length % 64 !== 56) msg.push(0);
    var hi = Math.floor(bitLen / 0x100000000);
    msg.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255);
    msg.push((bitLen >>> 24) & 255, (bitLen >>> 16) & 255, (bitLen >>> 8) & 255, bitLen & 255);
    var W = new Array(64);
    for (var off = 0; off < msg.length; off += 64) {
      for (var t = 0; t < 16; t++) {
        W[t] = (msg[off + 4 * t] << 24) | (msg[off + 4 * t + 1] << 16) | (msg[off + 4 * t + 2] << 8) | msg[off + 4 * t + 3];
      }
      for (t = 16; t < 64; t++) {
        var x = W[t - 15], y = W[t - 2];
        var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
        var s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (t = 0; t < 64; t++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K[t] + W[t]) | 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    var out = [];
    for (var i = 0; i < 8; i++) out.push((H[i] >>> 24) & 255, (H[i] >>> 16) & 255, (H[i] >>> 8) & 255, H[i] & 255);
    return out;
  }

  function hex(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    return s;
  }

  function sha256(str) { return hex(sha256Bytes(utf8(str))); }

  function hmac(key, msg) {
    var k = utf8(key);
    if (k.length > 64) k = sha256Bytes(k);
    while (k.length < 64) k.push(0);
    var ipad = [], opad = [];
    for (var i = 0; i < 64; i++) { ipad.push(k[i] ^ 0x36); opad.push(k[i] ^ 0x5c); }
    return hex(sha256Bytes(opad.concat(sha256Bytes(ipad.concat(utf8(msg))))));
  }

  function safeEqual(a, b) {
    a = String(a); b = String(b);
    if (a.length !== b.length) return false;
    var r = 0;
    for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return r === 0;
  }

  /* ---------- 공통 도우미 ---------- */

  function fail(message, code) {
    var e = new Error(message);
    e.code = code || 'BAD_REQUEST';
    throw e;
  }

  function int(v, min, max, label) {
    var n = Number(v);
    if (!isFinite(n) || Math.floor(n) !== n) fail((label || '숫자') + '는 정수로 적어 주세요.');
    if (n < min || n > max) fail((label || '숫자') + '는 ' + min + '~' + max + ' 사이여야 합니다.');
    return n;
  }

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }

  function text(v, max, label) {
    var s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    if (s.length > max) fail((label || '내용') + '이(가) 너무 깁니다 (' + max + '자 이내).');
    return s;
  }

  function truthy(v) { return v === true || v === 'TRUE' || v === 'true' || v === '1' || v === 1; }

  function kstNow(env) { return new Date(env.now().getTime() + 9 * 3600 * 1000); }

  function kstToday(env) { return kstNow(env).toISOString().slice(0, 10); }

  function stamp(env) { return kstNow(env).toISOString().slice(0, 19).replace('T', ' '); }

  function checkDate(d) {
    d = String(d || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || isNaN(Date.parse(d + 'T00:00:00Z'))) fail('날짜 형식이 올바르지 않습니다.');
    return d;
  }

  function addDays(d, n) {
    var t = new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000);
    return t.toISOString().slice(0, 10);
  }

  function byOrder(a, b) { return num(a.order) - num(b.order); }

  function splitList(v) {
    return String(v || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function cleanList(list, label) {
    if (list == null) return [];
    if (!Array.isArray(list)) fail(label + ' 목록 형식이 올바르지 않습니다.');
    if (list.length > 60) fail(label + ' 인원이 너무 많습니다.');
    return list.map(function (s) { return text(s, 80, label + ' 항목'); }).filter(Boolean);
  }

  // "김두식 (삼성 E&A)" → "김두식"
  function personName(entry) {
    return String(entry).replace(/\s*\(.*\)\s*$/, '').trim();
  }

  function newId(prefix, env) {
    return prefix + env.uuid().replace(/-/g, '').slice(0, 8).toUpperCase();
  }

  function settings(env) {
    var out = {};
    for (var k in DEFAULT_SETTINGS) out[k] = DEFAULT_SETTINGS[k];
    env.read('settings').forEach(function (r) { if (r.key in DEFAULT_SETTINGS) out[r.key] = r.value; });
    return out;
  }

  function publicSettings(env) {
    var s = settings(env);
    return { orgName: s.orgName, partnerTitle: s.partnerTitle, partnerNote: s.partnerNote,
             etcTitle: s.etcTitle, editDays: num(s.editDays) };
  }

  function log(env, user, action, detail) {
    env.append('log', { at: stamp(env), user: user ? user.name : '', action: action, detail: detail || '' });
  }

  /* ---------- 초기 데이터 ---------- */

  var SEED_DEPTS = [
    ['회전기영업팀장', 0, 1], ['영업1Part', 1, 8], ['영업2Part', 1, 3],
    ['VPC장', 0, 1], ['관리Part', 1, 8], ['설계Part', 1, 11],
    ['예산공장장', 0, 1], ['생산관리Part', 1, 8], ['품질보증Part', 1, 5], ['회전기안전Part', 1, 3]
  ];
  var SEED_PARTNERS = [
    ['대성S&P', 9], ['영진산업', 2], ['유명산업', 3], ['주성 ENG', 8], ['천수산업', 3],
    ['태광산업', 11], ['해동중기', 2], ['현대테크', 9], ['ASPEC', 39], ['KMT', 26]
  ];
  var INITIAL_ADMIN = { name: '관리자', pin: '1234' };

  function hashPin(salt, pin) { return sha256(salt + ':' + pin); }

  function ensureSeeded(env) {
    var done = env.read('settings').some(function (r) { return r.key === 'seeded'; });
    if (done) return false;
    env.lock(function () {
      if (env.read('settings').some(function (r) { return r.key === 'seeded'; })) return;
      if (!env.read('depts').length) {
        SEED_DEPTS.forEach(function (d, i) {
          env.upsert('depts', ['id'], { id: 'D' + (i + 1), name: d[0], level: d[1], order: i + 1, total: d[2], active: 'TRUE' });
        });
      }
      if (!env.read('partners').length) {
        SEED_PARTNERS.forEach(function (p, i) {
          env.upsert('partners', ['id'], { id: 'P' + (i + 1), name: p[0], order: i + 1, total: p[1], active: 'TRUE' });
        });
      }
      if (!env.read('users').length) {
        var salt = env.uuid();
        env.upsert('users', ['id'], {
          id: 'U1', name: INITIAL_ADMIN.name, role: 'admin', scope: '*', salt: salt,
          pinHash: hashPin(salt, INITIAL_ADMIN.pin), mustChange: 'TRUE', active: 'TRUE', updatedAt: stamp(env)
        });
      }
      for (var k in DEFAULT_SETTINGS) {
        if (!env.read('settings').some(function (r) { return r.key === k; })) {
          env.upsert('settings', ['key'], { key: k, value: DEFAULT_SETTINGS[k] });
        }
      }
      env.upsert('settings', ['key'], { key: 'seeded', value: stamp(env) });
    });
    return true;
  }

  /* ---------- 로그인 / 세션 ---------- */

  function findUserByName(env, name) {
    return env.read('users').filter(function (u) { return u.name === name && truthy(u.active); })[0];
  }

  function findUser(env, id) {
    return env.read('users').filter(function (u) { return u.id === id; })[0];
  }

  function makeToken(env, user, remember) {
    var exp = env.now().getTime() + (remember ? LONG_SESSION : SHORT_SESSION);
    var body = user.id + '.' + exp;
    return body + '.' + hmac(env.secret(), body + '.' + user.salt);
  }

  function auth(env, token) {
    var parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    var exp = Number(parts[1]);
    if (!exp || exp < env.now().getTime()) return null;
    var user = findUser(env, parts[0]);
    if (!user || !truthy(user.active)) return null;
    var sig = hmac(env.secret(), parts[0] + '.' + parts[1] + '.' + user.salt);
    return safeEqual(sig, parts[2]) ? user : null;
  }

  function scopeOf(user) {
    return String(user.scope || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function publicUser(u) {
    return { id: u.id, name: u.name, role: u.role, roleLabel: ROLES[u.role] || u.role,
             scope: scopeOf(u), mustChange: truthy(u.mustChange), active: truthy(u.active), updatedAt: u.updatedAt };
  }

  function checkPin(pin) {
    pin = String(pin == null ? '' : pin);
    if (!/^\d{4,8}$/.test(pin)) fail('PIN은 숫자 4~8자리로 정해 주세요.');
    if (/^(\d)\1+$/.test(pin)) fail('같은 숫자만 반복한 PIN은 쓸 수 없습니다.');
    return pin;
  }

  function login(req, env) {
    var name = text(req.name, 30, '이름');
    var pin = String(req.pin == null ? '' : req.pin);
    if (!name || !pin) fail('이름과 PIN을 입력해 주세요.');
    var key = 'fail:' + sha256(name);
    var fails = num(env.cacheGet(key));
    if (fails >= MAX_FAILS) fail('PIN을 ' + MAX_FAILS + '번 틀려 10분 동안 로그인할 수 없습니다. 잠시 후 다시 해 주세요.', 'LOCKED');
    var user = findUserByName(env, name);
    if (!user || !safeEqual(hashPin(user.salt, pin), user.pinHash)) {
      env.cachePut(key, String(fails + 1), LOCK_SECONDS);
      var left = MAX_FAILS - fails - 1;
      fail('이름 또는 PIN이 맞지 않습니다.' + (left > 0 ? ' (남은 기회 ' + left + '번)' : ' 10분 뒤 다시 해 주세요.'), 'LOGIN');
    }
    env.cacheRemove(key);
    log(env, user, '로그인', '');
    var res = { token: makeToken(env, user, !!req.remember), user: publicUser(user), settings: publicSettings(env), today: kstToday(env) };
    if (!truthy(user.mustChange)) res.boards = boards({ dates: recentDates(env) }, user, env).boards;
    return res;
  }

  /* ---------- 권한 ---------- */

  function isAdmin(u) { return u.role === 'admin'; }

  function canEditTarget(user, target) {
    if (isAdmin(user)) return true;
    if (user.role !== 'editor') return false;
    var sc = scopeOf(user);
    return sc.indexOf('*') >= 0 || sc.indexOf(target) >= 0;
  }

  function dateEditable(env, user, date) {
    if (isAdmin(user)) return true;
    if (user.role !== 'editor') return false;
    var today = kstToday(env);
    var days = num(settings(env).editDays);
    return date >= addDays(today, -days) && date <= addDays(today, 31);
  }

  function requireEdit(env, user, date, target) {
    if (!canEditTarget(user, target)) fail('이 항목을 입력할 권한이 없습니다.', 'FORBIDDEN');
    if (!dateEditable(env, user, date)) {
      fail('지난 ' + num(settings(env).editDays) + '일보다 이전 날짜는 관리자만 고칠 수 있습니다.', 'FORBIDDEN');
    }
  }

  function requireAdmin(user) { if (!isAdmin(user)) fail('관리자만 할 수 있습니다.', 'FORBIDDEN'); }

  /* ---------- 일일 현황 ---------- */

  function activeDepts(env) {
    return env.read('depts').filter(function (d) { return truthy(d.active); }).sort(byOrder);
  }

  function activePartners(env) {
    return env.read('partners').filter(function (p) { return truthy(p.active); }).sort(byOrder);
  }

  function deptOut(d) { return { id: d.id, name: d.name, level: num(d.level), total: num(d.total) }; }
  function partnerOut(p) { return { id: p.id, name: p.name, total: num(p.total) }; }

  function dailyOut(r) {
    var o = { total: num(r.total), working: num(r.working), by: r.by, at: r.at };
    CATEGORIES.forEach(function (c) { o[c] = splitList(r[c]); });
    return o;
  }

  /* ---------- 기간 (여러 날 출장·교육·휴가) ---------- */

  function periodOut(p) { return { id: p.id, cat: p.cat, name: p.name, note: p.note, from: p.from, to: p.to }; }

  // 그날에 걸친 기간들 : { 부서ID: [기간, ...] }
  function periodsOn(env, date) {
    var out = {};
    env.read('periods').forEach(function (p) {
      if (p.from <= date && p.to >= date) (out[p.deptId] || (out[p.deptId] = [])).push(periodOut(p));
    });
    return out;
  }

  function shortDate(d) { return Number(d.slice(5, 7)) + '.' + Number(d.slice(8, 10)); }

  // 기간 항목을 그날 목록에 들어갈 글자로 : "홍길동 (연차, 10.1~10.3)"
  function periodEntry(p) {
    var bits = [p.note, shortDate(p.from) + '~' + shortDate(p.to)].filter(Boolean);
    return p.name + ' (' + bits.join(', ') + ')';
  }

  // 그날 입력한 목록 + 기간 목록 (같은 항목에 같은 이름이 이미 있으면 한 번만)
  function mergedLists(r, plist) {
    var out = {};
    CATEGORIES.forEach(function (c) {
      var list = r ? r[c].slice() : [];
      var names = list.map(personName);
      (plist || []).forEach(function (p) {
        if (p.cat === c && names.indexOf(p.name) < 0) { list.push(periodEntry(p)); names.push(p.name); }
      });
      out[c] = list;
    });
    return out;
  }

  function absentOf(lists) {
    return ABSENT_CATEGORIES.reduce(function (n, c) { return n + lists[c].length; }, 0);
  }

  function board(req, user, env) {
    var date = checkDate(req.date);
    var depts = activeDepts(env), partners = activePartners(env);
    var rows = {}, prows = {}, etc = null;
    env.read('daily').forEach(function (r) { if (r.date === date) rows[r.deptId] = dailyOut(r); });
    env.read('pdaily').forEach(function (r) {
      if (r.date === date) prows[r.partnerId] = { total: num(r.total), working: num(r.working), by: r.by, at: r.at };
    });
    env.read('etc').forEach(function (r) { if (r.date === date) etc = { text: r.text, by: r.by, at: r.at }; });
    var periods = periodsOn(env, date);
    Object.keys(rows).forEach(function (id) {
      rows[id].working = Math.max(0, rows[id].total - absentOf(mergedLists(rows[id], periods[id])));
    });
    var editable = dateEditable(env, user, date);
    return {
      date: date,
      today: kstToday(env),
      depts: depts.map(deptOut),
      partners: partners.map(partnerOut),
      rows: rows,
      periods: periods,
      prows: prows,
      etc: etc,
      perms: {
        dateEditable: editable,
        depts: editable ? depts.filter(function (d) { return canEditTarget(user, 'd:' + d.id); }).map(function (d) { return d.id; }) : [],
        partners: editable ? partners.filter(function (p) { return canEditTarget(user, 'p:' + p.id); }).map(function (p) { return p.id; }) : [],
        etc: editable && canEditTarget(user, 'etc')
      }
    };
  }

  // 여러 날짜를 한 번에 : 날짜를 넘길 때 서버에 다시 묻지 않도록 미리 받아 둠
  function boards(req, user, env) {
    if (!Array.isArray(req.dates) || !req.dates.length) fail('날짜가 없습니다.');
    if (req.dates.length > 16) fail('날짜는 한 번에 16일까지 볼 수 있습니다.');
    var out = {};
    req.dates.forEach(function (d) { out[checkDate(d)] = board({ date: d }, user, env); });
    return { boards: out };
  }

  // 오늘을 기준으로 지난 7일 + 내일
  function recentDates(env) {
    var t = kstToday(env), out = [];
    for (var i = -7; i <= 1; i++) out.push(addDays(t, i));
    return out;
  }

  function saveDept(req, user, env) {
    var date = checkDate(req.date);
    var dept = env.read('depts').filter(function (d) { return d.id === req.deptId; })[0];
    if (!dept) fail('부서를 찾을 수 없습니다.');
    requireEdit(env, user, date, 'd:' + dept.id);
    var total = int(req.total, 0, 999, '총인원');
    var row = { date: date, deptId: dept.id, total: total };
    var labels = { trip: '출장', hq: '본사근무', edu: '교육', leave: '휴가' };
    CATEGORIES.forEach(function (c) { row[c] = cleanList(req[c], labels[c]).join('\n'); });

    // 새 기간 : 오늘부터 to까지
    var adds = (Array.isArray(req.addPeriods) ? req.addPeriods : []).map(function (a) {
      if (CATEGORIES.indexOf(a.cat) < 0) fail('기간 항목이 올바르지 않습니다.');
      var name = text(a.name, 20, '이름');
      if (!name) fail('기간에 넣을 이름을 적어 주세요.');
      var to = checkDate(a.to);
      if (to < date) fail('기간 끝나는 날이 오늘보다 앞입니다.');
      if (to > addDays(date, 92)) fail('기간은 3달 이내로 정해 주세요.');
      return { id: newId('T', env), deptId: dept.id, cat: a.cat, name: name, note: text(a.note, 50, '메모'),
               from: date, to: to, by: user.name, at: stamp(env) };
    });
    if (adds.length > 30) fail('기간은 한 번에 30개까지 넣을 수 있습니다.');
    // 끝낼 기간 : 오늘부터 빠짐 (오늘 시작한 것은 지움)
    var ends = Array.isArray(req.endPeriods) ? req.endPeriods.map(String) : [];

    // 먼저 오늘 인원을 계산해서 확인한 뒤에 저장 (틀리면 아무것도 저장하지 않음)
    var today = (periodsOn(env, date)[dept.id] || []).filter(function (p) { return ends.indexOf(p.id) < 0; })
      .concat(adds.map(periodOut));
    var absent = absentOf(mergedLists(dailyOut(row), today));
    if (absent > total) fail('출장·교육·휴가 인원(' + absent + '명)이 총인원(' + total + '명)보다 많습니다.');
    row.working = total - absent;
    row.by = user.name;
    row.at = stamp(env);

    env.lock(function () {
      var mine = env.read('periods').filter(function (p) { return p.deptId === dept.id; });
      ends.forEach(function (id) {
        var p = mine.filter(function (x) { return x.id === id; })[0];
        if (!p || p.from > date || p.to < date) return;
        if (p.from === date) env.remove('periods', ['id'], { id: id });
        else {
          var copy = {};
          for (var k in p) copy[k] = p[k];
          copy.to = addDays(date, -1);
          env.upsert('periods', ['id'], copy);
        }
      });
      adds.forEach(function (a) { env.append('periods', a); });
      env.upsert('daily', ['date', 'deptId'], row);
      log(env, user, '부서 입력', date + ' ' + dept.name + ' 총' + total + '/근무' + row.working +
        (adds.length ? ' · 기간 ' + adds.map(function (a) { return a.name + '~' + a.to.slice(5); }).join(', ') : '') +
        (ends.length ? ' · 기간 끝냄 ' + ends.length + '건' : ''));
    });
    return { row: dailyOut(row), periods: periodsOn(env, date)[dept.id] || [] };
  }

  // 협력사 여러 곳을 한 번에 저장 : items = [{ partnerId, total, working }]
  function savePartners(req, user, env) {
    var date = checkDate(req.date);
    if (!Array.isArray(req.items) || !req.items.length) fail('저장할 내용이 없습니다.');
    var all = env.read('partners');
    var rows = req.items.map(function (it) {
      var p = all.filter(function (x) { return x.id === it.partnerId; })[0];
      if (!p) fail('협력사를 찾을 수 없습니다.');
      requireEdit(env, user, date, 'p:' + p.id);
      var total = int(it.total, 0, 9999, p.name + ' 총인원');
      var working = int(it.working, 0, 9999, p.name + ' 근무자');
      if (working > total) fail(p.name + ': 근무자가 총인원보다 많습니다.');
      return { date: date, partnerId: p.id, total: total, working: working, by: user.name, at: stamp(env), _name: p.name };
    });
    var out = {};
    env.lock(function () {
      rows.forEach(function (r) {
        env.upsert('pdaily', ['date', 'partnerId'], r);
        out[r.partnerId] = { total: r.total, working: r.working, by: r.by, at: r.at };
      });
      log(env, user, '협력사 입력', date + ' ' + rows.map(function (r) { return r._name + ' ' + r.working + '/' + r.total; }).join(', '));
    });
    return { prows: out };
  }

  function saveEtc(req, user, env) {
    var date = checkDate(req.date);
    requireEdit(env, user, date, 'etc');
    var lines = String(req.text == null ? '' : req.text).split('\n')
      .map(function (s) { return text(s, 200, '기타 내용'); }).filter(Boolean);
    if (lines.length > 30) fail('기타 내용은 30줄 이내로 적어 주세요.');
    var row = { date: date, text: lines.join('\n'), by: user.name, at: stamp(env) };
    env.lock(function () {
      if (lines.length) env.upsert('etc', ['date'], row);
      else env.remove('etc', ['date'], { date: date });
      log(env, user, '기타 입력', date + ' ' + lines.length + '줄');
    });
    return { etc: lines.length ? { text: row.text, by: row.by, at: row.at } : null };
  }

  // 결재 전 한 번에 "이상 없음" 처리 : 아직 입력 안 된 내 담당 부서를 기본 인원 그대로 저장
  function confirmRest(req, user, env) {
    var date = checkDate(req.date);
    var done = {};
    env.read('daily').forEach(function (r) { if (r.date === date) done[r.deptId] = true; });
    var saved = [];
    env.lock(function () {
      var periods = periodsOn(env, date);
      activeDepts(env).forEach(function (d) {
        if (done[d.id] || !canEditTarget(user, 'd:' + d.id)) return;
        requireEdit(env, user, date, 'd:' + d.id);
        var working = Math.max(0, num(d.total) - absentOf(mergedLists(null, periods[d.id])));
        env.upsert('daily', ['date', 'deptId'], {
          date: date, deptId: d.id, total: num(d.total), working: working,
          trip: '', hq: '', edu: '', leave: '', by: user.name, at: stamp(env)
        });
        saved.push(d.name);
      });
      if (saved.length) log(env, user, '이상 없음 일괄', date + ' ' + saved.join(', '));
    });
    return { saved: saved };
  }

  /* ---------- 기간 통계 ---------- */

  function stats(req, user, env) {
    var from = checkDate(req.from), to = checkDate(req.to);
    if (from > to) fail('시작일이 종료일보다 늦습니다.');
    if (Date.parse(to) - Date.parse(from) > 400 * 86400000) fail('기간은 1년 이내로 골라 주세요.');
    var depts = activeDepts(env), partners = activePartners(env);
    var byDate = {};
    function day(d) { return byDate[d] || (byDate[d] = { rows: {}, prows: {} }); }
    env.read('daily').forEach(function (r) { if (r.date >= from && r.date <= to) day(r.date).rows[r.deptId] = r; });
    env.read('pdaily').forEach(function (r) { if (r.date >= from && r.date <= to) day(r.date).prows[r.partnerId] = r; });
    env.read('etc').forEach(function (r) { if (r.date >= from && r.date <= to) day(r.date); });
    var dates = Object.keys(byDate).sort();
    var allPeriods = env.read('periods').filter(function (p) { return p.to >= from && p.from <= to; });

    var deptAgg = {}, people = {}, daily = [];
    depts.forEach(function (d) { deptAgg[d.id] = { id: d.id, name: d.name, level: num(d.level), days: 0, total: 0, working: 0, trip: 0, hq: 0, edu: 0, leave: 0 }; });
    dates.forEach(function (date) {
      var b = byDate[date];
      var t = { date: date, total: 0, working: 0, trip: 0, hq: 0, edu: 0, leave: 0, ptotal: 0, pworking: 0, entered: 0 };
      depts.forEach(function (d) {
        var r = b.rows[d.id];
        var a = deptAgg[d.id];
        var plist = allPeriods.filter(function (p) { return p.deptId === d.id && p.from <= date && p.to >= date; });
        var lists = mergedLists(r ? dailyOut(r) : null, plist);
        var total = r ? num(r.total) : num(d.total);
        var working = Math.max(0, total - absentOf(lists));
        a.days++; a.total += total; a.working += working;
        t.total += total; t.working += working;
        if (r) t.entered++;
        CATEGORIES.forEach(function (c) {
          lists[c].forEach(function (entry) {
            a[c]++; t[c]++;
            var nm = personName(entry);
            var key = nm + '|' + d.id;
            var p = people[key] || (people[key] = { name: nm, dept: d.name, trip: 0, hq: 0, edu: 0, leave: 0, dates: [] });
            p[c]++;
            p.dates.push({ date: date, cat: c, note: entry });
          });
        });
      });
      partners.forEach(function (p) {
        var r = b.prows[p.id];
        t.ptotal += r ? num(r.total) : num(p.total);
        t.pworking += r ? num(r.working) : num(p.total);
      });
      daily.push(t);
    });
    var list = Object.keys(people).map(function (k) { return people[k]; });
    list.sort(function (x, y) {
      return (y.trip + y.edu + y.leave + y.hq) - (x.trip + x.edu + x.leave + x.hq) || (x.name < y.name ? -1 : 1);
    });
    return { from: from, to: to, days: dates.length, daily: daily,
             depts: depts.map(function (d) { return deptAgg[d.id]; }), people: list };
  }

  /* ---------- 관리 ---------- */

  function adminConfig(req, user, env) {
    requireAdmin(user);
    return {
      depts: env.read('depts').slice().sort(byOrder).map(function (d) {
        return { id: d.id, name: d.name, level: num(d.level), order: num(d.order), total: num(d.total), active: truthy(d.active) };
      }),
      partners: env.read('partners').slice().sort(byOrder).map(function (p) {
        return { id: p.id, name: p.name, order: num(p.order), total: num(p.total), active: truthy(p.active) };
      }),
      users: env.read('users').map(publicUser),
      settings: publicSettings(env)
    };
  }

  function nextOrder(env, table) {
    return env.read(table).reduce(function (m, r) { return Math.max(m, num(r.order)); }, 0) + 1;
  }

  function saveDeptCfg(req, user, env) {
    requireAdmin(user);
    var name = text(req.name, 30, '부서명');
    if (!name) fail('부서명을 적어 주세요.');
    var cur = req.id ? env.read('depts').filter(function (d) { return d.id === req.id; })[0] : null;
    if (req.id && !cur) fail('부서를 찾을 수 없습니다.');
    var dup = env.read('depts').some(function (d) { return d.name === name && d.id !== req.id && truthy(d.active); });
    if (dup) fail('같은 이름의 부서가 이미 있습니다.');
    var row = {
      id: cur ? cur.id : newId('D', env), name: name,
      level: req.level ? 1 : 0,
      order: cur ? num(cur.order) : nextOrder(env, 'depts'),
      total: int(req.total, 0, 999, '기본 총인원'),
      active: req.active === false ? 'FALSE' : 'TRUE'
    };
    env.lock(function () {
      env.upsert('depts', ['id'], row);
      log(env, user, cur ? '부서 수정' : '부서 추가', name);
    });
    return adminConfig(req, user, env);
  }

  function savePartnerCfg(req, user, env) {
    requireAdmin(user);
    var name = text(req.name, 30, '업체명');
    if (!name) fail('업체명을 적어 주세요.');
    var cur = req.id ? env.read('partners').filter(function (p) { return p.id === req.id; })[0] : null;
    if (req.id && !cur) fail('협력사를 찾을 수 없습니다.');
    var dup = env.read('partners').some(function (p) { return p.name === name && p.id !== req.id && truthy(p.active); });
    if (dup) fail('같은 이름의 업체가 이미 있습니다.');
    var row = {
      id: cur ? cur.id : newId('P', env), name: name,
      order: cur ? num(cur.order) : nextOrder(env, 'partners'),
      total: int(req.total, 0, 9999, '기본 총인원'),
      active: req.active === false ? 'FALSE' : 'TRUE'
    };
    env.lock(function () {
      env.upsert('partners', ['id'], row);
      log(env, user, cur ? '협력사 수정' : '협력사 추가', name);
    });
    return adminConfig(req, user, env);
  }

  function reorder(req, user, env) {
    requireAdmin(user);
    var table = req.table === 'partners' ? 'partners' : 'depts';
    if (!Array.isArray(req.ids)) fail('순서 정보가 없습니다.');
    var rows = env.read(table);
    env.lock(function () {
      req.ids.forEach(function (id, i) {
        var r = rows.filter(function (x) { return x.id === id; })[0];
        if (r && num(r.order) !== i + 1) {
          var copy = {};
          for (var k in r) copy[k] = r[k];
          copy.order = i + 1;
          env.upsert(table, ['id'], copy);
        }
      });
    });
    return adminConfig(req, user, env);
  }

  function saveUser(req, user, env) {
    requireAdmin(user);
    var name = text(req.name, 30, '이름');
    if (!name) fail('이름을 적어 주세요.');
    if (!ROLES[req.role]) fail('권한을 골라 주세요.');
    var users = env.read('users');
    var cur = req.id ? users.filter(function (u) { return u.id === req.id; })[0] : null;
    if (req.id && !cur) fail('계정을 찾을 수 없습니다.');
    if (users.some(function (u) { return u.name === name && u.id !== req.id && truthy(u.active); })) {
      fail('같은 이름의 계정이 이미 있습니다. 동명이인이면 "홍길동(설계)"처럼 구분해 주세요.');
    }
    var scope = Array.isArray(req.scope) ? req.scope.map(String).filter(function (s) { return /^(\*|etc|[dp]:[A-Za-z0-9]+)$/.test(s); }) : [];
    var active = req.active !== false;
    if (cur && isAdmin(cur) && (req.role !== 'admin' || !active)) {
      var admins = users.filter(function (u) { return isAdmin(u) && truthy(u.active) && u.id !== cur.id; });
      if (!admins.length) fail('관리자가 한 명은 남아 있어야 합니다.');
    }
    var row = {
      id: cur ? cur.id : newId('U', env), name: name, role: req.role,
      scope: req.role === 'admin' ? '*' : scope.join(','),
      salt: cur ? cur.salt : '', pinHash: cur ? cur.pinHash : '',
      mustChange: cur ? cur.mustChange : 'FALSE',
      active: active ? 'TRUE' : 'FALSE', updatedAt: stamp(env)
    };
    if (req.pin || !cur) {
      var pin = checkPin(req.pin);
      row.salt = env.uuid();                // salt가 바뀌면 이전 로그인은 모두 풀림
      row.pinHash = hashPin(row.salt, pin);
      row.mustChange = req.mustChange ? 'TRUE' : 'FALSE';
    }
    env.lock(function () {
      env.upsert('users', ['id'], row);
      log(env, user, cur ? '계정 수정' : '계정 추가', name + ' (' + ROLES[row.role] + ')' + (req.pin && cur ? ' PIN 재설정' : ''));
    });
    return adminConfig(req, user, env);
  }

  function deleteUser(req, user, env) {
    requireAdmin(user);
    var cur = findUser(env, req.id);
    if (!cur) fail('계정을 찾을 수 없습니다.');
    if (cur.id === user.id) fail('내 계정은 지울 수 없습니다.');
    if (isAdmin(cur) && !env.read('users').some(function (u) { return isAdmin(u) && truthy(u.active) && u.id !== cur.id; })) {
      fail('관리자가 한 명은 남아 있어야 합니다.');
    }
    env.lock(function () {
      env.remove('users', ['id'], { id: cur.id });
      log(env, user, '계정 삭제', cur.name);
    });
    return adminConfig(req, user, env);
  }

  function saveSettings(req, user, env) {
    requireAdmin(user);
    var vals = {
      orgName: text(req.orgName, 40, '조직명') || DEFAULT_SETTINGS.orgName,
      partnerTitle: text(req.partnerTitle, 30, '협력사 제목') || DEFAULT_SETTINGS.partnerTitle,
      partnerNote: text(req.partnerNote, 40, '협력사 설명'),
      etcTitle: text(req.etcTitle, 30, '기타 제목') || DEFAULT_SETTINGS.etcTitle,
      editDays: String(int(req.editDays, 0, 365, '수정 가능 기간'))
    };
    env.lock(function () {
      for (var k in vals) env.upsert('settings', ['key'], { key: k, value: vals[k] });
      log(env, user, '설정 변경', '');
    });
    return adminConfig(req, user, env);
  }

  function readLog(req, user, env) {
    requireAdmin(user);
    var rows = env.read('log');
    var limit = Math.min(500, Math.max(1, num(req.limit) || 200));
    return { log: rows.slice(-limit).reverse().map(function (r) { return { at: r.at, user: r.user, action: r.action, detail: r.detail }; }) };
  }

  function changePin(req, user, env) {
    if (!safeEqual(hashPin(user.salt, String(req.oldPin || '')), user.pinHash)) fail('지금 쓰는 PIN이 맞지 않습니다.');
    var pin = checkPin(req.newPin);
    if (String(req.oldPin) === pin) fail('지금과 다른 PIN으로 정해 주세요.');
    var row = {};
    for (var k in user) row[k] = user[k];
    row.salt = env.uuid();
    row.pinHash = hashPin(row.salt, pin);
    row.mustChange = 'FALSE';
    row.updatedAt = stamp(env);
    env.lock(function () {
      env.upsert('users', ['id'], row);
      log(env, user, 'PIN 변경', '');
    });
    return { token: makeToken(env, row, !!req.remember), user: publicUser(row) };
  }

  function me(req, user, env) {
    return { user: publicUser(user), settings: publicSettings(env), today: kstToday(env) };
  }

  var ACTIONS = {
    me: me, board: board, boards: boards, saveDept: saveDept, savePartners: savePartners, saveEtc: saveEtc,
    confirmRest: confirmRest, stats: stats, changePin: changePin,
    adminConfig: adminConfig, saveDeptCfg: saveDeptCfg, savePartnerCfg: savePartnerCfg, reorder: reorder,
    saveUser: saveUser, deleteUser: deleteUser, saveSettings: saveSettings, log: readLog
  };

  function handle(req, env) {
    try {
      req = req || {};
      ensureSeeded(env);
      if (req.action === 'login') return ok(login(req, env));
      var fn = ACTIONS[req.action];
      if (!fn) fail('알 수 없는 요청입니다.');
      var user = auth(env, req.token);
      if (!user) return { ok: false, error: 'AUTH', message: '로그인이 끝났습니다. 다시 로그인해 주세요.' };
      if (truthy(user.mustChange) && req.action !== 'changePin' && req.action !== 'me') {
        return { ok: false, error: 'MUST_CHANGE', message: '처음 쓰는 PIN을 먼저 바꿔 주세요.' };
      }
      return ok(fn(req, user, env));
    } catch (e) {
      return { ok: false, error: e.code || 'SERVER', message: e.code ? e.message : '서버 오류: ' + (e.message || e) };
    }
  }

  function ok(data) { data.ok = true; return data; }

  return {
    TABLES: TABLES, handle: handle, sha256: sha256, hmac: hmac, personName: personName,
    ABSENT_CATEGORIES: ABSENT_CATEGORIES, INITIAL_ADMIN: INITIAL_ADMIN
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = AttendanceCore;
