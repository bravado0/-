/* 일일 근태현황 : 화면 */
(function () {
  'use strict';

  var CONFIG = window.ATTENDANCE_CONFIG || {};
  var DEMO = !CONFIG.apiUrl;
  var TOKEN_KEY = 'attendance-token';
  var CATS = [
    { key: 'trip', label: '출장', absent: true, color: 'var(--trip)' },
    { key: 'hq', label: '본사근무', absent: false, color: 'var(--hq)' },
    { key: 'edu', label: '교육', absent: true, color: 'var(--edu)' },
    { key: 'leave', label: '휴가', absent: true, color: 'var(--leave)' }
  ];
  var DOW = ['일', '월', '화', '수', '목', '금', '토'];

  var S = {
    token: null, user: null, settings: {}, today: '',
    tab: 'board', date: '', board: null,
    statsRange: null, stats: null,
    adminTab: 'users', admin: null, log: null
  };
  var app = document.getElementById('app');

  /* ---------- 도우미 ---------- */

  function h(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function pct(a, b) { return b ? Math.round(a / b * 1000) / 10 : 0; }
  function addDays(d, n) { return new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10); }
  function dow(d) { return DOW[new Date(d + 'T00:00:00Z').getUTCDay()]; }
  function fmtDate(d) { var p = d.split('-'); return p[0] + '년 ' + Number(p[1]) + '월 ' + Number(p[2]) + '일 (' + dow(d) + ')'; }
  function localToday() { return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); }
  function splitEntry(e) {
    var m = String(e).match(/^(.*?)\s*\((.*)\)\s*$/);
    return m ? { name: m[1], note: m[2] } : { name: String(e), note: '' };
  }
  function chip(cat, entry) {
    var p = splitEntry(entry);
    return '<span class="chip ' + cat + '">' + h(p.name) + (p.note ? ' <em>(' + h(p.note) + ')</em>' : '') + '</span>';
  }
  function chips(cat, list) { return list && list.length ? '<div class="chips">' + list.map(function (e) { return chip(cat, e); }).join('') + '</div>' : ''; }

  var toastTimer;
  function toast(msg, bad) {
    var el = $('.toast');
    if (!el) { el = document.createElement('div'); document.body.appendChild(el); }
    el.className = 'toast' + (bad ? ' bad' : '');
    el.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.remove(); }, bad ? 4200 : 2400);
  }

  var busyCount = 0;
  function busy(on) {
    busyCount += on ? 1 : -1;
    var el = $('.busy');
    if (busyCount > 0 && !el) {
      el = document.createElement('div');
      el.className = 'busy';
      el.innerHTML = '<div class="spin"></div>';
      document.body.appendChild(el);
    } else if (busyCount <= 0 && el) { busyCount = 0; el.remove(); }
  }

  /* ---------- 서버 호출 ---------- */

  function api(action, payload, opts) {
    opts = opts || {};
    var req = Object.assign({ action: action, token: S.token }, payload || {});
    if (!opts.quiet) busy(true);
    var p;
    if (DEMO) {
      p = new Promise(function (res) { setTimeout(function () { res(LocalBackend.call(req)); }, 120); });
    } else {
      p = fetch(CONFIG.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(req),
        redirect: 'follow'
      }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).catch(function () {
        return { ok: false, error: 'NETWORK', message: '서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.' };
      });
    }
    return p.then(function (res) {
      if (!opts.quiet) busy(false);
      if (res.ok) return res;
      if (res.error === 'AUTH' && action !== 'login') { logout(true); throw res; }
      if (res.error === 'MUST_CHANGE') { S.user.mustChange = true; render(); throw res; }
      throw res;
    });
  }

  function report(err) {
    toast((err && err.message) || '문제가 생겼습니다. 다시 해 주세요.', true);
  }

  function storeToken(token, remember) {
    S.token = token;
    try {
      localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_KEY);
      (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
    } catch (e) { /* 저장 못 하면 이번 창에서만 로그인 유지 */ }
  }
  function remembered() { try { return !!localStorage.getItem(TOKEN_KEY); } catch (e) { return false; } }

  function logout(expired) {
    try { localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* 무시 */ }
    S.token = null; S.user = null; S.board = null; S.admin = null; S.stats = null;
    closeModal();
    render();
    if (expired) toast('로그인이 끝났습니다. 다시 로그인해 주세요.', true);
  }

  /* ---------- 로그인 화면 ---------- */

  function renderLogin() {
    document.title = '로그인 · 일일 근태현황';
    app.innerHTML =
      '<div class="login-wrap"><form class="login-card" id="loginForm" autocomplete="off">' +
      '<div class="mark">근</div>' +
      '<h1>일일 근태현황</h1>' +
      '<p class="sub">이름과 PIN 번호로 들어갑니다</p>' +
      '<label class="field"><span>이름</span><input type="text" id="lgName" autocomplete="username" placeholder="예: 홍길동" required></label>' +
      '<label class="field"><span>PIN 번호</span><input type="password" id="lgPin" class="pin-input" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="current-password" placeholder="••••" required></label>' +
      '<label class="check"><input type="checkbox" id="lgRemember"> 이 기기에서 로그인 유지 (30일)</label>' +
      '<p class="hint" style="margin:0 0 8px">여러 사람이 같이 쓰는 PC에서는 체크하지 마세요.</p>' +
      '<div class="err" id="lgErr"></div>' +
      '<button class="btn primary block" style="min-height:54px;font-size:18px">로그인</button>' +
      (DEMO ? '<div class="demo-note"><b>체험 모드</b> · 이 브라우저에만 저장됩니다.<br>처음 로그인: 이름 <b>관리자</b> / PIN <b>1234</b></div>' : '') +
      '<p class="hint" style="text-align:center;margin-top:18px">PIN을 잊었으면 관리자에게 다시 정해 달라고 하세요.</p>' +
      '</form></div>';
    $('#lgName').focus();
    $('#loginForm').onsubmit = function (e) {
      e.preventDefault();
      var remember = $('#lgRemember').checked;
      $('#lgErr').textContent = '';
      api('login', { name: $('#lgName').value.trim(), pin: $('#lgPin').value, remember: remember })
        .then(function (res) {
          storeToken(res.token, remember);
          S.user = res.user; S.settings = res.settings; S.today = res.today;
          S.date = res.today; S.tab = 'board';
          render();
        })
        .catch(function (err) { $('#lgErr').textContent = err.message || '로그인하지 못했습니다.'; $('#lgPin').value = ''; $('#lgPin').focus(); });
    };
  }

  function renderMustChange() {
    app.innerHTML =
      '<div class="login-wrap"><form class="login-card" id="pinForm">' +
      '<div class="mark">🔒</div>' +
      '<h1>새 PIN 정하기</h1>' +
      '<p class="sub">' + h(S.user.name) + '님, 처음 받은 PIN을 본인만 아는 번호로 바꿔 주세요.</p>' +
      pinFields() +
      '<div class="err" id="pinErr"></div>' +
      '<button class="btn primary block" style="min-height:54px;font-size:18px">바꾸기</button>' +
      '<button type="button" class="btn ghost block" id="pinOut" style="margin-top:8px">로그아웃</button>' +
      '</form></div>';
    $('#pinOut').onclick = function () { logout(); };
    bindPinForm($('#pinForm'), $('#pinErr'), function () { render(); });
  }

  function pinFields() {
    return '<label class="field"><span>지금 PIN</span><input type="password" name="old" class="pin-input" inputmode="numeric" maxlength="8" required></label>' +
      '<label class="field"><span>새 PIN (숫자 4~8자리)</span><input type="password" name="n1" class="pin-input" inputmode="numeric" maxlength="8" required></label>' +
      '<label class="field"><span>새 PIN 한 번 더</span><input type="password" name="n2" class="pin-input" inputmode="numeric" maxlength="8" required></label>';
  }

  function bindPinForm(form, errEl, done) {
    form.onsubmit = function (e) {
      e.preventDefault();
      var f = form.elements;
      errEl.textContent = '';
      if (f.n1.value !== f.n2.value) { errEl.textContent = '새 PIN 두 개가 서로 다릅니다.'; return; }
      api('changePin', { oldPin: f.old.value, newPin: f.n1.value, remember: remembered() })
        .then(function (res) {
          storeToken(res.token, remembered());
          S.user = res.user;
          toast('PIN을 바꿨습니다.');
          form.reset();
          done();
        })
        .catch(function (err) { errEl.textContent = err.message; });
    };
  }

  /* ---------- 틀 ---------- */

  function render() {
    closeModal();
    if (!S.token || !S.user) return renderLogin();
    if (S.user.mustChange) return renderMustChange();
    var tabs = [['board', '일일 현황'], ['stats', '기간 통계']];
    if (S.user.role === 'admin') tabs.push(['admin', '관리']);
    tabs.push(['me', '내 정보']);
    document.title = (S.settings.orgName || '') + ' 일일 근태현황';
    app.innerHTML =
      (DEMO ? '<div class="demo-banner no-print">체험 모드 · 입력한 내용은 이 브라우저에만 저장됩니다 (config.js에 서버 주소를 넣으면 실제 운영)</div>' : '') +
      '<header class="topbar"><div class="topbar-in">' +
      '<h1>' + h(S.settings.orgName) + ' 일일 근태현황<small>' + h(fmtDate(S.today)) + '</small></h1>' +
      '<div class="who"><span class="nm">' + h(S.user.name) + '</span><span class="role">' + h(S.user.roleLabel) + '</span>' +
      '<button class="btn" id="btnOut">로그아웃</button></div></div>' +
      '<nav class="tabs">' + tabs.map(function (t) {
        return '<button class="tab' + (S.tab === t[0] ? ' on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '</nav></header>' +
      '<main id="view"></main>';
    $('#btnOut').onclick = function () { logout(); };
    $$('.tab').forEach(function (b) { b.onclick = function () { S.tab = b.dataset.tab; render(); }; });
    ({ board: showBoard, stats: showStats, admin: showAdmin, me: showMe })[S.tab]();
  }

  /* ---------- 일일 현황 ---------- */

  function showBoard() {
    if (!S.date) S.date = S.today || localToday();
    loadBoard();
  }

  function loadBoard() {
    return api('board', { date: S.date })
      .then(function (res) { S.board = res; S.today = res.today; drawBoard(); })
      .catch(function (err) { if (err.error !== 'AUTH') { report(err); $('#view').innerHTML = '<div class="empty">불러오지 못했습니다.</div>'; } });
  }

  function computed() {
    var b = S.board;
    var depts = b.depts.map(function (d) {
      var r = b.rows[d.id];
      return {
        d: d, r: r, entered: !!r,
        total: r ? r.total : d.total, working: r ? r.working : d.total,
        trip: r ? r.trip : [], hq: r ? r.hq : [], edu: r ? r.edu : [], leave: r ? r.leave : [],
        editable: b.perms.depts.indexOf(d.id) >= 0
      };
    });
    var partners = b.partners.map(function (p) {
      var r = b.prows[p.id];
      return { p: p, r: r, entered: !!r, total: r ? r.total : p.total, working: r ? r.working : p.total,
               editable: b.perms.partners.indexOf(p.id) >= 0 };
    });
    var sum = { total: 0, working: 0, trip: 0, hq: 0, edu: 0, leave: 0, entered: 0 };
    depts.forEach(function (x) {
      sum.total += x.total; sum.working += x.working; if (x.entered) sum.entered++;
      CATS.forEach(function (c) { sum[c.key] += x[c.key].length; });
    });
    var psum = { total: 0, working: 0, entered: 0 };
    partners.forEach(function (x) { psum.total += x.total; psum.working += x.working; if (x.entered) psum.entered++; });
    return { depts: depts, partners: partners, sum: sum, psum: psum };
  }

  function statusCell(x) {
    if (!x.entered) return '<span class="status"><b class="todo">미입력</b></span>';
    return '<span class="status"><b class="done">입력</b> <span class="by">' + h(x.r.by) + ' ' + h(String(x.r.at).slice(11, 16)) + '</span></span>';
  }

  function drawBoard() {
    var b = S.board, c = computed(), st = S.settings;
    var myTodo = c.depts.filter(function (x) { return x.editable && !x.entered; }).length;
    var anyEdit = b.perms.depts.length || b.perms.partners.length || b.perms.etc;
    var isToday = b.date === b.today;

    var html =
      '<div class="print-head"><div></div><h1>' + h(st.orgName) + ' 일일 근태현황</h1><div class="d">날짜: ' + h(b.date) + '</div></div>' +
      '<div class="toolbar">' +
      '<div class="datebox"><button class="btn icon-btn" id="dPrev" title="전날">◀</button>' +
      '<input type="date" id="dPick" value="' + h(b.date) + '"><span class="dow">(' + dow(b.date) + ')</span>' +
      '<button class="btn icon-btn" id="dNext" title="다음날">▶</button></div>' +
      (isToday ? '' : '<button class="btn" id="dToday">오늘로</button>') +
      (S.user.role !== 'viewer' && !b.perms.dateEditable ? '<span class="readonly-note">이 날짜는 수정 기간이 지나 볼 수만 있습니다</span>' : '') +
      '<span class="sp"></span>' +
      (myTodo ? '<button class="btn" id="btnRest" title="아직 입력 안 된 내 담당 부서를 기본 인원 그대로 저장">남은 부서 이상 없음 (' + myTodo + ')</button>' : '') +
      '<button class="btn" id="btnXlsx">엑셀 받기</button>' +
      '<button class="btn" id="btnPrint">인쇄</button>' +
      '</div>';

    var rate = pct(c.sum.working, c.sum.total);
    html += '<div class="kpis">' +
      kpi('본부 근무자', c.sum.working, '/ ' + c.sum.total + '명', '출근율 ' + rate + '%', rate, true) +
      kpi('출장', c.sum.trip, '명', '본사근무 ' + c.sum.hq + '명') +
      kpi('교육', c.sum.edu, '명', '') +
      kpi('휴가', c.sum.leave, '명', '') +
      kpi('협력사 근무자', c.psum.working, '/ ' + c.psum.total + '명', '출근율 ' + pct(c.psum.working, c.psum.total) + '%', pct(c.psum.working, c.psum.total)) +
      kpi('입력 현황', c.sum.entered, '/ ' + c.depts.length + ' 부서', '협력사 ' + c.psum.entered + '/' + c.partners.length, pct(c.sum.entered, c.depts.length)) +
      '</div>';

    // 부서 표
    html += '<div class="board"><section class="card">' +
      '<div class="card-h"><h2>' + h(st.orgName) + '</h2><span class="note no-print">부서명을 누르면 입력합니다</span></div>' +
      '<div class="dept-table scroll"><table class="grid"><thead><tr>' +
      '<th style="min-width:150px">부서명</th><th>총인원</th><th>근무자</th>' +
      CATS.map(function (k) { return '<th>' + k.label + '</th>'; }).join('') +
      '<th class="stcol">상태</th></tr></thead><tbody>' +
      c.depts.map(function (x) {
        return '<tr class="lv' + x.d.level + (x.editable ? ' click' : '') + '" data-dept="' + h(x.d.id) + '">' +
          '<td class="name">' + h(x.d.name) + '</td>' +
          '<td class="c num">' + x.total + '</td>' +
          '<td class="c num big' + (x.working < x.total ? ' lost' : '') + '">' + x.working + '</td>' +
          CATS.map(function (k) { return '<td>' + chips(k.key, x[k.key]) + '</td>'; }).join('') +
          '<td class="c stcol">' + statusCell(x) + (x.editable ? ' <button class="btn small no-print" data-dept="' + h(x.d.id) + '">' + (x.entered ? '수정' : '입력') + '</button>' : '') + '</td>' +
          '</tr>';
      }).join('') +
      '<tr class="sum"><td class="c">소 계</td><td class="c num">' + c.sum.total + '</td><td class="c num big">' + c.sum.working + '</td>' +
      CATS.map(function (k) { return '<td class="c num">' + (c.sum[k.key] || '') + '</td>'; }).join('') + '<td class="stcol"></td></tr>' +
      '</tbody></table></div>' +
      // 모바일 카드
      '<div class="mcards">' + c.depts.map(function (x) {
        var rows = CATS.filter(function (k) { return x[k.key].length; }).map(function (k) {
          return '<div class="row"><b>' + k.label + '</b>' + chips(k.key, x[k.key]) + '</div>';
        }).join('');
        return '<div class="mcard lv' + x.d.level + '">' +
          '<div class="top"><span class="nm">' + h(x.d.name) + '</span><span class="nums num">' + x.working + ' <span>/ ' + x.total + '</span></span></div>' +
          rows +
          '<div class="foot">' + statusCell(x) + (x.editable ? '<button class="btn small" data-dept="' + h(x.d.id) + '">' + (x.entered ? '수정' : '입력') + '</button>' : '') + '</div>' +
          '</div>';
      }).join('') +
      '<div class="mcard" style="background:var(--gold-soft)"><div class="top"><span class="nm">소계</span><span class="nums num">' + c.sum.working + ' <span>/ ' + c.sum.total + '</span></span></div></div>' +
      '</div>' +
      '<div class="legend">' + CATS.map(function (k) { return '<span><i style="background:' + k.color + '"></i>' + k.label + '</span>'; }).join('') +
      '<span>근무자 = 총인원 − 출장 − 교육 − 휴가 (본사근무는 근무로 셈)</span></div>' +
      '</section>';

    // 협력사 표
    html += '<section class="card"><div class="card-h"><h2>' + h(st.partnerTitle) + '</h2>' +
      (st.partnerNote ? '<span class="note">(' + h(st.partnerNote) + ')</span>' : '') + '<span class="sp"></span>' +
      (b.perms.partners.length ? '<button class="btn small" id="btnPartners">입력</button>' : '') + '</div>' +
      '<table class="grid"><thead><tr><th>업체명</th><th>총인원</th><th>근무자</th></tr></thead><tbody>' +
      c.partners.map(function (x) {
        return '<tr><td>' + h(x.p.name) + (x.entered ? '' : ' <span class="status"><b class="todo">미입력</b></span>') + '</td>' +
          '<td class="c num">' + x.total + '</td><td class="c num big' + (x.working < x.total ? ' lost' : '') + '">' + x.working + '</td></tr>';
      }).join('') +
      '<tr class="sum"><td class="c">소 계</td><td class="c num">' + c.psum.total + '</td><td class="c num big">' + c.psum.working + '</td></tr>' +
      '</tbody></table></section></div>';

    // 기타
    var etcLines = b.etc ? b.etc.text.split('\n') : [];
    html += '<section class="card etc-card" style="margin-top:16px"><div class="card-h"><h2>' + h(st.etcTitle) + '</h2><span class="sp"></span>' +
      (b.perms.etc ? '<button class="btn small" id="btnEtc">' + (b.etc ? '수정' : '입력') + '</button>' : '') + '</div>' +
      '<div class="card-b">' + (etcLines.length
        ? '<ol class="etc-list">' + etcLines.map(function (l) { return '<li>' + h(l) + '</li>'; }).join('') + '</ol>' +
          '<div class="meta no-print">' + h(b.etc.by) + ' · ' + h(b.etc.at) + '</div>'
        : '<div class="empty" style="padding:8px">없음</div>') +
      '</div></section>';

    $('#view').innerHTML = html;

    $('#dPrev').onclick = function () { S.date = addDays(S.date, -1); loadBoard(); };
    $('#dNext').onclick = function () { S.date = addDays(S.date, 1); loadBoard(); };
    $('#dPick').onchange = function (e) { if (e.target.value) { S.date = e.target.value; loadBoard(); } };
    if ($('#dToday')) $('#dToday').onclick = function () { S.date = S.today; loadBoard(); };
    $('#btnPrint').onclick = function () { window.print(); };
    $('#btnXlsx').onclick = function () { exportBoard(c); };
    if ($('#btnRest')) $('#btnRest').onclick = confirmRest;
    if ($('#btnPartners')) $('#btnPartners').onclick = function () { editPartners(c); };
    if ($('#btnEtc')) $('#btnEtc').onclick = editEtc;
    $$('[data-dept]', $('#view')).forEach(function (el) {
      if (!el.classList.contains('click') && el.tagName === 'TR') return;
      el.onclick = function (e) {
        e.stopPropagation();
        var x = c.depts.filter(function (d) { return d.d.id === el.dataset.dept; })[0];
        if (x && x.editable) editDept(x);
      };
    });
  }

  function kpi(k, v, unit, s, bar, main) {
    return '<div class="kpi' + (main ? ' main' : '') + '"><div class="k">' + h(k) + '</div>' +
      '<div class="v num">' + v + '<small>' + h(unit) + '</small></div>' +
      (s ? '<div class="s">' + h(s) + '</div>' : '') +
      (bar != null ? '<div class="bar"><i style="width:' + Math.min(100, bar) + '%"></i></div>' : '') + '</div>';
  }

  function confirmRest() {
    var names = computed().depts.filter(function (x) { return x.editable && !x.entered; }).map(function (x) { return x.d.name; });
    ask('남은 부서 이상 없음', '아래 부서를 출장·교육·휴가 없이 기본 인원 그대로 저장합니다.<br><b>' + names.map(h).join(', ') + '</b>', '저장', function () {
      api('confirmRest', { date: S.date }).then(function (res) {
        toast(res.saved.length + '개 부서를 저장했습니다.');
        loadBoard();
      }).catch(report);
    });
  }

  /* ---------- 모달 ---------- */

  function openModal(html, cls) {
    closeModal();
    var ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = '<div class="modal ' + (cls || '') + '" role="dialog" aria-modal="true">' + html + '</div>';
    document.body.appendChild(ov);
    document.body.style.overflow = 'hidden';
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) closeModal(); });
    $$('.x,[data-close]', ov).forEach(function (b) { b.onclick = closeModal; });
    return ov;
  }
  function closeModal() {
    var ov = $('.overlay');
    if (ov) ov.remove();
    document.body.style.overflow = '';
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

  function ask(title, bodyHtml, okLabel, onOk, danger) {
    var ov = openModal('<div class="modal-h"><h3>' + h(title) + '</h3><button class="x" aria-label="닫기">×</button></div>' +
      '<div class="modal-b">' + bodyHtml + '</div>' +
      '<div class="modal-f"><button class="btn" data-close>취소</button><button class="btn ' + (danger ? 'danger' : 'primary') + '" id="askOk">' + h(okLabel) + '</button></div>');
    $('#askOk', ov).onclick = function () { closeModal(); onOk(); };
  }

  /* ---------- 부서 입력 ---------- */

  function editDept(x) {
    var st = { total: x.total };
    CATS.forEach(function (k) { st[k.key] = x[k.key].slice(); });

    var ov = openModal(
      '<div class="modal-h"><div><h3>' + h(x.d.name) + '</h3><p>' + h(fmtDate(S.date)) + '</p></div><button class="x" aria-label="닫기">×</button></div>' +
      '<div class="modal-b">' +
      '<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:6px"><b style="font-size:16px">총인원</b>' +
      '<div class="stepper"><button type="button" id="tMinus">−</button><input type="number" id="tVal" class="num" min="0" max="999" inputmode="numeric"><button type="button" id="tPlus">+</button></div>' +
      '<button type="button" class="btn small" id="loadPrev" style="margin-left:auto">전날 내용 불러오기</button></div>' +
      '<div class="calc" id="calc"></div>' +
      CATS.map(function (k) {
        return '<div class="cat" data-cat="' + k.key + '"><div class="cat-h"><span class="dot" style="background:' + k.color + '"></span><h4>' + k.label + '</h4>' +
          (k.absent ? '' : '<small>근무자에 포함</small>') + '<span class="cnt"></span></div>' +
          '<div class="people"></div>' +
          '<div class="add-row"><input type="text" class="pn" placeholder="이름" maxlength="20">' +
          '<input type="text" class="pm" placeholder="' + (k.key === 'trip' ? '행선지 (예: 삼성 E&A)' : k.key === 'leave' ? '메모 (예: 연차, 반차)' : '메모 (선택)') + '" maxlength="50">' +
          '<button type="button" class="btn">+ 추가</button></div></div>';
      }).join('') +
      '<div class="err" id="deErr"></div></div>' +
      '<div class="modal-f">' + (x.entered ? '<span class="hint" style="margin:0;align-self:center">마지막 입력: ' + h(x.r.by) + ' ' + h(x.r.at) + '</span>' : '') +
      '<span class="sp"></span><button class="btn" data-close>취소</button><button class="btn primary" id="deSave" style="min-width:120px">저장</button></div>', 'wide');

    var tVal = $('#tVal', ov);
    tVal.value = st.total;

    function draw() {
      var absent = 0;
      CATS.forEach(function (k) {
        var box = $('[data-cat="' + k.key + '"]', ov);
        $('.cnt', box).textContent = st[k.key].length + '명';
        $('.people', box).innerHTML = st[k.key].map(function (e, i) {
          var p = splitEntry(e);
          return '<span class="chip ' + k.key + '">' + h(p.name) + (p.note ? ' <em>(' + h(p.note) + ')</em>' : '') +
            '<button type="button" data-i="' + i + '" aria-label="빼기">×</button></span>';
        }).join('');
        $$('.people button', box).forEach(function (b) {
          b.onclick = function () { st[k.key].splice(Number(b.dataset.i), 1); draw(); };
        });
        if (k.absent) absent += st[k.key].length;
      });
      var t = Number(tVal.value) || 0;
      var w = t - absent;
      $('#calc', ov).innerHTML = '근무자 <b class="num">' + Math.max(0, w) + '</b>명 = 총인원 ' + t + ' − 출장·교육·휴가 ' + absent +
        (w < 0 ? ' <span style="color:var(--red);font-weight:700">· 빠진 인원이 총인원보다 많습니다</span>' : '');
    }

    $('#tMinus', ov).onclick = function () { tVal.value = Math.max(0, (Number(tVal.value) || 0) - 1); draw(); };
    $('#tPlus', ov).onclick = function () { tVal.value = (Number(tVal.value) || 0) + 1; draw(); };
    tVal.oninput = draw;

    CATS.forEach(function (k) {
      var box = $('[data-cat="' + k.key + '"]', ov);
      var pn = $('.pn', box), pm = $('.pm', box);
      function add() {
        var n = pn.value.replace(/[()]/g, '').trim(), m = pm.value.replace(/[()]/g, '').trim();
        if (!n) { pn.focus(); return; }
        st[k.key].push(m ? n + ' (' + m + ')' : n);
        pn.value = ''; pm.value = '';
        pn.focus();
        draw();
      }
      $('.btn', box).onclick = add;
      [pn, pm].forEach(function (inp) {
        inp.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); if (inp === pn && !pm.value && pn.value) pm.focus(); else add(); } };
      });
    });

    $('#loadPrev', ov).onclick = function () {
      api('board', { date: addDays(S.date, -1) }).then(function (res) {
        var r = res.rows[x.d.id];
        if (!r) { toast('전날 입력된 내용이 없습니다.', true); return; }
        tVal.value = r.total;
        CATS.forEach(function (k) { st[k.key] = r[k.key].slice(); });
        draw();
        toast('전날 내용을 불러왔습니다. 확인 후 저장하세요.');
      }).catch(report);
    };

    $('#deSave', ov).onclick = function () {
      // 입력칸에 적어 놓고 "추가"를 안 누른 이름도 넣어 줌
      CATS.forEach(function (k) {
        var box = $('[data-cat="' + k.key + '"]', ov);
        var n = $('.pn', box).value.replace(/[()]/g, '').trim(), m = $('.pm', box).value.replace(/[()]/g, '').trim();
        if (n) st[k.key].push(m ? n + ' (' + m + ')' : n);
      });
      var payload = { date: S.date, deptId: x.d.id, total: Number(tVal.value) };
      CATS.forEach(function (k) { payload[k.key] = st[k.key]; });
      api('saveDept', payload).then(function (res) {
        S.board.rows[x.d.id] = res.row;
        closeModal();
        drawBoard();
        toast(x.d.name + ' 저장했습니다.');
      }).catch(function (err) { $('#deErr', ov).textContent = err.message; draw(); });
    };
    draw();
  }

  /* ---------- 협력사 입력 ---------- */

  function editPartners(c) {
    var list = c.partners.filter(function (x) { return x.editable; });
    var ov = openModal(
      '<div class="modal-h"><div><h3>' + h(S.settings.partnerTitle) + ' 인원</h3><p>' + h(fmtDate(S.date)) + '</p></div><button class="x" aria-label="닫기">×</button></div>' +
      '<div class="modal-b"><div class="plist"><div></div><div class="h">총인원</div><div class="h">근무자</div>' +
      list.map(function (x) {
        return '<div class="n">' + h(x.p.name) + '</div>' +
          '<input type="number" class="num" min="0" inputmode="numeric" data-t="' + h(x.p.id) + '" value="' + x.total + '">' +
          '<input type="number" class="num" min="0" inputmode="numeric" data-w="' + h(x.p.id) + '" value="' + x.working + '">';
      }).join('') +
      '<div class="n sumrow">소계</div><div class="sumrow num" id="pT" style="text-align:center"></div><div class="sumrow num" id="pW" style="text-align:center"></div>' +
      '</div><p class="hint">빈칸 없이 숫자로 적어 주세요. 입력칸을 누르면 숫자가 전체 선택됩니다.</p><div class="err" id="peErr"></div></div>' +
      '<div class="modal-f"><button class="btn" data-close>취소</button><button class="btn primary" id="peSave" style="min-width:120px">저장</button></div>');
    function sums() {
      var t = 0, w = 0;
      $$('[data-t]', ov).forEach(function (i) { t += Number(i.value) || 0; });
      $$('[data-w]', ov).forEach(function (i) { w += Number(i.value) || 0; });
      $('#pT', ov).textContent = t; $('#pW', ov).textContent = w;
    }
    $$('input', ov).forEach(function (i) {
      i.onfocus = function () { i.select(); };
      i.oninput = sums;
      i.onkeydown = function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        var all = $$('input', ov), n = all[all.indexOf(i) + 1];
        if (n) n.focus(); else $('#peSave', ov).click();
      };
    });
    sums();
    $('#peSave', ov).onclick = function () {
      var items = list.map(function (x) {
        return { partnerId: x.p.id, total: $('[data-t="' + x.p.id + '"]', ov).value, working: $('[data-w="' + x.p.id + '"]', ov).value };
      });
      api('savePartners', { date: S.date, items: items }).then(function (res) {
        Object.keys(res.prows).forEach(function (id) { S.board.prows[id] = res.prows[id]; });
        closeModal(); drawBoard();
        toast('협력사 인원을 저장했습니다.');
      }).catch(function (err) { $('#peErr', ov).textContent = err.message; });
    };
  }

  /* ---------- 기타 ---------- */

  function editEtc() {
    var cur = S.board.etc ? S.board.etc.text : '';
    var ov = openModal(
      '<div class="modal-h"><div><h3>' + h(S.settings.etcTitle) + '</h3><p>' + h(fmtDate(S.date)) + '</p></div><button class="x" aria-label="닫기">×</button></div>' +
      '<div class="modal-b"><label class="field"><span>한 줄에 하나씩 적어 주세요</span>' +
      '<textarea id="etcText" placeholder="야적장 포장공사 (상호: 수덕건설, 인원: 3)&#10;비파괴 검사 (상호: APN)">' + h(cur) + '</textarea></label>' +
      '<button type="button" class="btn small" id="etcPrev">전날 내용 불러오기</button>' +
      '<div class="err" id="etcErr"></div></div>' +
      '<div class="modal-f"><button class="btn" data-close>취소</button><button class="btn primary" id="etcSave" style="min-width:120px">저장</button></div>');
    $('#etcPrev', ov).onclick = function () {
      api('board', { date: addDays(S.date, -1) }).then(function (res) {
        if (!res.etc) { toast('전날 내용이 없습니다.', true); return; }
        $('#etcText', ov).value = res.etc.text;
      }).catch(report);
    };
    $('#etcSave', ov).onclick = function () {
      api('saveEtc', { date: S.date, text: $('#etcText', ov).value }).then(function (res) {
        S.board.etc = res.etc; closeModal(); drawBoard(); toast('저장했습니다.');
      }).catch(function (err) { $('#etcErr', ov).textContent = err.message; });
    };
  }

  /* ---------- 엑셀 ---------- */

  function needXlsx() {
    if (window.XLSX) return true;
    toast('엑셀 도구를 아직 불러오는 중입니다. 잠시 후 다시 눌러 주세요.', true);
    return false;
  }

  function exportBoard(c) {
    if (!needXlsx()) return;
    var b = S.board, st = S.settings;
    var aoa = [
      [st.orgName + ' 일일 근태현황'],
      ['날짜: ' + b.date + ' (' + dow(b.date) + ')'],
      [],
      ['부서명', '총인원', '근무자', '출장', '본사근무', '교육', '휴가', '입력자', '', '업체명', '총인원', '근무자']
    ];
    var n = Math.max(c.depts.length, c.partners.length) + 1;
    for (var i = 0; i < n; i++) {
      var row = [];
      var x = c.depts[i];
      if (x) row.push((x.d.level ? '  ' : '') + x.d.name, x.total, x.working, x.trip.join(', '), x.hq.join(', '), x.edu.join(', '), x.leave.join(', '), x.entered ? x.r.by : '미입력');
      else if (i === c.depts.length) row.push('소 계', c.sum.total, c.sum.working, c.sum.trip || '', c.sum.hq || '', c.sum.edu || '', c.sum.leave || '', '');
      else row.push('', '', '', '', '', '', '', '');
      row.push('');
      var p = c.partners[i];
      if (p) row.push(p.p.name, p.total, p.working);
      else if (i === c.partners.length) row.push('소 계', c.psum.total, c.psum.working);
      aoa.push(row);
    }
    aoa.push([]);
    aoa.push([st.etcTitle]);
    (b.etc ? b.etc.text.split('\n') : ['없음']).forEach(function (l, i) { aoa.push([(b.etc ? (i + 1) + '. ' : '') + l]); });
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 18 }, { wch: 7 }, { wch: 7 }, { wch: 30 }, { wch: 20 }, { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 2 }, { wch: 14 }, { wch: 7 }, { wch: 7 }];
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 11 } }];
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, b.date);
    XLSX.writeFile(wb, '근태현황_' + b.date + '.xlsx');
  }

  /* ---------- 기간 통계 ---------- */

  function monthRange(offset) {
    var t = S.today || localToday();
    var y = Number(t.slice(0, 4)), m = Number(t.slice(5, 7)) - 1 + offset;
    var first = new Date(Date.UTC(y, m, 1)), last = new Date(Date.UTC(y, m + 1, 0));
    var to = last.toISOString().slice(0, 10);
    return { from: first.toISOString().slice(0, 10), to: offset === 0 && to > t ? t : to };
  }

  function showStats() {
    if (!S.statsRange) S.statsRange = monthRange(0);
    var r = S.statsRange;
    $('#view').innerHTML =
      '<div class="range"><input type="date" id="sFrom" value="' + h(r.from) + '"><span>~</span><input type="date" id="sTo" value="' + h(r.to) + '">' +
      '<button class="btn primary" id="sGo">조회</button>' +
      '<button class="btn" data-q="0">이번 달</button><button class="btn" data-q="-1">지난 달</button><button class="btn" data-q="7">최근 7일</button>' +
      '<span style="flex:1"></span><button class="btn" id="sXlsx">엑셀 받기</button></div>' +
      '<div id="sOut"><div class="empty">불러오는 중…</div></div>';
    $('#sGo').onclick = function () { S.statsRange = { from: $('#sFrom').value, to: $('#sTo').value }; loadStats(); };
    $$('[data-q]').forEach(function (b) {
      b.onclick = function () {
        var q = Number(b.dataset.q);
        var t = S.today || localToday();
        S.statsRange = q === 7 ? { from: addDays(t, -6), to: t } : monthRange(q);
        showStats();
      };
    });
    $('#sXlsx').onclick = exportStats;
    loadStats();
  }

  function loadStats() {
    api('stats', S.statsRange).then(function (res) { S.stats = res; drawStats(); })
      .catch(function (err) { if (err.error !== 'AUTH') { report(err); $('#sOut').innerHTML = '<div class="empty">' + h(err.message) + '</div>'; } });
  }

  function drawStats() {
    var s = S.stats;
    if (!s.days) { $('#sOut').innerHTML = '<div class="card"><div class="empty">이 기간에 입력된 날이 없습니다.</div></div>'; return; }
    var tot = { total: 0, working: 0, trip: 0, hq: 0, edu: 0, leave: 0 };
    s.daily.forEach(function (d) { for (var k in tot) tot[k] += d[k]; });
    var rate = pct(tot.working, tot.total);
    var html = '<div class="kpis">' +
      kpi('집계한 날', s.days, '일', '입력이 있는 날만 셉니다') +
      kpi('평균 출근율', rate, '%', '근무 ' + tot.working + ' / ' + tot.total + ' 인일', rate, true) +
      kpi('출장', tot.trip, '인일', '') + kpi('본사근무', tot.hq, '인일', '') + kpi('교육', tot.edu, '인일', '') + kpi('휴가', tot.leave, '인일', '') +
      '</div>';

    html += '<section class="card"><div class="card-h"><h2>부서별</h2><span class="note">인일 = 사람 수 × 날 수</span></div><div class="scroll"><table class="grid"><thead><tr>' +
      '<th style="text-align:left">부서명</th><th>평균 인원</th><th>평균 근무</th><th style="min-width:160px">출근율</th><th>출장</th><th>본사근무</th><th>교육</th><th>휴가</th></tr></thead><tbody>' +
      s.depts.map(function (d) {
        var r = pct(d.working, d.total);
        return '<tr class="lv' + d.level + '"><td class="name">' + h(d.name) + '</td><td class="c num">' + (d.days ? (d.total / d.days).toFixed(1) : '-') + '</td>' +
          '<td class="c num">' + (d.days ? (d.working / d.days).toFixed(1) : '-') + '</td>' +
          '<td><div class="rate"><div class="bar"><i style="width:' + r + '%"></i></div><span class="num">' + r + '%</span></div></td>' +
          '<td class="c num">' + (d.trip || '') + '</td><td class="c num">' + (d.hq || '') + '</td><td class="c num">' + (d.edu || '') + '</td><td class="c num">' + (d.leave || '') + '</td></tr>';
      }).join('') + '</tbody></table></div></section>';

    html += '<div class="two"><section class="card"><div class="card-h"><h2>일자별</h2></div><div class="scroll"><table class="grid"><thead><tr>' +
      '<th>날짜</th><th>본부 근무</th><th>출근율</th><th>협력사 근무</th><th>입력 부서</th></tr></thead><tbody>' +
      s.daily.slice().reverse().map(function (d) {
        return '<tr class="click" data-go="' + d.date + '"><td class="c num">' + d.date.slice(5) + ' (' + dow(d.date) + ')</td>' +
          '<td class="c num">' + d.working + ' / ' + d.total + '</td><td class="c num">' + pct(d.working, d.total) + '%</td>' +
          '<td class="c num">' + d.pworking + ' / ' + d.ptotal + '</td><td class="c num">' + d.entered + '/' + s.depts.length + '</td></tr>';
      }).join('') + '</tbody></table></div></section>';

    html += '<section class="card"><div class="card-h"><h2>인원별</h2><span class="note">이름을 누르면 날짜가 보입니다</span></div><div class="scroll"><table class="grid"><thead><tr>' +
      '<th style="text-align:left">이름</th><th>부서</th><th>출장</th><th>본사</th><th>교육</th><th>휴가</th></tr></thead><tbody>' +
      (s.people.length ? s.people.map(function (p, i) {
        return '<tr class="click" data-p="' + i + '"><td class="name" style="font-weight:700">' + h(p.name) + '</td><td class="c" style="font-size:14px;color:var(--t3)">' + h(p.dept) + '</td>' +
          '<td class="c num">' + (p.trip || '') + '</td><td class="c num">' + (p.hq || '') + '</td><td class="c num">' + (p.edu || '') + '</td><td class="c num">' + (p.leave || '') + '</td></tr>' +
          '<tr hidden data-pd="' + i + '"><td colspan="6" class="person-dates">' +
          p.dates.map(function (x) { return h(x.date.slice(5)) + ' ' + h(CATS.filter(function (c) { return c.key === x.cat; })[0].label) + (splitEntry(x.note).note ? ' (' + h(splitEntry(x.note).note) + ')' : ''); }).join(' · ') +
          '</td></tr>';
      }).join('') : '<tr><td colspan="6" class="empty">출장·교육·휴가 기록이 없습니다.</td></tr>') +
      '</tbody></table></div></section></div>';

    $('#sOut').innerHTML = html;
    $$('[data-go]').forEach(function (tr) { tr.onclick = function () { S.date = tr.dataset.go; S.tab = 'board'; render(); }; });
    $$('[data-p]').forEach(function (tr) {
      tr.onclick = function () { var d = $('[data-pd="' + tr.dataset.p + '"]'); d.hidden = !d.hidden; };
    });
  }

  function exportStats() {
    if (!S.stats || !S.stats.days) { toast('먼저 조회해 주세요.', true); return; }
    if (!needXlsx()) return;
    var s = S.stats, wb = XLSX.utils.book_new();
    var d1 = [['부서명', '집계일', '평균 인원', '평균 근무', '출근율(%)', '출장', '본사근무', '교육', '휴가']].concat(s.depts.map(function (d) {
      return [d.name, d.days, +(d.total / d.days).toFixed(2), +(d.working / d.days).toFixed(2), pct(d.working, d.total), d.trip, d.hq, d.edu, d.leave];
    }));
    var d2 = [['날짜', '요일', '본부 총인원', '본부 근무자', '출근율(%)', '출장', '본사근무', '교육', '휴가', '협력사 총인원', '협력사 근무자', '입력 부서 수']].concat(s.daily.map(function (d) {
      return [d.date, dow(d.date), d.total, d.working, pct(d.working, d.total), d.trip, d.hq, d.edu, d.leave, d.ptotal, d.pworking, d.entered];
    }));
    var d3 = [['이름', '부서', '출장', '본사근무', '교육', '휴가', '날짜']].concat(s.people.map(function (p) {
      return [p.name, p.dept, p.trip, p.hq, p.edu, p.leave, p.dates.map(function (x) { return x.date.slice(5) + ' ' + CATS.filter(function (c) { return c.key === x.cat; })[0].label; }).join(', ')];
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(d1), '부서별');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(d2), '일자별');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(d3), '인원별');
    XLSX.writeFile(wb, '근태통계_' + s.from + '_' + s.to + '.xlsx');
  }

  /* ---------- 관리 ---------- */

  function showAdmin() {
    var tabs = [['users', '계정'], ['depts', '부서'], ['partners', '협력사'], ['settings', '설정'], ['log', '기록']];
    $('#view').innerHTML = '<div class="subtabs">' + tabs.map(function (t) {
      return '<button data-at="' + t[0] + '" class="' + (S.adminTab === t[0] ? 'on' : '') + '">' + t[1] + '</button>';
    }).join('') + '</div><div id="aOut"></div>';
    $$('[data-at]').forEach(function (b) { b.onclick = function () { S.adminTab = b.dataset.at; showAdmin(); }; });
    if (S.adminTab === 'log') return loadLog();
    var p = S.admin ? Promise.resolve({ adminConfig: S.admin }) : api('adminConfig');
    p.then(function (res) {
      if (!res.adminConfig) S.admin = res;
      drawAdmin();
    }).catch(function (err) { if (err.error !== 'AUTH') report(err); });
  }

  function setAdmin(res) {
    S.admin = res;
    S.settings = res.settings;
    S.board = null;
  }

  function drawAdmin() {
    ({ users: drawUsers, depts: function () { drawCfg('depts'); }, partners: function () { drawCfg('partners'); }, settings: drawSettings })[S.adminTab]();
  }

  function scopeLabel(u) {
    if (u.role === 'admin') return '전체';
    if (u.role === 'viewer') return '-';
    var names = [];
    u.scope.forEach(function (s) {
      if (s === '*') names.push('전체');
      else if (s === 'etc') names.push(S.settings.etcTitle);
      else {
        var id = s.slice(2);
        var list = s[0] === 'd' ? S.admin.depts : S.admin.partners;
        var f = list.filter(function (x) { return x.id === id; })[0];
        if (f) names.push(f.name);
      }
    });
    var partners = S.admin.partners.filter(function (p) { return p.active; });
    var pCount = u.scope.filter(function (s) { return s.slice(0, 2) === 'p:'; }).length;
    if (pCount && pCount >= partners.length) {
      names = names.filter(function (n) { return !partners.some(function (p) { return p.name === n; }); });
      names.push('협력사 전체');
    }
    return names.join(', ') || '(없음)';
  }

  function drawUsers() {
    var users = S.admin.users.slice().sort(function (a, b) {
      var o = { admin: 0, editor: 1, viewer: 2 };
      return (b.active - a.active) || (o[a.role] - o[b.role]) || a.name.localeCompare(b.name, 'ko');
    });
    $('#aOut').innerHTML = '<section class="card"><div class="card-h"><h2>계정</h2><span class="note">구글 계정 없이 이름 + PIN으로 로그인합니다</span><span class="sp"></span>' +
      '<button class="btn primary" id="uAdd">+ 계정 추가</button></div><div class="scroll"><table class="grid"><thead><tr>' +
      '<th style="text-align:left">이름</th><th>권한</th><th style="text-align:left">입력 담당</th><th>상태</th><th></th></tr></thead><tbody>' +
      users.map(function (u) {
        return '<tr' + (u.active ? '' : ' style="opacity:.55"') + '><td style="font-weight:700">' + h(u.name) + (u.id === S.user.id ? ' <span class="tag">나</span>' : '') + '</td>' +
          '<td class="c"><span class="tag ' + u.role + '">' + h(u.roleLabel) + '</span></td>' +
          '<td style="font-size:14px">' + h(scopeLabel(u)) + '</td>' +
          '<td class="c">' + (u.active ? (u.mustChange ? '<span class="tag viewer">PIN 변경 대기</span>' : '사용') : '<span class="tag off">사용 안 함</span>') + '</td>' +
          '<td class="c"><button class="btn small" data-u="' + h(u.id) + '">수정</button></td></tr>';
      }).join('') + '</tbody></table></div></section>' +
      '<p class="hint" style="margin-top:12px">• <b>입력 담당</b>은 맡은 부서·협력사만 입력할 수 있고, 모든 현황은 볼 수 있습니다. • <b>조회 전용</b>은 보기만 합니다. • 퇴사·이동한 사람은 "사용 안 함"으로 바꾸면 바로 로그인할 수 없습니다.</p>';
    $('#uAdd').onclick = function () { editUser(null); };
    $$('[data-u]').forEach(function (b) {
      b.onclick = function () { editUser(S.admin.users.filter(function (u) { return u.id === b.dataset.u; })[0]); };
    });
  }

  function editUser(u) {
    var isNew = !u;
    u = u || { name: '', role: 'editor', scope: [], active: true };
    var depts = S.admin.depts.filter(function (d) { return d.active; });
    var partners = S.admin.partners.filter(function (p) { return p.active; });
    function cb(val, label) {
      return '<label class="check"><input type="checkbox" name="scope" value="' + h(val) + '"' + (u.scope.indexOf(val) >= 0 ? ' checked' : '') + '> ' + h(label) + '</label>';
    }
    var ov = openModal(
      '<div class="modal-h"><h3>' + (isNew ? '계정 추가' : h(u.name) + ' 계정') + '</h3><button class="x" aria-label="닫기">×</button></div>' +
      '<form class="modal-b" id="uForm" autocomplete="off">' +
      '<label class="field"><span>이름 (로그인할 때 쓰는 이름)</span><input type="text" name="name" value="' + h(u.name) + '" maxlength="30" required></label>' +
      '<div class="field"><span style="display:block;font-size:15px;font-weight:600;color:var(--t2);margin-bottom:6px">권한</span><div class="roles">' +
      [['admin', '관리자', '모든 입력 + 계정·부서 관리'], ['editor', '입력 담당', '맡은 부서만 입력'], ['viewer', '조회 전용', '보기만 가능']].map(function (r) {
        return '<label><input type="radio" name="role" value="' + r[0] + '"' + (u.role === r[0] ? ' checked' : '') + '><b>' + r[1] + '</b>' + r[2] + '</label>';
      }).join('') + '</div></div>' +
      '<div class="field" id="scopeWrap"><span style="display:block;font-size:15px;font-weight:600;color:var(--t2);margin:14px 0 6px">입력 담당</span><div class="scope-box">' +
      '<h5>부서</h5><div class="scope-grid">' + depts.map(function (d) { return cb('d:' + d.id, d.name); }).join('') + '</div>' +
      '<h5>' + h(S.settings.partnerTitle) + ' <button type="button" class="btn small" id="allP" style="margin-left:8px">전체 선택</button></h5><div class="scope-grid">' +
      partners.map(function (p) { return cb('p:' + p.id, p.name); }).join('') + '</div>' +
      '<h5>기타</h5>' + cb('etc', S.settings.etcTitle) +
      '</div></div>' +
      '<label class="field" style="margin-top:16px"><span>' + (isNew ? 'PIN (숫자 4~8자리)' : 'PIN 새로 정하기 (바꿀 때만 적기)') + '</span>' +
      '<input type="text" name="pin" class="pin-input" inputmode="numeric" maxlength="8" placeholder="' + (isNew ? '' : '비워 두면 그대로') + '"' + (isNew ? ' required' : '') + '></label>' +
      '<label class="check"><input type="checkbox" name="mustChange"> 첫 로그인 때 본인이 PIN을 바꾸게 하기</label>' +
      (isNew ? '' : '<label class="check"><input type="checkbox" name="active"' + (u.active ? ' checked' : '') + '> 사용 (체크 해제하면 로그인 불가)</label>') +
      '<div class="err" id="uErr"></div></form>' +
      '<div class="modal-f">' + (isNew || u.id === S.user.id ? '' : '<button class="btn danger" id="uDel">삭제</button>') +
      '<span class="sp"></span><button class="btn" data-close>취소</button><button class="btn primary" id="uSave" style="min-width:120px">저장</button></div>');
    var form = $('#uForm', ov);
    function syncRole() {
      var role = form.elements.role.value;
      $('#scopeWrap', ov).hidden = role !== 'editor';
    }
    $$('input[name=role]', ov).forEach(function (r) { r.onchange = syncRole; });
    syncRole();
    $('#allP', ov).onclick = function () {
      var boxes = $$('input[value^="p:"]', ov);
      var all = boxes.every(function (b) { return b.checked; });
      boxes.forEach(function (b) { b.checked = !all; });
    };
    form.onsubmit = function (e) { e.preventDefault(); $('#uSave', ov).click(); };
    $('#uSave', ov).onclick = function () {
      var f = form.elements;
      var payload = {
        id: isNew ? '' : u.id,
        name: f.name.value.trim(),
        role: f.role.value,
        scope: $$('input[name=scope]:checked', ov).map(function (b) { return b.value; }),
        pin: f.pin.value.trim(),
        mustChange: f.mustChange.checked,
        active: isNew ? true : f.active.checked
      };
      api('saveUser', payload).then(function (res) {
        setAdmin(res); closeModal(); drawUsers();
        toast(payload.name + ' 계정을 저장했습니다.' + (payload.pin ? ' PIN을 본인에게 알려 주세요.' : ''));
      }).catch(function (err) { $('#uErr', ov).textContent = err.message; });
    };
    if ($('#uDel', ov)) $('#uDel', ov).onclick = function () {
      ask('계정 삭제', '<b>' + h(u.name) + '</b> 계정을 지웁니다. 지금까지 입력한 기록은 그대로 남습니다.', '삭제', function () {
        api('deleteUser', { id: u.id }).then(function (res) { setAdmin(res); drawUsers(); toast('삭제했습니다.'); }).catch(report);
      }, true);
    };
  }

  function drawCfg(kind) {
    var isD = kind === 'depts';
    var list = S.admin[kind];
    var title = isD ? '부서' : S.settings.partnerTitle;
    $('#aOut').innerHTML = '<section class="card cfg"><div class="card-h"><h2>' + h(title) + '</h2>' +
      '<span class="note">기본 총인원은 입력 안 한 날에 쓰는 인원입니다. 인원이 바뀌면 여기서 고쳐 주세요.</span></div>' +
      '<div class="scroll"><table class="grid"><thead><tr><th>순서</th><th style="text-align:left">' + (isD ? '부서명' : '업체명') + '</th>' +
      (isD ? '<th>하위 부서</th>' : '') + '<th>기본 총인원</th><th>사용</th><th></th></tr></thead><tbody>' +
      list.map(function (x, i) {
        return '<tr data-id="' + h(x.id) + '"' + (x.active ? '' : ' class="off"') + '>' +
          '<td><div class="arrows"><button class="btn small" data-mv="-1"' + (i ? '' : ' disabled') + '>▲</button><button class="btn small" data-mv="1"' + (i < list.length - 1 ? '' : ' disabled') + '>▼</button></div></td>' +
          '<td><input type="text" name="name" value="' + h(x.name) + '" maxlength="30"></td>' +
          (isD ? '<td class="c"><label class="check"><input type="checkbox" name="level"' + (x.level ? ' checked' : '') + '></label></td>' : '') +
          '<td class="c"><input type="number" name="total" min="0" value="' + x.total + '" class="num"></td>' +
          '<td class="c"><label class="check"><input type="checkbox" name="active"' + (x.active ? ' checked' : '') + '></label></td>' +
          '<td class="c"><button class="btn small primary" data-save>저장</button></td></tr>';
      }).join('') +
      '<tr data-id=""><td class="c" style="color:var(--t3);font-size:14px">새로</td><td><input type="text" name="name" placeholder="' + (isD ? '새 부서명' : '새 업체명') + '" maxlength="30"></td>' +
      (isD ? '<td class="c"><label class="check"><input type="checkbox" name="level" checked></label></td>' : '') +
      '<td class="c"><input type="number" name="total" min="0" value="0" class="num"></td><td class="c">-</td>' +
      '<td class="c"><button class="btn small primary" data-save>추가</button></td></tr>' +
      '</tbody></table></div>' +
      '<p class="hint" style="padding:0 18px 16px">' + (isD ? '"하위 부서"에 체크하면 현황표에서 들여쓰기로 보입니다 (예: 영업1Part). ' : '') +
      '없어진 곳은 지우지 말고 "사용"을 끄세요. 지난 기록은 남고 현황표에서만 빠집니다.</p></section>';
    $$('[data-save]').forEach(function (b) {
      b.onclick = function () {
        var tr = b.closest('tr');
        var payload = {
          id: tr.dataset.id,
          name: $('[name=name]', tr).value.trim(),
          total: $('[name=total]', tr).value,
          active: tr.dataset.id ? $('[name=active]', tr).checked : true
        };
        if (isD) payload.level = $('[name=level]', tr).checked;
        api(isD ? 'saveDeptCfg' : 'savePartnerCfg', payload).then(function (res) {
          setAdmin(res); drawCfg(kind); toast('저장했습니다.');
        }).catch(report);
      };
    });
    $$('[data-mv]').forEach(function (b) {
      b.onclick = function () {
        var id = b.closest('tr').dataset.id;
        var ids = list.map(function (x) { return x.id; });
        var i = ids.indexOf(id), j = i + Number(b.dataset.mv);
        ids[i] = ids[j]; ids[j] = id;
        api('reorder', { table: kind, ids: ids }).then(function (res) { setAdmin(res); drawCfg(kind); }).catch(report);
      };
    });
  }

  function drawSettings() {
    var s = S.admin.settings;
    $('#aOut').innerHTML = '<section class="card" style="max-width:640px"><div class="card-h"><h2>설정</h2></div><form class="card-b" id="setForm">' +
      '<label class="field"><span>조직 이름 (제목에 표시)</span><input type="text" name="orgName" value="' + h(s.orgName) + '" maxlength="40"></label>' +
      '<label class="field"><span>협력사 표 제목</span><input type="text" name="partnerTitle" value="' + h(s.partnerTitle) + '" maxlength="30"></label>' +
      '<label class="field"><span>협력사 표 설명</span><input type="text" name="partnerNote" value="' + h(s.partnerNote) + '" maxlength="40"></label>' +
      '<label class="field"><span>기타 칸 제목</span><input type="text" name="etcTitle" value="' + h(s.etcTitle) + '" maxlength="30"></label>' +
      '<label class="field"><span>입력 담당이 고칠 수 있는 지난 날짜 (일)</span><input type="number" name="editDays" min="0" max="365" value="' + h(s.editDays) + '">' +
      '<div class="hint">예: 7이면 오늘부터 7일 전까지만 고칠 수 있습니다. 그보다 이전은 관리자만 고칩니다.</div></label>' +
      '<button class="btn primary">저장</button></form></section>';
    $('#setForm').onsubmit = function (e) {
      e.preventDefault();
      var f = e.target.elements;
      api('saveSettings', { orgName: f.orgName.value, partnerTitle: f.partnerTitle.value, partnerNote: f.partnerNote.value,
                            etcTitle: f.etcTitle.value, editDays: f.editDays.value })
        .then(function (res) { setAdmin(res); render(); toast('설정을 저장했습니다.'); }).catch(report);
    };
  }

  function loadLog() {
    api('log', { limit: 300 }).then(function (res) {
      $('#aOut').innerHTML = '<section class="card"><div class="card-h"><h2>기록</h2><span class="note">최근 300건 · 누가 언제 무엇을 입력했는지</span></div>' +
        '<div class="scroll"><table class="grid"><thead><tr><th>시각</th><th>사용자</th><th>동작</th><th style="text-align:left">내용</th></tr></thead><tbody>' +
        (res.log.length ? res.log.map(function (l) {
          return '<tr><td class="c num" style="font-size:14px;white-space:nowrap">' + h(l.at) + '</td><td class="c">' + h(l.user) + '</td><td class="c">' + h(l.action) + '</td><td style="font-size:14px">' + h(l.detail) + '</td></tr>';
        }).join('') : '<tr><td colspan="4" class="empty">기록이 없습니다.</td></tr>') +
        '</tbody></table></div></section>';
    }).catch(function (err) { if (err.error !== 'AUTH') report(err); });
  }

  /* ---------- 내 정보 ---------- */

  function showMe() {
    var u = S.user;
    $('#view').innerHTML = '<section class="card" style="max-width:520px"><div class="card-h"><h2>내 정보</h2></div><div class="card-b">' +
      '<p style="font-size:18px;margin-bottom:6px"><b>' + h(u.name) + '</b> · <span class="tag ' + u.role + '">' + h(u.roleLabel) + '</span></p>' +
      (DEMO ? '<p class="hint" style="margin-bottom:14px">체험 모드 데이터를 처음 상태로 되돌리려면 <button class="btn small" id="demoReset">체험 데이터 지우기</button></p>' : '') +
      '<form id="myPin" style="margin-top:18px"><h3 style="font-size:17px;margin-bottom:12px">PIN 바꾸기</h3>' + pinFields() +
      '<div class="err" id="myErr"></div><button class="btn primary">바꾸기</button></form></div></section>';
    bindPinForm($('#myPin'), $('#myErr'), function () {});
    if ($('#demoReset')) $('#demoReset').onclick = function () {
      ask('체험 데이터 지우기', '이 브라우저에 저장된 체험 데이터를 모두 지우고 처음 상태로 돌아갑니다.', '지우기', function () {
        LocalBackend.reset(); logout();
      }, true);
    };
  }

  /* ---------- 시작 ---------- */

  function start() {
    try { S.token = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY); } catch (e) { S.token = null; }
    if (!S.token) return render();
    api('me', {}).then(function (res) {
      S.user = res.user; S.settings = res.settings; S.today = res.today; S.date = res.today;
      render();
    }).catch(function (err) {
      if (err.error === 'AUTH') return;
      S.token = null;
      render();
      if (err.error === 'NETWORK') toast(err.message, true);
    });
  }

  start();
})();
