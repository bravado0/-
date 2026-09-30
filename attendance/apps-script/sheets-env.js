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

/**
 * 사내 서버(NAS)로 옮길 때 편집기에서 한 번 실행: 모든 탭을 JSON 파일 하나로 구글 드라이브에 저장합니다.
 * 파일에는 PIN 해시가 들어 있으니, NAS에 넣은 뒤에는 드라이브와 PC에서 지우세요.
 */
function exportForNas() {
  var env = SheetsEnv_();
  var out = { exportedAt: new Date().toISOString(), tables: {} };
  Object.keys(AttendanceCore.TABLES).forEach(function (t) {
    var fields = AttendanceCore.TABLES[t].fields;
    out.tables[t] = env.read(t).map(function (r) {
      var o = {};
      fields.forEach(function (f) { o[f] = r[f]; });
      return o;
    });
  });
  var day = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
  var f = DriveApp.createFile('근태현황_NAS이전_' + day + '.json', JSON.stringify(out), 'application/json');
  Logger.log('만들었어요. 구글 드라이브 "내 드라이브"에서 받으세요: ' + f.getName() + ' (' + f.getUrl() + ')');
  Object.keys(out.tables).forEach(function (t) { Logger.log('  ' + t + ': ' + out.tables[t].length + '줄'); });
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

  // 시트 탭은 한 번에 찾아 둠 (탭마다 따로 찾으면 그만큼 느려짐)
  var byName = null;
  function sheet(t) {
    if (sheets[t]) return sheets[t];
    var def = T[t];
    if (!byName) {
      byName = {};
      ss.getSheets().forEach(function (x) { byName[x.getName()] = x; });
    }
    var sh = byName[def.name];
    if (!sh) {
      sh = ss.insertSheet(def.name);
      sh.getRange(1, 1, sh.getMaxRows(), def.fields.length).setNumberFormat('@');
      sh.getRange(1, 1, 1, def.labels.length).setValues([def.labels])
        .setFontWeight('bold').setBackground('#1f3b5c').setFontColor('#ffffff');
      sh.setFrozenRows(1);
      if (t === 'users') sh.hideColumns(5, 2);  // salt, PIN해시 열 숨김
      byName[def.name] = sh;
    }
    return (sheets[t] = sh);
  }

  // 새 칸이 생긴 탭은 제목 줄을 다시 씀. 쓸 때만, 6시간에 한 번만 확인
  function checkHeader(t, sh) {
    var def = T[t], key = 'hdr:' + t + ':' + def.fields.length;
    if (scriptCache.get(key)) return;
    if (sh.getLastColumn() < def.fields.length) {
      sh.getRange(1, 1, 1, def.labels.length).setValues([def.labels])
        .setFontWeight('bold').setBackground('#1f3b5c').setFontColor('#ffffff');
    }
    scriptCache.put(key, '1', 21600);
  }

  // 계정·부서·협력사·설정은 자주 안 바뀌어서 임시 저장소에 넣어 두고 읽음 (바뀌면 바로 지움)
  var QUICK = { users: 1, depts: 1, partners: 1, settings: 1 };
  var QUICK_TTL = 600;
  function quickKey(t) { return 'tbl:' + t; }
  function forget(t) { if (QUICK[t]) scriptCache.remove(quickKey(t)); }

  function read(t) {
    if (cacheRows[t]) return cacheRows[t];
    if (QUICK[t] && !lockDepth) {
      var hit = scriptCache.get(quickKey(t));
      if (hit) { try { return (cacheRows[t] = JSON.parse(hit)); } catch (e) { /* 다시 읽음 */ } }
    }
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
    if (QUICK[t] && !lockDepth) {
      var json = JSON.stringify(rows);
      if (json.length < 90000) scriptCache.put(quickKey(t), json, QUICK_TTL);
    }
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
    checkHeader(t, sh);
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
    forget(t);
  }

  function append(t, row) {
    var sh = sheet(t), n = T[t].fields.length;
    if (t !== 'log') checkHeader(t, sh);
    var r = Math.max(sh.getLastRow(), 1) + 1;
    sh.getRange(r, 1, 1, n).setNumberFormat('@').setValues([values(t, row)]);
    delete cacheRows[t];
    forget(t);
  }

  // 여러 줄을 한 번에 아래에 붙임 (엑셀 가져오기)
  function appendMany(t, list) {
    if (!list.length) return;
    forget(t);
    var sh = sheet(t), n = T[t].fields.length;
    checkHeader(t, sh);
    var r = Math.max(sh.getLastRow(), 1) + 1;
    sh.getRange(r, 1, list.length, n).setNumberFormat('@').setValues(list.map(function (row) { return values(t, row); }));
    delete cacheRows[t];
  }

  function remove(t, keys, m) {
    var rows = read(t), sh = sheet(t);
    var hits = rows.filter(function (r) { return match(keys, r, m); });
    hits.sort(function (a, b) { return b._row - a._row; }).forEach(function (r) { sh.deleteRow(r._row); });
    if (hits.length) delete cacheRows[t];
    forget(t);
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
    read: read, upsert: upsert, append: append, appendMany: appendMany, remove: remove, lock: lock, secret: secret,
    now: function () { return new Date(); },
    uuid: function () { return Utilities.getUuid(); },
    cacheGet: function (k) { return scriptCache.get(k); },
    cachePut: function (k, v, ttl) { scriptCache.put(k, v, ttl); },
    cacheRemove: function (k) { scriptCache.remove(k); }
  };
}
