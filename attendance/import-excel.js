/*
 * 예전 근태 엑셀 읽기 (관리 → 가져오기)
 * 엑셀은 사용자 브라우저 안에서만 읽고, 결과를 서버(구글 시트)에 보냅니다.
 * 시트 하나 = 하루. 표 모양이 조금씩 달라도(출장·휴가만 있는 옛 양식, 인원수만 적힌 칸 등) 읽을 수 있게 만듦.
 */
var ExcelImport = (function () {
  'use strict';

  var CAT_LABELS = { '출장': 'trip', '본사근무': 'hq', '교육': 'edu', '휴가': 'leave' };
  var NO_NAME = '이름 미기재';

  function norm(v) { return String(v == null ? '' : v).replace(/\s+/g, ''); }
  function str(v) { return v == null ? '' : String(v).trim(); }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function toDate(v) {
    if (v instanceof Date && !isNaN(v)) return v.getFullYear() + '-' + pad(v.getMonth() + 1) + '-' + pad(v.getDate());
    if (isNum(v) && v > 30000 && v < 80000) {           // 엑셀 날짜 숫자
      var d = new Date(Math.round((v - 25569) * 86400000));
      return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
    }
    var m = String(v || '').match(/(\d{4})[-.\/]\s*(\d{1,2})[-.\/]\s*(\d{1,2})/);
    return m ? m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]) : '';
  }

  // "홍길동,김철수" / 줄바꿈 / "이영희 과장(A사), 박민수 대리(B사)" → 사람별로. 괄호 안 쉼표는 나누지 않음
  function splitNames(v) {
    if (v == null || v === '') return [];
    if (isNum(v)) { var n = []; for (var i = 0; i < v; i++) n.push(NO_NAME); return n; }
    var out = [], cur = '', depth = 0, s = String(v);
    for (var j = 0; j < s.length; j++) {
      var ch = s[j];
      if ('(（['.indexOf(ch) >= 0) depth++;
      if (')）]'.indexOf(ch) >= 0) depth = Math.max(0, depth - 1);
      if ((ch === ',' || ch === '，' || ch === '\n' || ch === '/') && depth === 0) { if (cur.trim()) out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    // "홍길동(A사)" → "홍길동 (A사)" 으로 모양을 맞춤
    return out.map(function (e) { return e.replace(/\s*[（(]\s*/, ' (').replace(/\s*[）)]\s*$/, ')').replace(/\s+/g, ' '); });
  }

  function findCell(aoa, test, maxRow) {
    for (var r = 0; r < Math.min(aoa.length, maxRow || aoa.length); r++) {
      var row = aoa[r] || [];
      for (var c = 0; c < row.length; c++) if (test(row[c], r, c)) return { r: r, c: c };
    }
    return null;
  }

  function parseSheet(name, aoa, fallbackYear) {
    var warn = [];
    // 날짜 : 시트 이름 "9.30(수)"의 월·일을 먼저 따르고, 연도는 "날짜:" 옆 칸에서
    var cellDate = '', date = '';
    var dl = findCell(aoa, function (v) { return /날짜/.test(str(v)); }, 6);
    if (dl) {
      var row = aoa[dl.r] || [];
      for (var c = dl.c + 1; c < row.length && !cellDate; c++) cellDate = toDate(row[c]);
    }
    var m = name.match(/(\d{1,2})\s*[.\/-]\s*(\d{1,2})/);
    if (m && +m[1] >= 1 && +m[1] <= 12 && +m[2] >= 1 && +m[2] <= 31) {
      date = (cellDate ? cellDate.slice(0, 4) : fallbackYear) + '-' + pad(+m[1]) + '-' + pad(+m[2]);
      if (cellDate && cellDate !== date) warn.push('날짜 칸(' + cellDate.slice(5).replace('-', '.') + ')과 시트 이름이 달라 시트 이름을 따름');
    } else date = cellDate;
    if (!date) return { name: name, error: '날짜를 찾지 못했어요' };

    // 제목 줄 : "총인원"이 두 번(본부, 협력사) 나오는 줄
    var hr = -1;
    for (var r = 0; r < Math.min(aoa.length, 12); r++) {
      if ((aoa[r] || []).filter(function (v) { return norm(v) === '총인원'; }).length >= 1 &&
          (aoa[r] || []).some(function (v) { return norm(v) === '근무자'; })) { hr = r; break; }
    }
    if (hr < 0) return { name: name, date: date, error: '표 제목(총인원·근무자)을 찾지 못했어요' };
    var head = aoa[hr];
    var totals = [], works = [], cats = {};
    head.forEach(function (v, c) {
      var k = norm(v);
      if (k === '총인원') totals.push(c);
      else if (k === '근무자') works.push(c);
      else if (CAT_LABELS[k] && cats[CAT_LABELS[k]] == null) cats[CAT_LABELS[k]] = c;
    });
    var pCol = -1;
    for (var rr = Math.max(0, hr - 2); rr <= hr; rr++) {
      (aoa[rr] || []).forEach(function (v, c) { if (norm(v) === '업체명') pCol = c; });
    }

    var depts = [], partners = [], end = hr + 1;
    for (r = hr + 1; r < aoa.length; r++) {
      var rowv = aoa[r] || [];
      var dn = str(rowv[0]) || str(rowv[1]);
      if (/^소\s*계$/.test(dn.replace(/\s+/g, ' ')) || norm(dn) === '소계') { end = r; break; }
      if (dn && totals[0] != null && rowv[totals[0]] != null && rowv[totals[0]] !== '') {
        var d = { name: dn, total: +rowv[totals[0]] || 0, working: rowv[works[0]] };
        Object.keys(CAT_LABELS).forEach(function (lab) {
          var key = CAT_LABELS[lab];
          d[key] = cats[key] != null ? splitNames(rowv[cats[key]]) : [];
        });
        depts.push(d);
      }
      if (pCol >= 0 && str(rowv[pCol]) && !/소\s*계/.test(str(rowv[pCol])) && totals[1] != null) {
        partners.push({ name: str(rowv[pCol]), total: +rowv[totals[1]] || 0, working: +rowv[works[1]] || 0 });
      }
      end = r;
    }

    // 기타(공장내 작업) + 옛 양식의 "상세 근태현황"
    var etc = [];
    for (r = end; r < aoa.length; r++) {
      var rw = aoa[r] || [];
      if (/^기타/.test(str(rw[0]))) {
        rw.slice(1).forEach(function (v) {
          var t = str(v);
          if (t && !/^※/.test(t)) t.split('\n').forEach(function (l) {
            l = l.replace(/^\s*\d+\s*[.)]\s*/, '').replace(/\s+/g, ' ').replace(/\s*,\s*인원\s*:\s*\)/, ')').trim();
            if (l) etc.push(l);
          });
        });
      }
    }
    var det = findCell(aoa, function (v) { return /상세\s*근태/.test(str(v)); });
    if (det) {
      var kind = '';
      for (r = det.r + 2; r < aoa.length; r++) {
        var x = aoa[r] || [];
        if (str(x[0])) kind = str(x[0]);
        var who = x.slice(2, (pCol > 0 ? pCol : x.length)).map(str).filter(Boolean).join(' ');
        if (who) etc.push('[상세] ' + kind + (str(x[1]) ? ' ' + str(x[1]) : '') + ': ' + who);
      }
    }

    var dow = new Date(date + 'T00:00:00Z').getUTCDay();
    var weekend = dow === 0 || dow === 6;
    var manual = 0, noName = 0;
    depts.forEach(function (d) {
      var absent = d.trip.length + d.edu.length + d.leave.length;
      var calc = Math.max(0, d.total - absent);
      if (d.working === '' || d.working == null) d.working = weekend ? 0 : calc;   // 주말 빈칸 = 근무 없음
      d.working = +d.working || 0;
      if (d.working !== calc) manual++;
      ['trip', 'hq', 'edu', 'leave'].forEach(function (k) { noName += d[k].filter(function (e) { return e === NO_NAME; }).length; });
    });
    if (manual) warn.push('근무자 수 ' + manual + '곳은 엑셀 숫자 그대로');
    if (noName) warn.push('이름 없이 인원수만 ' + noName + '명 (\'' + NO_NAME + '\'으로 넣음)');
    if (weekend) warn.push('주말');
    return { name: name, date: date, depts: depts, partners: partners, etc: etc.join('\n'), warn: warn };
  }

  // sheets = [{ name, aoa }] , 부서·협력사 이름을 ID로 바꿔 서버에 보낼 모양으로
  function build(sheets, depts, partners, fallbackYear) {
    var dmap = {}, pmap = {};
    depts.forEach(function (d) { dmap[norm(d.name)] = d.id; });
    partners.forEach(function (p) { pmap[norm(p.name)] = p.id; });
    var unknown = {};
    var days = sheets.map(function (s) { return parseSheet(s.name, s.aoa, fallbackYear); });
    var seen = {};
    days.forEach(function (d) {
      if (d.error) return;
      if (seen[d.date]) { d.error = d.date + ' 날짜가 두 번 나와서 뺐어요'; return; }
      seen[d.date] = 1;
      d.send = {
        date: d.date,
        depts: d.depts.map(function (x) {
          var id = dmap[norm(x.name)];
          if (!id) { unknown['부서 ' + x.name] = 1; return null; }
          return { deptId: id, total: x.total, working: x.working, trip: x.trip, hq: x.hq, edu: x.edu, leave: x.leave };
        }).filter(Boolean),
        partners: d.partners.map(function (x) {
          var id = pmap[norm(x.name)];
          if (!id) { unknown['협력사 ' + x.name] = 1; return null; }
          return { partnerId: id, total: x.total, working: x.working };
        }).filter(Boolean),
        etc: d.etc
      };
      d.people = d.depts.reduce(function (n, x) { return n + x.trip.length + x.hq.length + x.edu.length + x.leave.length; }, 0);
    });
    days.sort(function (a, b) { return (a.date || '') < (b.date || '') ? -1 : 1; });
    return { days: days, unknown: Object.keys(unknown) };
  }

  return { build: build, parseSheet: parseSheet, splitNames: splitNames };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ExcelImport;
