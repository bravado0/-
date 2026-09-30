/*
 * 체험 모드 저장소 : config.js에 서버 주소가 없을 때 이 브라우저(localStorage)에 저장합니다.
 * 실제 서버와 똑같은 core.js를 돌리므로 화면 동작은 운영과 같습니다.
 */
var LocalBackend = (function () {
  var KEY = 'attendance-demo-db-v1';
  var db;

  function load() {
    try { db = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { db = null; }
    if (!db || !db.tables) db = { tables: {}, cache: {}, secret: '' };
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* 저장 못 해도 이번 화면은 계속 */ }
  }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }

  function rows(t) { return db.tables[t] || (db.tables[t] = []); }

  function match(keys, a, b) {
    for (var i = 0; i < keys.length; i++) if (String(a[keys[i]]) !== String(b[keys[i]])) return false;
    return true;
  }

  function norm(t, row) {
    var o = {};
    AttendanceCore.TABLES[t].fields.forEach(function (f) { o[f] = row[f] == null ? '' : String(row[f]); });
    return o;
  }

  var env = {
    read: function (t) { return rows(t); },
    upsert: function (t, keys, row) {
      var list = rows(t), o = norm(t, row);
      for (var i = 0; i < list.length; i++) if (match(keys, list[i], o)) { list[i] = o; return; }
      list.push(o);
    },
    append: function (t, row) {
      var list = rows(t);
      list.push(norm(t, row));
      if (t === 'log' && list.length > 2000) list.splice(0, list.length - 2000);
    },
    remove: function (t, keys, m) { db.tables[t] = rows(t).filter(function (r) { return !match(keys, r, m); }); },
    lock: function (fn) { return fn(); },
    secret: function () { return db.secret || (db.secret = uuid() + uuid()); },
    now: function () { return new Date(); },
    uuid: uuid,
    cacheGet: function (k) {
      var c = db.cache[k];
      return c && c.exp > Date.now() ? c.v : null;
    },
    cachePut: function (k, v, ttl) { db.cache[k] = { v: v, exp: Date.now() + ttl * 1000 }; },
    cacheRemove: function (k) { delete db.cache[k]; }
  };

  // 체험용 예시 : 엑셀 화면에 있던 내용을 오늘 날짜로 넣어 둠
  function sample() {
    if (db.sampled) return;
    var today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    var at = today + ' 08:30:00';
    var d = function (id, total, working, trip, hq, leave) {
      env.upsert('daily', ['date', 'deptId'], { date: today, deptId: id, total: total, working: working,
        trip: (trip || []).join('\n'), hq: (hq || []).join('\n'), edu: '', leave: (leave || []).join('\n'), by: '관리자', at: at });
    };
    d('D1', 1, 0, ['홍길동 (A사)']);
    d('D2', 8, 6, ['김철수 (B사)', '이영희 (A사)'], ['박민수', '최지훈']);
    d('D3', 3, 3);
    d('D6', 11, 10, null, null, ['정다은']);
    [[9, 8], [2, 2], [3, 2], [8, 6], [3, 2], [11, 10], [2, 2], [9, 9], [39, 39], [26, 23]].forEach(function (p, i) {
      env.upsert('pdaily', ['date', 'partnerId'], { date: today, partnerId: 'P' + (i + 1), total: p[0], working: p[1], by: '관리자', at: at });
    });
    env.upsert('etc', ['date'], { date: today, by: '관리자', at: at,
      text: '야적장 포장공사 (상호: 가나건설)\n비파괴 검사 (상호: 다라검사)\n2공장 포장작업 (상호: 마바산업, 인원: 2)' });
    db.sampled = true;
  }

  function call(req) {
    load();
    var res = AttendanceCore.handle(JSON.parse(JSON.stringify(req)), env);
    if (!db.sampled && rows('depts').length) sample();
    save();
    return JSON.parse(JSON.stringify(res));
  }

  function reset() { localStorage.removeItem(KEY); }

  return { call: call, reset: reset };
})();
