/*
 * Google 시트 저장소 + 웹 앱 입구 (Apps Script 전용)
 * 이 스크립트는 근태 데이터를 담을 구글 시트에 "확장 프로그램 → Apps Script"로 붙여 씁니다.
 */

function doPost(e) {
  var req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'BAD_REQUEST', message: '요청 형식이 올바르지 않습니다.' });
  }
  return json_(AttendanceCore.handle(req, SheetsEnv_()));
}

function doGet() {
  return json_({ ok: true, service: 'attendance', message: '근태현황 서버가 켜져 있습니다.' });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** 편집기에서 한 번 실행: 시트 탭을 만들고 기본 부서·협력사·관리자 계정을 넣습니다. */
function setup() {
  var env = SheetsEnv_();
  Object.keys(AttendanceCore.TABLES).forEach(function (t) { env.read(t); });
  AttendanceCore.handle({ action: 'me' }, env);   // 처음이면 기본 부서·협력사·관리자 계정을 넣음
  Logger.log('준비 완료. 첫 로그인: 이름 "' + AttendanceCore.INITIAL_ADMIN.name + '", PIN "' +
             AttendanceCore.INITIAL_ADMIN.pin + '" (로그인하면 바로 새 PIN으로 바꾸게 됩니다)');
}

/** 관리자 PIN을 잊었을 때 편집기에서 실행: "관리자" 계정 PIN을 1234로 되돌립니다. */
function resetAdminPin() {
  var env = SheetsEnv_();
  var users = env.read('users');
  var admin = users.filter(function (u) { return u.role === 'admin'; })[0];
  if (!admin) { Logger.log('관리자 계정이 없습니다.'); return; }
  var salt = Utilities.getUuid();
  var row = {};
  for (var k in admin) row[k] = admin[k];
  row.salt = salt;
  row.pinHash = AttendanceCore.sha256(salt + ':' + AttendanceCore.INITIAL_ADMIN.pin);
  row.mustChange = 'TRUE';
  row.active = 'TRUE';
  env.upsert('users', ['id'], row);
  Logger.log('"' + admin.name + '" 계정 PIN을 ' + AttendanceCore.INITIAL_ADMIN.pin + '(으)로 되돌렸습니다. 로그인 후 바꿔 주세요.');
}

function SheetsEnv_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var T = AttendanceCore.TABLES;
  var cacheRows = {};
  var sheets = {};
  var scriptCache = CacheService.getScriptCache();
  var lockDepth = 0;

  function sheet(t) {
    if (sheets[t]) return sheets[t];
    var def = T[t];
    var sh = ss.getSheetByName(def.name);
    if (!sh) {
      sh = ss.insertSheet(def.name);
      sh.getRange(1, 1, sh.getMaxRows(), def.fields.length).setNumberFormat('@');
      sh.getRange(1, 1, 1, def.labels.length).setValues([def.labels])
        .setFontWeight('bold').setBackground('#1f3b5c').setFontColor('#ffffff');
      sh.setFrozenRows(1);
      if (t === 'users') sh.hideColumns(5, 2);  // salt, PIN해시 열 숨김
    }
    sheets[t] = sh;
    return sh;
  }

  function read(t) {
    if (cacheRows[t]) return cacheRows[t];
    var def = T[t], sh = sheet(t);
    var last = sh.getLastRow();
    var rows = [];
    if (last >= 2) {
      var vals = sh.getRange(2, 1, last - 1, def.fields.length).getDisplayValues();
      for (var i = 0; i < vals.length; i++) {
        var o = { _row: i + 2 };
        var empty = true;
        for (var j = 0; j < def.fields.length; j++) {
          o[def.fields[j]] = vals[i][j];
          if (vals[i][j] !== '') empty = false;
        }
        if (!empty) rows.push(o);
      }
    }
    cacheRows[t] = rows;
    return rows;
  }

  function cell(v) {
    var s = v == null ? '' : String(v);
    return /^[=+@]/.test(s) ? "'" + s : s;   // 수식으로 해석되지 않게
  }

  function values(t, row) {
    return T[t].fields.map(function (f) { return cell(row[f]); });
  }

  function match(keys, a, b) {
    for (var i = 0; i < keys.length; i++) if (String(a[keys[i]]) !== String(b[keys[i]])) return false;
    return true;
  }

  function upsert(t, keys, row) {
    var rows = read(t), sh = sheet(t), n = T[t].fields.length;
    var found = rows.filter(function (r) { return match(keys, r, row); })[0];
    var vals = values(t, row);
    if (found) {
      sh.getRange(found._row, 1, 1, n).setNumberFormat('@').setValues([vals]);
      T[t].fields.forEach(function (f, i) { found[f] = String(vals[i]).replace(/^'/, ''); });
    } else {
      var r = Math.max(sh.getLastRow(), 1) + 1;
      sh.getRange(r, 1, 1, n).setNumberFormat('@').setValues([vals]);
      var o = { _row: r };
      T[t].fields.forEach(function (f, i) { o[f] = String(vals[i]).replace(/^'/, ''); });
      rows.push(o);
    }
  }

  function append(t, row) {
    var sh = sheet(t), n = T[t].fields.length;
    var r = Math.max(sh.getLastRow(), 1) + 1;
    sh.getRange(r, 1, 1, n).setNumberFormat('@').setValues([values(t, row)]);
    delete cacheRows[t];
  }

  function remove(t, keys, m) {
    var rows = read(t), sh = sheet(t);
    var hits = rows.filter(function (r) { return match(keys, r, m); });
    hits.sort(function (a, b) { return b._row - a._row; }).forEach(function (r) { sh.deleteRow(r._row); });
    if (hits.length) delete cacheRows[t];
  }

  function lock(fn) {
    if (lockDepth > 0) return fn();
    var l = LockService.getScriptLock();
    l.waitLock(20000);
    lockDepth++;
    try {
      cacheRows = {};             // 잠금 뒤에는 최신 내용으로 다시 읽음
      return fn();
    } finally {
      lockDepth--;
      SpreadsheetApp.flush();
      l.releaseLock();
    }
  }

  function secret() {
    var props = PropertiesService.getScriptProperties();
    var s = props.getProperty('SECRET');
    if (!s) {
      s = Utilities.getUuid() + Utilities.getUuid();
      props.setProperty('SECRET', s);
    }
    return s;
  }

  return {
    read: read, upsert: upsert, append: append, remove: remove, lock: lock, secret: secret,
    now: function () { return new Date(); },
    uuid: function () { return Utilities.getUuid(); },
    cacheGet: function (k) { return scriptCache.get(k); },
    cachePut: function (k, v, ttl) { scriptCache.put(k, v, ttl); },
    cacheRemove: function (k) { scriptCache.remove(k); }
  };
}
