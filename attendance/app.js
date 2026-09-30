/* 일일 근태현황 : 화면 */
(function () {
  'use strict';

  var CONFIG = window.ATTENDANCE_CONFIG || {};
  var DEMO = !CONFIG.apiUrl;
  var TOKEN_KEY = 'attendance-token';
  // 로고 : assets/logo.png 가 있으면 그 그림, 없으면 글자로 표시
  function logo(px) {
    return '<span class="brandmark" style="--h:' + px + 'px"><img src="./assets/logo.png" alt="EUGENE" onerror="this.parentNode.classList.add(\'noimg\')"><b>EUGENE</b></span>';
  }
  var CATS = [
    { key: 'trip', label: '출장', absent: true, color: 'var(--trip)' },
    { key: 'hq', label: '본사근무', absent: false, color: 'var(--hq)' },
    { key: 'edu', label: '교육', absent: true, color: 'var(--edu)' },
    { key: 'leave', label: '휴가', absent: true, color: 'var(--leave)' }
  ];
  // 협력사 카드 아래 빨간 안내 문구 (기존 엑셀과 같음)
  var PARTNER_PURPOSE = ['※ 사내협력사별 인원 수 집계 목적', '1. 현장안전관리 목적', '2. 협력사 자체집계 & 제출'];
  var DOW = ['일', '월', '화', '수', '목', '금', '토'];

  var ICON = {
    home: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.3 3.3a1 1 0 0 1 1.4 0l8 7.6c.6.6.2 1.6-.7 1.6H19v7a1.5 1.5 0 0 1-1.5 1.5H15v-5.5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1V21H6.5A1.5 1.5 0 0 1 5 19.5v-7h-1c-.9 0-1.3-1-.7-1.6z"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3.5" y="12" width="4.5" height="8.5" rx="1.5"/><rect x="9.75" y="4" width="4.5" height="16.5" rx="1.5"/><rect x="16" y="8" width="4.5" height="12.5" rx="1.5"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M10.3 2.6a1 1 0 0 1 1-.8h1.4a1 1 0 0 1 1 .8l.3 2a7.5 7.5 0 0 1 1.9 1.1l1.9-.7a1 1 0 0 1 1.2.4l.7 1.2a1 1 0 0 1-.2 1.3l-1.6 1.3a7.6 7.6 0 0 1 0 2.2l1.6 1.3a1 1 0 0 1 .2 1.3l-.7 1.2a1 1 0 0 1-1.2.4l-1.9-.7a7.5 7.5 0 0 1-1.9 1.1l-.3 2a1 1 0 0 1-1 .8h-1.4a1 1 0 0 1-1-.8l-.3-2a7.5 7.5 0 0 1-1.9-1.1l-1.9.7a1 1 0 0 1-1.2-.4l-.7-1.2a1 1 0 0 1 .2-1.3l1.6-1.3a7.6 7.6 0 0 1 0-2.2L4.6 9.1a1 1 0 0 1-.2-1.3l.7-1.2a1 1 0 0 1 1.2-.4l1.9.7a7.5 7.5 0 0 1 1.9-1.1zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="4.5"/><path d="M3.5 20.2C4.3 16.4 7.8 14 12 14s7.7 2.4 8.5 6.2c.1.7-.4 1.3-1.1 1.3H4.6c-.7 0-1.2-.6-1.1-1.3z"/></svg>',
    left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'
  };
  var CHEV = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>';

  var S = {
    token: null, user: null, settings: {}, today: '',
    tab: 'board', date: '', board: null,
    statsRange: null, statsQuick: 'm0', stats: null,
    adminTab: 'users', admin: null
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
  function fmtDate(d) { var p = d.split('-'); return Number(p[1]) + '월 ' + Number(p[2]) + '일 ' + dow(d) + '요일'; }
  function fmtShort(d) { var p = d.split('-'); return Number(p[1]) + '.' + Number(p[2]) + ' (' + dow(d) + ')'; }
  function localToday() { return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); }
  function splitEntry(e) {
    var m = String(e).match(/^(.*?)\s*\((.*)\)\s*$/);
    return m ? { name: m[1], note: m[2] } : { name: String(e), note: '' };
  }
  function pill(cat, entry) {
    var p = splitEntry(entry);
    return '<span class="pill ' + cat + '">' + h(p.name) + (p.note ? ' <em>' + h(p.note) + '</em>' : '') + '</span>';
  }
  function catLabel(key) { return CATS.filter(function (c) { return c.key === key; })[0].label; }
  function initial(name) { return h(String(name || '?').trim().charAt(0)); }

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
    busyCount = Math.max(0, busyCount + (on ? 1 : -1));
    var el = $('.busy');
    if (busyCount && !el) { el = document.createElement('div'); el.className = 'busy'; document.body.appendChild(el); }
    else if (!busyCount && el) el.remove();
  }

  /* ---------- 서버 호출 ---------- */

  function api(action, payload) {
    var req = Object.assign({ action: action, token: S.token }, payload || {});
    busy(true);
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
        return { ok: false, error: 'NETWORK', message: '서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.' };
      });
    }
    return p.then(function (res) {
      busy(false);
      if (res.ok) return res;
      if (res.error === 'AUTH' && action !== 'login') { logout(true); throw res; }
      if (res.error === 'MUST_CHANGE') { S.user.mustChange = true; render(); throw res; }
      throw res;
    });
  }

  function report(err) { toast((err && err.message) || '문제가 생겼어요. 다시 해 주세요.', true); }

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
    render();
    if (expired) toast('로그인이 끝났어요. 다시 로그인해 주세요.', true);
  }

  /* ---------- 로그인 ---------- */

  var keyHandler = null;
  function setKeys(fn) {
    if (keyHandler) document.removeEventListener('keydown', keyHandler);
    keyHandler = fn;
    if (fn) document.addEventListener('keydown', fn);
  }

  function renderLogin(name, remember) {
    setKeys(null);
    document.title = '로그인 · 일일 근태현황';
    app.innerHTML =
      '<div class="login"><form class="login-in" id="nameForm" autocomplete="off">' +
      '<div style="margin-bottom:28px">' + logo(40) + '</div>' +
      '<h1>이름을<br>입력해 주세요</h1>' +
      '<p class="sub">일일 근태현황에 들어갑니다</p>' +
      '<input class="uline" id="lgName" placeholder="홍길동" autocomplete="username" maxlength="30" value="' + h(name || '') + '">' +
      '<label class="toggle" style="margin-top:22px"><span>이 기기에서 로그인 유지</span><input type="checkbox" id="lgRemember"' + (remember ? ' checked' : '') + '></label>' +
      '<p class="hint" style="margin:0 0 28px">여러 사람이 같이 쓰는 PC에서는 끄세요.</p>' +
      '<button class="btn primary lg block">다음</button>' +
      (DEMO ? '<div class="demo-note"><b>체험 모드</b> · 이 브라우저에만 저장돼요.<br>처음 로그인: 이름 <b>관리자</b> / PIN <b>1234</b></div>' : '') +
      '</form></div>';
    var inp = $('#lgName');
    inp.focus();
    $('#nameForm').onsubmit = function (e) {
      e.preventDefault();
      var n = inp.value.trim();
      if (!n) { inp.focus(); inp.classList.add('shake'); setTimeout(function () { inp.classList.remove('shake'); }, 400); return; }
      renderPin(n, $('#lgRemember').checked);
    };
  }

  function renderPin(name, remember) {
    var pin = '';
    app.innerHTML =
      '<div class="login"><div class="login-in">' +
      '<button class="backlink" id="pinBack">' + ICON.left.replace('<svg', '<svg width="18" height="18"') + ' 이름 다시 입력</button>' +
      '<h1>' + h(name) + '님,<br>PIN을 눌러 주세요</h1>' +
      '<p class="sub" id="pinMsg">숫자 4~8자리</p>' +
      '<div class="dots" id="dots"></div>' +
      '<div class="keypad" id="keypad">' +
      [1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (n) { return '<button data-k="' + n + '">' + n + '</button>'; }).join('') +
      '<button class="fn" data-k="clear">전체 삭제</button><button data-k="0">0</button><button class="fn" data-k="back">← 지우기</button>' +
      '</div>' +
      '<button class="btn primary lg block" id="pinGo" disabled>확인</button>' +
      '<p class="hint" style="text-align:center;margin-top:18px">PIN을 잊었으면 관리자에게 다시 정해 달라고 하세요.</p>' +
      '</div></div>';
    var dots = $('#dots'), go = $('#pinGo'), msg = $('#pinMsg');
    function draw() {
      var n = Math.max(4, Math.min(8, pin.length + (pin.length >= 4 && pin.length < 8 ? 1 : 0)));
      var out = '';
      for (var i = 0; i < n; i++) out += '<i class="' + (i < pin.length ? 'on' : '') + '"></i>';
      dots.innerHTML = out;
      go.disabled = pin.length < 4;
    }
    function key(k) {
      if (k === 'back') pin = pin.slice(0, -1);
      else if (k === 'clear') pin = '';
      else if (pin.length < 8) pin += k;
      draw();
    }
    function submit() {
      if (pin.length < 4) return;
      api('login', { name: name, pin: pin, remember: remember }).then(function (res) {
        setKeys(null);
        storeToken(res.token, remember);
        S.user = res.user; S.settings = res.settings; S.today = res.today;
        S.date = res.today; S.tab = 'board';
        render();
      }).catch(function (err) {
        pin = ''; draw();
        msg.textContent = err.message || '로그인하지 못했어요.';
        msg.style.color = 'var(--red)';
        dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake');
      });
    }
    $$('#keypad button').forEach(function (b) { b.onclick = function () { key(b.dataset.k); }; });
    go.onclick = submit;
    $('#pinBack').onclick = function () { renderLogin(name, remember); };
    setKeys(function (e) {
      if (/^[0-9]$/.test(e.key)) key(e.key);
      else if (e.key === 'Backspace') key('back');
      else if (e.key === 'Enter') submit();
      else return;
      e.preventDefault();
    });
    draw();
  }

  function pinFields() {
    return '<label class="field"><span>지금 PIN</span><input type="password" name="old" class="inp" inputmode="numeric" maxlength="8" required></label>' +
      '<label class="field"><span>새 PIN (숫자 4~8자리)</span><input type="password" name="n1" class="inp" inputmode="numeric" maxlength="8" required></label>' +
      '<label class="field"><span>새 PIN 한 번 더</span><input type="password" name="n2" class="inp" inputmode="numeric" maxlength="8" required></label>';
  }

  function bindPinForm(form, errEl, done) {
    form.onsubmit = function (e) {
      e.preventDefault();
      var f = form.elements;
      errEl.textContent = '';
      if (f.n1.value !== f.n2.value) { errEl.textContent = '새 PIN 두 개가 서로 달라요.'; return; }
      api('changePin', { oldPin: f.old.value, newPin: f.n1.value, remember: remembered() })
        .then(function (res) {
          storeToken(res.token, remembered());
          S.user = res.user;
          toast('PIN을 바꿨어요.');
          form.reset();
          done();
        })
        .catch(function (err) { errEl.textContent = err.message; });
    };
  }

  function renderMustChange() {
    setKeys(null);
    app.innerHTML =
      '<div class="login"><form class="login-in" id="pinForm">' +
      '<div style="margin-bottom:28px">' + logo(40) + '</div>' +
      '<h1>새 PIN을<br>정해 주세요</h1>' +
      '<p class="sub">' + h(S.user.name) + '님만 아는 번호로 바꿔 주세요.</p>' +
      pinFields() +
      '<div class="err" id="pinErr"></div>' +
      '<button class="btn primary lg block">바꾸기</button>' +
      '<button type="button" class="btn grey block" id="pinOut" style="margin-top:8px">로그아웃</button>' +
      '</form></div>';
    $('#pinOut').onclick = function () { logout(); };
    bindPinForm($('#pinForm'), $('#pinErr'), function () { render(); });
  }

  /* ---------- 틀 ---------- */

  function tabs() {
    var t = [['board', '근태현황', ICON.home], ['stats', '통계', ICON.chart]];
    if (S.user.role === 'admin') t.push(['admin', '관리', ICON.gear]);
    t.push(['me', '내 정보', ICON.user]);
    return t;
  }

  function render() {
    closeSheet();
    if (!S.token || !S.user) return renderLogin();
    if (S.user.mustChange) return renderMustChange();
    setKeys(null);
    var t = tabs();
    document.title = (S.settings.orgName || '') + ' 일일 근태현황';
    app.innerHTML =
      '<div class="shell">' +
      '<aside class="side">' +
      '<div class="brand">' + logo(34) + '</div>' +
      '<div style="padding:0 12px 18px"><b style="font-size:17px;font-weight:800;display:block">일일 근태현황</b><small style="color:var(--g500);font-size:13px">' + h(S.settings.orgName) + '</small></div>' +
      '<nav class="nav">' + t.map(function (x) {
        return '<button class="' + (S.tab === x[0] ? 'on' : '') + '" data-tab="' + x[0] + '">' + x[2] + x[1] + '</button>';
      }).join('') + '</nav>' +
      '<div class="me"><div class="avatar sm">' + initial(S.user.name) + '</div><div class="who"><b>' + h(S.user.name) + '</b><small>' + h(S.user.roleLabel) + '</small></div>' +
      '<button class="tbtn" id="btnOut" style="color:var(--g500);font-size:14px">로그아웃</button></div>' +
      '</aside>' +
      '<main class="main">' +
      '<div class="mtop">' + logo(26) + '<b></b><div class="avatar sm">' + initial(S.user.name) + '</div></div>' +
      '<div class="page" id="view"></div></main>' +
      '<nav class="tabbar" style="--n:' + t.length + '">' + t.map(function (x) {
        return '<button class="' + (S.tab === x[0] ? 'on' : '') + '" data-tab="' + x[0] + '">' + x[2] + x[1] + '</button>';
      }).join('') + '</nav>' +
      '</div>';
    $('#btnOut').onclick = function () { logout(); };
    $$('[data-tab]').forEach(function (b) { b.onclick = function () { S.tab = b.dataset.tab; render(); window.scrollTo(0, 0); }; });
    ({ board: showBoard, stats: showStats, admin: showAdmin, me: showMe })[S.tab]();
  }

  function demoBanner() {
    return DEMO ? '<div class="demo-banner">체험 모드 · 입력한 내용은 이 브라우저에만 저장돼요</div>' : '';
  }

  /* ---------- 근태현황 ---------- */

  function showBoard() {
    if (!S.date) S.date = S.today || localToday();
    $('#view').innerHTML = demoBanner() + '<div class="empty">불러오는 중…</div>';
    loadBoard();
  }

  function loadBoard() {
    return api('board', { date: S.date })
      .then(function (res) { S.board = res; S.today = res.today; drawBoard(); })
      .catch(function (err) { if (err.error !== 'AUTH') { report(err); $('#view').innerHTML = '<div class="card empty">불러오지 못했어요.</div>'; } });
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

  function statCard(k, v, unit, s, bar, cls, extra) {
    return '<div class="card stat">' +
      '<div class="k">' + k + '</div>' +
      '<div class="v num">' + v + '<small>' + h(unit) + '</small></div>' +
      (s ? '<div class="s">' + s + '</div>' : '') +
      (bar != null ? '<div class="bar ' + (cls || '') + '"><i style="width:' + Math.min(100, bar) + '%"></i></div>' : '') +
      (extra || '') + '</div>';
  }

  function drawBoard() {
    var b = S.board, c = computed(), st = S.settings;
    var myTodo = c.depts.filter(function (x) { return x.editable && !x.entered; }).length;
    var isToday = b.date === b.today;
    var rate = pct(c.sum.working, c.sum.total);

    var html = demoBanner() +
      '<div class="ph"><div>' +
      '<div class="sub">' + h(st.orgName) + ' 근태현황</div>' +
      '<div class="datenav"><button class="arrow" id="dPrev" aria-label="전날">' + ICON.left + '</button>' +
      '<label class="datelabel"><h1>' + h(fmtDate(b.date)) + '</h1><input type="date" id="dPick" value="' + h(b.date) + '" aria-label="날짜 고르기"></label>' +
      '<button class="arrow" id="dNext" aria-label="다음날">' + ICON.right + '</button>' +
      (isToday ? '<span class="today-chip">오늘</span>' : '<button class="today-chip" id="dToday">오늘로</button>') +
      '</div></div><span class="sp"></span>' +
      '<div class="acts"><button class="btn grey sm" id="btnXlsx">엑셀 받기</button><button class="btn grey sm" id="btnPrint">인쇄</button></div></div>' +
      (S.user.role !== 'viewer' && !b.perms.dateEditable ? '<div class="demo-banner" style="background:var(--g100);color:var(--g600)">수정 기간이 지난 날짜라 볼 수만 있어요</div>' : '');

    // 요약
    html += '<div class="hero">' +
      statCard('본부 근무자', c.sum.working, ' / ' + c.sum.total + '명', '출근율 <b style="color:var(--blue)">' + rate + '%</b>', rate, '',
        '<div class="catline">' + CATS.map(function (k) {
          return '<span><i style="background:' + k.color + '"></i>' + k.label + ' <b class="num">' + c.sum[k.key] + '</b></span>';
        }).join('') + '</div>' +
        (myTodo ? '<div class="cta"><p>아직 입력 안 된 내 담당 부서가 <b>' + myTodo + '곳</b> 있어요</p><button class="btn primary sm" id="btnRest">모두 이상 없음</button></div>' : '')) +
      statCard('사내협력사 근무자', c.psum.working, ' / ' + c.psum.total + '명', '출근율 ' + pct(c.psum.working, c.psum.total) + '%', pct(c.psum.working, c.psum.total), 'green') +
      statCard('입력 현황', c.sum.entered, ' / ' + c.depts.length + ' 부서', '협력사 ' + c.psum.entered + ' / ' + c.partners.length + '곳', pct(c.sum.entered, c.depts.length)) +
      '</div>';

    // 부서 : PC는 엑셀처럼 칸으로 나눈 표, 휴대폰은 항목 이름표가 붙은 목록
    function names(cat, list) {
      if (!list.length) return '<span class="none">-</span>';
      return list.map(function (e) {
        var p = splitEntry(e);
        return '<div class="nm">' + h(p.name) + (p.note ? ' <span class="note">(' + h(p.note) + ')</span>' : '') + '</div>';
      }).join('');
    }
    html += '<section class="card flush"><div class="card-h"><h2>' + h(st.orgName) + '</h2><span class="sp"></span>' +
      (b.perms.depts.length ? '<span class="note">부서를 누르면 입력해요</span>' : '') + '</div>' +
      '<div class="dtable-wrap"><table class="dtable"><thead><tr><th class="l">부서명</th><th>총인원</th><th>근무자</th>' +
      CATS.map(function (k) { return '<th class="cat-col"><i style="background:' + k.color + '"></i>' + k.label + '</th>'; }).join('') +
      '<th></th></tr></thead><tbody>' +
      c.depts.map(function (x) {
        return '<tr class="' + (x.d.level ? 'child' : 'group') + (x.editable ? ' click' : '') + '" data-dept="' + h(x.d.id) + '">' +
          '<td class="l dn">' + h(x.d.name) + (x.entered ? '' : '<br><span class="badge todo">미입력</span>') + '</td>' +
          '<td class="c num">' + x.total + '</td>' +
          '<td class="c num wk' + (x.working < x.total ? ' lost' : '') + '">' + x.working + '</td>' +
          CATS.map(function (k) { return '<td class="ppl ' + k.key + '">' + names(k.key, x[k.key]) + '</td>'; }).join('') +
          '<td class="c">' + (x.editable ? CHEV : '') + '</td></tr>';
      }).join('') +
      '<tr class="sum"><td class="l">소계</td><td class="c num">' + c.sum.total + '</td><td class="c num wk">' + c.sum.working + '</td>' +
      CATS.map(function (k) { return '<td class="c num">' + (c.sum[k.key] ? c.sum[k.key] + '명' : '') + '</td>'; }).join('') + '<td></td></tr>' +
      '</tbody></table></div>' +
      '<div class="dlist">';
    c.depts.forEach(function (x, i) {
      if (i && !x.d.level) html += '<div class="divider"></div>';
      var lines = CATS.filter(function (k) { return x[k.key].length; }).map(function (k) {
        return '<div class="catrow"><span class="lab ' + k.key + '">' + k.label + '</span><span class="who">' +
          x[k.key].map(function (e) { var p = splitEntry(e); return h(p.name) + (p.note ? ' <span class="note">(' + h(p.note) + ')</span>' : ''); }).join(', ') +
          '</span></div>';
      }).join('');
      var sub = lines || '<div class="d">' + (x.entered ? '모두 출근' : '아직 입력 전이에요') + '</div>';
      html += '<div class="row' + (x.d.level ? ' child' : ' group') + (x.editable ? ' click' : '') + '" data-dept="' + h(x.d.id) + '">' +
        '<div class="mid"><div class="t">' + h(x.d.name) + (x.entered ? '' : ' <span class="badge todo">미입력</span>') + '</div>' + sub + '</div>' +
        '<div class="end"><b class="num' + (x.working < x.total ? ' lost' : '') + '">' + x.working + '</b><span class="num"> / ' + x.total + '</span></div>' +
        (x.editable ? CHEV : '') + '</div>';
    });
    html += '<div class="divider"></div><div class="row"><div class="mid"><div class="t" style="font-weight:800">합계</div></div>' +
      '<div class="end"><b class="num">' + c.sum.working + '</b><span class="num"> / ' + c.sum.total + '</span></div></div></div></section>';

    // 협력사 + 기타
    html += '<div class="layout" style="grid-template-columns:repeat(auto-fit,minmax(340px,1fr))">';
    html += '<section class="card flush"><div class="card-h"><h2>' + h(st.partnerTitle) + '</h2>' +
      (st.partnerNote ? '<span class="note">' + h(st.partnerNote) + '</span>' : '') + '<span class="sp"></span>' +
      (b.perms.partners.length ? '<button class="tbtn" id="btnPartners">입력</button>' : '') + '</div>' +
      c.partners.map(function (x) {
        return '<div class="row' + (x.editable ? ' click' : '') + '" data-partner="1" style="min-height:52px;padding-top:10px;padding-bottom:10px">' +
          '<div class="mid"><div class="t" style="font-size:16px">' + h(x.p.name) + (x.entered ? '' : ' <span class="badge todo">미입력</span>') + '</div></div>' +
          '<div class="end"><b class="num' + (x.working < x.total ? ' lost' : '') + '" style="font-size:17px">' + x.working + '</b><span class="num"> / ' + x.total + '</span></div></div>';
      }).join('') +
      '<div class="divider"></div><div class="row" style="min-height:52px"><div class="mid"><div class="t" style="font-weight:800;font-size:16px">합계</div></div>' +
      '<div class="end"><b class="num">' + c.psum.working + '</b><span class="num"> / ' + c.psum.total + '</span></div></div>' +
      '<div style="padding:4px 24px 16px;color:var(--red);font-size:14px;font-weight:700;line-height:1.7">' +
      h(PARTNER_PURPOSE[0]) + '<br>' + PARTNER_PURPOSE.slice(1).map(function (l) { return '&nbsp;&nbsp;' + h(l); }).join('<br>') + '</div>' +
      '</section>';

    var etcLines = b.etc ? b.etc.text.split('\n') : [];
    html += '<section class="card flush"><div class="card-h"><h2>' + h(st.etcTitle) + '</h2><span class="sp"></span>' +
      (b.perms.etc ? '<button class="tbtn" id="btnEtc">' + (b.etc ? '수정' : '입력') + '</button>' : '') + '</div>' +
      (etcLines.length
        ? '<ol class="etc-list">' + etcLines.map(function (l) { return '<li>' + h(l) + '</li>'; }).join('') + '</ol>' +
          '<div class="meta">' + h(b.etc.by) + ' · ' + h(String(b.etc.at).slice(5, 16)) + '</div>'
        : '<div class="empty">오늘은 없어요</div>') +
      '</section></div>';

    html += printSheet(c);
    $('#view').innerHTML = html;

    $('#dPrev').onclick = function () { S.date = addDays(S.date, -1); loadBoard(); };
    $('#dNext').onclick = function () { S.date = addDays(S.date, 1); loadBoard(); };
    $('#dPick').onchange = function (e) { if (e.target.value) { S.date = e.target.value; loadBoard(); } };
    if ($('#dToday')) $('#dToday').onclick = function () { S.date = S.today; loadBoard(); };
    $('#btnPrint').onclick = function () { window.print(); };
    $('#btnXlsx').onclick = function () { exportBoard(c); };
    if ($('#btnRest')) $('#btnRest').onclick = confirmRest;
    if ($('#btnPartners')) $('#btnPartners').onclick = function () { editPartners(c); };
    $$('.row.click[data-partner]').forEach(function (r) { r.onclick = function () { editPartners(c); }; });
    if ($('#btnEtc')) $('#btnEtc').onclick = editEtc;
    $$('.click[data-dept]').forEach(function (el) {
      el.onclick = function () {
        var x = c.depts.filter(function (d) { return d.d.id === el.dataset.dept; })[0];
        if (x) editDept(x);
      };
    });
  }

  // 인쇄할 때만 보이는 기존 엑셀 양식
  function printSheet(c) {
    var b = S.board, st = S.settings;
    return '<div class="print-sheet"><h1>' + h(st.orgName) + ' 일일 근태현황</h1><div class="d">날짜: ' + h(b.date) + ' (' + dow(b.date) + ')</div>' +
      '<div class="wrap"><table><caption>■ ' + h(st.orgName) + '</caption><thead><tr><th>부서명</th><th>총인원</th><th>근무자</th>' +
      CATS.map(function (k) { return '<th>' + k.label + '</th>'; }).join('') + '</tr></thead><tbody>' +
      c.depts.map(function (x) {
        return '<tr><td class="' + (x.d.level ? 'in' : 'b') + '">' + h(x.d.name) + '</td><td class="c">' + x.total + '</td><td class="c b">' + x.working + '</td>' +
          CATS.map(function (k) { return '<td>' + h(x[k.key].join(', ')) + '</td>'; }).join('') + '</tr>';
      }).join('') +
      '<tr class="sum"><td class="c">소 계</td><td class="c">' + c.sum.total + '</td><td class="c">' + c.sum.working + '</td><td colspan="4"></td></tr></tbody></table>' +
      '<div><table><caption>■ ' + h(st.partnerTitle) + (st.partnerNote ? ' (' + h(st.partnerNote) + ')' : '') + '</caption><thead><tr><th>업체명</th><th>총인원</th><th>근무자</th></tr></thead><tbody>' +
      c.partners.map(function (x) { return '<tr><td class="c">' + h(x.p.name) + '</td><td class="c">' + x.total + '</td><td class="c">' + x.working + '</td></tr>'; }).join('') +
      '<tr class="sum"><td class="c">소 계</td><td class="c">' + c.psum.total + '</td><td class="c">' + c.psum.working + '</td></tr></tbody></table>' +
      '<div style="color:#e00;font-weight:700;margin-top:2mm;line-height:1.6">' + PARTNER_PURPOSE.map(h).join('<br>') + '</div></div></div>' +
      '<div class="etc"><b>' + h(st.etcTitle) + '</b>' +
      (b.etc ? '<ol>' + b.etc.text.split('\n').map(function (l) { return '<li>' + h(l) + '</li>'; }).join('') + '</ol>' : '없음') + '</div></div>';
  }

  function confirmRest() {
    var names = computed().depts.filter(function (x) { return x.editable && !x.entered; }).map(function (x) { return x.d.name; });
    ask('모두 이상 없음으로 저장할까요?', '출장·교육·휴가 없이 기본 인원 그대로 저장해요.<div class="pills" style="margin-top:12px">' +
      names.map(function (n) { return '<span class="pill hq">' + h(n) + '</span>'; }).join('') + '</div>', '저장하기', function () {
      api('confirmRest', { date: S.date }).then(function (res) {
        toast(res.saved.length + '개 부서를 저장했어요.');
        loadBoard();
      }).catch(report);
    });
  }

  /* ---------- 시트 ---------- */

  function openSheet(title, sub, body, foot, cls) {
    closeSheet();
    var ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = '<div class="sheet ' + (cls || '') + '" role="dialog" aria-modal="true"><div class="grab"></div>' +
      '<div class="sheet-h"><div><h3>' + title + '</h3>' + (sub ? '<p>' + sub + '</p>' : '') + '</div><button class="x" aria-label="닫기">' + ICON.x + '</button></div>' +
      '<div class="sheet-b">' + body + '</div>' + (foot ? '<div class="sheet-f">' + foot + '</div>' : '') + '</div>';
    document.body.appendChild(ov);
    document.body.style.overflow = 'hidden';
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) closeSheet(); });
    $$('.x,[data-close]', ov).forEach(function (b) { b.onclick = closeSheet; });
    return ov;
  }
  function closeSheet() {
    var ov = $('.overlay');
    if (ov) ov.remove();
    document.body.style.overflow = '';
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });

  function ask(title, bodyHtml, okLabel, onOk, danger) {
    var ov = openSheet(h(title), '', '<div style="font-size:16px;color:var(--g700);line-height:1.6">' + bodyHtml + '</div>',
      '<button class="btn grey lg" data-close>취소</button><button class="btn lg ' + (danger ? 'danger' : 'primary') + '" id="askOk">' + h(okLabel) + '</button>');
    $('#askOk', ov).onclick = function () { closeSheet(); onOk(); };
  }

  /* ---------- 부서 입력 ---------- */

  function editDept(x) {
    var st = {};
    CATS.forEach(function (k) { st[k.key] = x[k.key].slice(); });

    var body =
      '<div class="totalrow"><b>총인원</b><div class="stepper"><button type="button" id="tMinus" aria-label="빼기">−</button>' +
      '<input type="number" id="tVal" class="num" min="0" max="999" inputmode="numeric"><button type="button" id="tPlus" aria-label="더하기">+</button></div></div>' +
      '<div class="calc"><div><div class="k">오늘 근무자</div><div class="v num" id="cV"></div></div><div class="f" id="cF"></div></div>' +
      CATS.map(function (k) {
        return '<div class="cat" data-cat="' + k.key + '"><div class="cat-h"><span class="dot" style="background:' + k.color + '"></span><h4>' + k.label + '</h4>' +
          (k.absent ? '' : '<small>근무로 셈</small>') + '<span class="cnt"></span></div>' +
          '<div class="people"></div>' +
          '<div class="add"><input type="text" class="inp pn" placeholder="이름" maxlength="20">' +
          '<input type="text" class="inp pm" placeholder="' + (k.key === 'trip' ? '행선지 (선택)' : k.key === 'leave' ? '연차·반차 (선택)' : '메모 (선택)') + '" maxlength="50">' +
          '<button type="button" class="btn soft">추가</button></div></div>';
      }).join('') +
      '<button type="button" class="tbtn" id="loadPrev" style="margin:4px 0 0 -8px">전날 내용 불러오기</button>' +
      (x.entered ? '<p class="hint">마지막 입력: ' + h(x.r.by) + ' · ' + h(String(x.r.at).slice(5, 16)) + '</p>' : '') +
      '<div class="err" id="deErr"></div>';

    var ov = openSheet(h(x.d.name), h(fmtDate(S.date)), body,
      '<button class="btn grey lg" data-close>취소</button><button class="btn primary lg" id="deSave">저장하기</button>', 'wide');

    var tVal = $('#tVal', ov);
    tVal.value = x.total;

    function draw() {
      var absent = 0;
      CATS.forEach(function (k) {
        var box = $('[data-cat="' + k.key + '"]', ov);
        $('.cnt', box).textContent = st[k.key].length ? st[k.key].length + '명' : '';
        $('.people', box).innerHTML = st[k.key].map(function (e, i) {
          var p = splitEntry(e);
          return '<span class="pill ' + k.key + '">' + h(p.name) + (p.note ? ' <em>' + h(p.note) + '</em>' : '') +
            '<button type="button" data-i="' + i + '" aria-label="빼기">×</button></span>';
        }).join('');
        $$('.people button', box).forEach(function (b) {
          b.onclick = function () { st[k.key].splice(Number(b.dataset.i), 1); draw(); };
        });
        if (k.absent) absent += st[k.key].length;
      });
      var t = Number(tVal.value) || 0, w = t - absent;
      $('#cV', ov).innerHTML = Math.max(0, w) + '<small>명</small>';
      $('#cF', ov).innerHTML = w < 0 ? '<span style="color:var(--red);font-weight:700">빠진 인원이 총인원보다 많아요</span>'
        : '총인원 ' + t + ' − 출장·교육·휴가 ' + absent;
    }

    $('#tMinus', ov).onclick = function () { tVal.value = Math.max(0, (Number(tVal.value) || 0) - 1); draw(); };
    $('#tPlus', ov).onclick = function () { tVal.value = (Number(tVal.value) || 0) + 1; draw(); };
    tVal.oninput = draw;

    function entryOf(box) {
      var n = $('.pn', box).value.replace(/[()]/g, '').trim(), m = $('.pm', box).value.replace(/[()]/g, '').trim();
      return n ? (m ? n + ' (' + m + ')' : n) : '';
    }
    CATS.forEach(function (k) {
      var box = $('[data-cat="' + k.key + '"]', ov);
      var pn = $('.pn', box), pm = $('.pm', box);
      function add() {
        var e = entryOf(box);
        if (!e) { pn.focus(); return; }
        st[k.key].push(e);
        pn.value = ''; pm.value = '';
        pn.focus();
        draw();
      }
      $('.btn', box).onclick = add;
      [pn, pm].forEach(function (inp) {
        inp.onkeydown = function (e) {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          if (inp === pn && !pm.value && pn.value) pm.focus(); else add();
        };
      });
    });

    $('#loadPrev', ov).onclick = function () {
      api('board', { date: addDays(S.date, -1) }).then(function (res) {
        var r = res.rows[x.d.id];
        if (!r) { toast('전날 입력된 내용이 없어요.', true); return; }
        tVal.value = r.total;
        CATS.forEach(function (k) { st[k.key] = r[k.key].slice(); });
        draw();
        toast('전날 내용을 불러왔어요. 확인하고 저장하세요.');
      }).catch(report);
    };

    $('#deSave', ov).onclick = function () {
      // 칸에 적어 놓고 "추가"를 안 누른 이름도 넣어 줌
      CATS.forEach(function (k) {
        var box = $('[data-cat="' + k.key + '"]', ov);
        var e = entryOf(box);
        if (e) { st[k.key].push(e); $('.pn', box).value = ''; $('.pm', box).value = ''; }
      });
      var payload = { date: S.date, deptId: x.d.id, total: Number(tVal.value) };
      CATS.forEach(function (k) { payload[k.key] = st[k.key]; });
      api('saveDept', payload).then(function (res) {
        S.board.rows[x.d.id] = res.row;
        closeSheet();
        drawBoard();
        toast(x.d.name + ' 저장했어요.');
      }).catch(function (err) { $('#deErr', ov).textContent = err.message; draw(); });
    };
    draw();
  }

  /* ---------- 협력사 입력 ---------- */

  function editPartners(c) {
    var list = c.partners.filter(function (x) { return x.editable; });
    var body = '<div class="plist"><div class="prow"><div></div><div class="ph2">총인원</div><div class="ph2">근무자</div></div>' +
      list.map(function (x) {
        return '<div class="prow"><div class="n">' + h(x.p.name) + '</div>' +
          '<input type="number" class="inp num" min="0" inputmode="numeric" data-t="' + h(x.p.id) + '" value="' + x.total + '">' +
          '<input type="number" class="inp num" min="0" inputmode="numeric" data-w="' + h(x.p.id) + '" value="' + x.working + '"></div>';
      }).join('') +
      '<div class="prow sum"><div class="n">합계</div><div class="num" id="pT"></div><div class="num" id="pW"></div></div></div>' +
      '<p class="hint">칸을 누르면 숫자가 전체 선택돼요. 엔터를 누르면 다음 칸으로 가요.</p><div class="err" id="peErr"></div>';
    var ov = openSheet(h(S.settings.partnerTitle) + ' 인원', h(fmtDate(S.date)), body,
      '<button class="btn grey lg" data-close>취소</button><button class="btn primary lg" id="peSave">저장하기</button>');
    function sums() {
      var t = 0, w = 0;
      $$('[data-t]', ov).forEach(function (i) { t += Number(i.value) || 0; });
      $$('[data-w]', ov).forEach(function (i) { w += Number(i.value) || 0; });
      $('#pT', ov).textContent = t; $('#pW', ov).textContent = w;
    }
    $$('.plist input', ov).forEach(function (i) {
      i.onfocus = function () { i.select(); };
      i.oninput = sums;
      i.onkeydown = function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        var all = $$('.plist input', ov), n = all[all.indexOf(i) + 1];
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
        closeSheet(); drawBoard();
        toast('협력사 인원을 저장했어요.');
      }).catch(function (err) { $('#peErr', ov).textContent = err.message; });
    };
  }

  /* ---------- 기타 ---------- */

  function editEtc() {
    var cur = S.board.etc ? S.board.etc.text : '';
    var ov = openSheet(h(S.settings.etcTitle), h(fmtDate(S.date)),
      '<label class="field"><span>한 줄에 하나씩 적어 주세요</span>' +
      '<textarea class="inp" id="etcText" placeholder="야적장 포장공사 (상호: 수덕건설, 인원: 3)&#10;비파괴 검사 (상호: APN)">' + h(cur) + '</textarea></label>' +
      '<button type="button" class="tbtn" id="etcPrev" style="margin-left:-8px">전날 내용 불러오기</button><div class="err" id="etcErr"></div>',
      '<button class="btn grey lg" data-close>취소</button><button class="btn primary lg" id="etcSave">저장하기</button>');
    $('#etcPrev', ov).onclick = function () {
      api('board', { date: addDays(S.date, -1) }).then(function (res) {
        if (!res.etc) { toast('전날 내용이 없어요.', true); return; }
        $('#etcText', ov).value = res.etc.text;
      }).catch(report);
    };
    $('#etcSave', ov).onclick = function () {
      api('saveEtc', { date: S.date, text: $('#etcText', ov).value }).then(function (res) {
        S.board.etc = res.etc; closeSheet(); drawBoard(); toast('저장했어요.');
      }).catch(function (err) { $('#etcErr', ov).textContent = err.message; });
    };
  }

  /* ---------- 엑셀 ---------- */

  function needXlsx() {
    if (window.XLSX) return true;
    toast('엑셀 도구를 불러오는 중이에요. 잠시 후 다시 눌러 주세요.', true);
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
    PARTNER_PURPOSE.forEach(function (l) { aoa.push(['', '', '', '', '', '', '', '', '', l]); });
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

  /* ---------- 통계 ---------- */

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
    var quick = [['m0', '이번 달'], ['m-1', '지난 달'], ['d7', '최근 7일'], ['d30', '최근 30일']];
    $('#view').innerHTML = demoBanner() +
      '<div class="ph"><div><div class="sub">출장·교육·휴가를 기간별로 모아 봐요</div><h1>통계</h1></div><span class="sp"></span>' +
      '<div class="acts"><button class="btn grey sm" id="sXlsx">엑셀 받기</button></div></div>' +
      '<div class="rangebar"><div class="seg">' + quick.map(function (q) {
        return '<button data-q="' + q[0] + '" class="' + (S.statsQuick === q[0] ? 'on' : '') + '">' + q[1] + '</button>';
      }).join('') + '</div>' +
      '<div class="dates"><input type="date" class="inp" id="sFrom" value="' + h(r.from) + '"><span style="color:var(--g400)">~</span>' +
      '<input type="date" class="inp" id="sTo" value="' + h(r.to) + '"><button class="btn soft sm" id="sGo" style="height:42px">조회</button></div></div>' +
      '<div id="sOut"><div class="card empty">불러오는 중…</div></div>';
    $('#sGo').onclick = function () { S.statsQuick = ''; S.statsRange = { from: $('#sFrom').value, to: $('#sTo').value }; showStats(); };
    $$('[data-q]').forEach(function (b) {
      b.onclick = function () {
        var q = b.dataset.q, t = S.today || localToday();
        S.statsQuick = q;
        S.statsRange = q[0] === 'm' ? monthRange(Number(q.slice(1))) : { from: addDays(t, 1 - Number(q.slice(1))), to: t };
        showStats();
      };
    });
    $('#sXlsx').onclick = exportStats;
    api('stats', S.statsRange).then(function (res) { S.stats = res; drawStats(); })
      .catch(function (err) { if (err.error !== 'AUTH') { report(err); $('#sOut').innerHTML = '<div class="card empty">' + h(err.message) + '</div>'; } });
  }

  function rateBar(r) {
    return '<div class="rate"><div class="bar"><i style="width:' + r + '%"></i></div><span class="num">' + r + '%</span></div>';
  }

  function drawStats() {
    var s = S.stats;
    if (!s.days) { $('#sOut').innerHTML = '<div class="card empty">이 기간에 입력된 날이 없어요.</div>'; return; }
    var tot = { total: 0, working: 0, trip: 0, hq: 0, edu: 0, leave: 0 };
    s.daily.forEach(function (d) { for (var k in tot) tot[k] += d[k]; });
    var rate = pct(tot.working, tot.total);
    var dot = function (c) { return '<i style="width:8px;height:8px;border-radius:50%;background:' + c + ';display:inline-block"></i>'; };
    var html = '<div class="four">' +
      statCard('평균 출근율', rate, '%', '근무 ' + tot.working + ' / ' + tot.total + ' 인일', rate) +
      statCard('집계한 날', s.days, '일', '입력이 있는 날만 세요') +
      statCard(dot('var(--trip)') + '출장', tot.trip, '인일', '본사근무 ' + tot.hq + '인일') +
      statCard(dot('var(--leave)') + '휴가', tot.leave, '인일', '교육 ' + tot.edu + '인일') +
      '</div>';

    html += '<section class="card flush"><div class="card-h"><h2>부서별 출근율</h2><span class="note">인일 = 사람 수 × 날 수</span></div>' +
      s.depts.map(function (d, i) {
        var bits = CATS.filter(function (k) { return d[k.key]; }).map(function (k) { return k.label + ' ' + d[k.key]; });
        return (i && !d.level ? '<div class="divider"></div>' : '') +
          '<div class="row' + (d.level ? ' child' : ' group') + '"><div class="mid"><div class="t">' + h(d.name) + '</div>' +
          '<div class="d">평균 ' + (d.days ? (d.working / d.days).toFixed(1) : '-') + ' / ' + (d.days ? (d.total / d.days).toFixed(1) : '-') + '명' +
          (bits.length ? ' · ' + bits.join(' · ') : '') + '</div></div>' + rateBar(pct(d.working, d.total)) + '</div>';
      }).join('') + '</section>';

    html += '<div class="layout" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">' +
      '<section class="card flush"><div class="card-h"><h2>날짜별</h2><span class="note">누르면 그날로 가요</span></div>' +
      s.daily.slice().reverse().map(function (d) {
        return '<div class="row click" data-go="' + d.date + '"><div class="mid"><div class="t">' + fmtShort(d.date) + '</div>' +
          '<div class="d">협력사 ' + d.pworking + '/' + d.ptotal + ' · 입력 ' + d.entered + '/' + s.depts.length + '부서</div></div>' +
          '<div class="end"><b class="num">' + d.working + '</b><span class="num"> / ' + d.total + '</span><div style="font-size:13px;color:var(--g500)">' + pct(d.working, d.total) + '%</div></div>' + CHEV + '</div>';
      }).join('') + '</section>' +
      '<section class="card flush"><div class="card-h"><h2>사람별</h2><span class="note">누르면 날짜가 보여요</span></div>' +
      (s.people.length ? s.people.map(function (p, i) {
        return '<div class="row click" data-p="' + i + '"><div class="avatar sm">' + initial(p.name) + '</div><div class="mid"><div class="t">' + h(p.name) + '</div>' +
          '<div class="d">' + h(p.dept) + '</div></div><div class="end pills" style="margin:0;justify-content:flex-end">' +
          CATS.filter(function (k) { return p[k.key]; }).map(function (k) { return '<span class="pill ' + k.key + '">' + k.label + ' ' + p[k.key] + '</span>'; }).join('') +
          '</div></div><div class="pdates" hidden data-pd="' + i + '">' +
          p.dates.map(function (x) { return fmtShort(x.date) + ' ' + catLabel(x.cat) + (splitEntry(x.note).note ? ' · ' + h(splitEntry(x.note).note) : ''); }).join('<br>') + '</div>';
      }).join('') : '<div class="empty">출장·교육·휴가 기록이 없어요.</div>') +
      '</section></div>';

    $('#sOut').innerHTML = html;
    $$('[data-go]').forEach(function (r) { r.onclick = function () { S.date = r.dataset.go; S.tab = 'board'; render(); window.scrollTo(0, 0); }; });
    $$('[data-p]').forEach(function (r) {
      r.onclick = function () { var d = $('[data-pd="' + r.dataset.p + '"]'); d.hidden = !d.hidden; };
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
      return [p.name, p.dept, p.trip, p.hq, p.edu, p.leave, p.dates.map(function (x) { return x.date.slice(5) + ' ' + catLabel(x.cat); }).join(', ')];
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(d1), '부서별');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(d2), '일자별');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(d3), '인원별');
    XLSX.writeFile(wb, '근태통계_' + s.from + '_' + s.to + '.xlsx');
  }

  /* ---------- 관리 ---------- */

  function showAdmin() {
    var t = [['users', '계정'], ['depts', '부서'], ['partners', '협력사'], ['settings', '설정'], ['log', '기록']];
    $('#view').innerHTML = demoBanner() +
      '<div class="ph"><div><div class="sub">계정·부서·협력사를 관리해요</div><h1>관리</h1></div></div>' +
      '<div class="seg" style="margin-bottom:18px">' + t.map(function (x) {
        return '<button data-at="' + x[0] + '" class="' + (S.adminTab === x[0] ? 'on' : '') + '">' + x[1] + '</button>';
      }).join('') + '</div><div id="aOut"><div class="card empty">불러오는 중…</div></div>';
    $$('[data-at]').forEach(function (b) { b.onclick = function () { S.adminTab = b.dataset.at; showAdmin(); }; });
    if (S.adminTab === 'log') return loadLog();
    (S.admin ? Promise.resolve(null) : api('adminConfig')).then(function (res) {
      if (res) S.admin = res;
      ({ users: drawUsers, depts: function () { drawCfg('depts'); }, partners: function () { drawCfg('partners'); }, settings: drawSettings })[S.adminTab]();
    }).catch(function (err) { if (err.error !== 'AUTH') report(err); });
  }

  function setAdmin(res) { S.admin = res; S.settings = res.settings; S.board = null; }

  function scopeLabel(u) {
    if (u.role === 'admin') return '모든 부서';
    if (u.role === 'viewer') return '보기만 해요';
    var partners = S.admin.partners.filter(function (p) { return p.active; });
    var pIds = u.scope.filter(function (s) { return s.slice(0, 2) === 'p:'; });
    var names = [];
    u.scope.forEach(function (s) {
      if (s === '*') names.push('전체');
      else if (s === 'etc') names.push(S.settings.etcTitle);
      else if (s[0] === 'd') {
        var d = S.admin.depts.filter(function (x) { return 'd:' + x.id === s; })[0];
        if (d) names.push(d.name);
      }
    });
    if (pIds.length && pIds.length >= partners.length) names.push('협력사 전체');
    else if (pIds.length) names.push('협력사 ' + pIds.length + '곳');
    return names.join(', ') || '담당 없음';
  }

  var ROLE_BADGE = { admin: 'blue', editor: 'grey', viewer: 'grey' };

  function drawUsers() {
    var users = S.admin.users.slice().sort(function (a, b) {
      var o = { admin: 0, editor: 1, viewer: 2 };
      return (b.active - a.active) || (o[a.role] - o[b.role]) || a.name.localeCompare(b.name, 'ko');
    });
    $('#aOut').innerHTML = '<section class="card flush"><div class="card-h"><h2>계정 ' + users.length + '개</h2><span class="sp"></span>' +
      '<button class="btn primary sm" id="uAdd">+ 계정 추가</button></div>' +
      users.map(function (u) {
        return '<div class="row click" data-u="' + h(u.id) + '"' + (u.active ? '' : ' style="opacity:.5"') + '>' +
          '<div class="avatar">' + initial(u.name) + '</div><div class="mid"><div class="t">' + h(u.name) + ' <span class="badge ' + ROLE_BADGE[u.role] + '">' + h(u.roleLabel) + '</span>' +
          (u.id === S.user.id ? ' <span class="badge grey">나</span>' : '') +
          (!u.active ? ' <span class="badge red">사용 안 함</span>' : u.mustChange ? ' <span class="badge todo">PIN 변경 대기</span>' : '') + '</div>' +
          '<div class="d">' + h(scopeLabel(u)) + '</div></div>' + CHEV + '</div>';
      }).join('') + '</section>' +
      '<p class="hint" style="padding:0 8px">여러 명이 계정 하나를 같이 써도 돼요. 다만 기록에는 같은 이름으로 남아요.</p>';
    $('#uAdd').onclick = function () { editUser(null); };
    $$('[data-u]').forEach(function (r) {
      r.onclick = function () { editUser(S.admin.users.filter(function (u) { return u.id === r.dataset.u; })[0]); };
    });
  }

  function editUser(u) {
    var isNew = !u;
    u = u || { name: '', role: 'editor', scope: [], active: true };
    var depts = S.admin.depts.filter(function (d) { return d.active; });
    var partners = S.admin.partners.filter(function (p) { return p.active; });
    function cb(val, label) {
      return '<label class="cbx"><input type="checkbox" name="scope" value="' + h(val) + '"' + (u.scope.indexOf(val) >= 0 ? ' checked' : '') + '>' + h(label) + '</label>';
    }
    var body = '<form id="uForm" autocomplete="off">' +
      '<label class="field"><span>이름 (로그인할 때 쓰는 이름)</span><input type="text" class="inp" name="name" value="' + h(u.name) + '" maxlength="30" placeholder="예: 홍길동, 설계입력"></label>' +
      '<div class="field"><span>권한</span><div class="roles">' +
      [['admin', '관리자', '모두 입력 + 관리'], ['editor', '입력 담당', '맡은 곳만 입력'], ['viewer', '조회 전용', '보기만 가능']].map(function (r) {
        return '<label><input type="radio" name="role" value="' + r[0] + '"' + (u.role === r[0] ? ' checked' : '') + '><b>' + r[1] + '</b><span>' + r[2] + '</span></label>';
      }).join('') + '</div></div>' +
      '<div class="field" id="scopeWrap"><span>입력할 곳</span><div class="scope">' +
      '<h5>부서</h5><div class="grid2">' + depts.map(function (d) { return cb('d:' + d.id, d.name); }).join('') + '</div>' +
      '<h5>' + h(S.settings.partnerTitle) + ' <button type="button" class="tbtn" id="allP" style="font-size:13px;padding:2px 6px">전체 선택</button></h5><div class="grid2">' +
      partners.map(function (p) { return cb('p:' + p.id, p.name); }).join('') + '</div>' +
      '<h5>기타</h5>' + cb('etc', S.settings.etcTitle) + '</div></div>' +
      '<label class="field"><span>' + (isNew ? 'PIN (숫자 4~8자리)' : 'PIN 새로 정하기 (바꿀 때만)') + '</span>' +
      '<input type="text" class="inp" name="pin" inputmode="numeric" maxlength="8" style="letter-spacing:.3em;font-weight:700" placeholder="' + (isNew ? '예: 2580' : '비워 두면 그대로') + '"></label>' +
      '<label class="toggle"><span>첫 로그인 때 본인이 PIN 바꾸게 하기</span><input type="checkbox" name="mustChange"></label>' +
      (isNew ? '' : '<label class="toggle"><span>사용 (끄면 로그인 못 해요)</span><input type="checkbox" name="active"' + (u.active ? ' checked' : '') + '></label>') +
      (isNew || u.id === S.user.id ? '' : '<button type="button" class="tbtn" id="uDel" style="color:var(--red);margin:8px 0 0 -8px">계정 삭제</button>') +
      '<div class="err" id="uErr"></div></form>';
    var ov = openSheet(isNew ? '계정 추가' : h(u.name), isNew ? '' : h(u.roleLabel), body,
      '<button class="btn grey lg" data-close>취소</button><button class="btn primary lg" id="uSave">저장하기</button>', 'wide');
    var form = $('#uForm', ov);
    function syncRole() { $('#scopeWrap', ov).hidden = form.elements.role.value !== 'editor'; }
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
        setAdmin(res); closeSheet(); drawUsers();
        toast(payload.name + ' 계정을 저장했어요.' + (payload.pin ? ' PIN을 알려 주세요.' : ''));
      }).catch(function (err) { $('#uErr', ov).textContent = err.message; });
    };
    if ($('#uDel', ov)) $('#uDel', ov).onclick = function () {
      ask(u.name + ' 계정을 지울까요?', '지금까지 입력한 기록은 그대로 남아요.', '삭제하기', function () {
        api('deleteUser', { id: u.id }).then(function (res) { setAdmin(res); drawUsers(); toast('삭제했어요.'); }).catch(report);
      }, true);
    };
  }

  function drawCfg(kind) {
    var isD = kind === 'depts';
    var list = S.admin[kind];
    $('#aOut').innerHTML = '<section class="card flush"><div class="card-h"><h2>' + (isD ? '부서' : h(S.settings.partnerTitle)) + ' ' + list.length + '곳</h2><span class="sp"></span>' +
      '<button class="btn primary sm" id="cAdd">+ 추가</button></div>' +
      list.map(function (x, i) {
        return '<div class="row' + (isD && x.level ? ' child' : '') + '" data-id="' + h(x.id) + '"' + (x.active ? '' : ' style="opacity:.5"') + '>' +
          '<div class="ord"><button data-mv="-1"' + (i ? '' : ' disabled') + ' aria-label="위로">' + ICON.up + '</button><button data-mv="1"' + (i < list.length - 1 ? '' : ' disabled') + ' aria-label="아래로">' + ICON.down + '</button></div>' +
          '<div class="mid" data-edit style="cursor:pointer"><div class="t">' + h(x.name) + (x.active ? '' : ' <span class="badge red">사용 안 함</span>') + '</div>' +
          '<div class="d">기본 ' + x.total + '명' + (isD ? (x.level ? ' · 하위 부서' : ' · 상위 부서') : '') + '</div></div>' +
          '<button data-edit class="tbtn">수정</button></div>';
      }).join('') + '</section>' +
      '<p class="hint" style="padding:0 8px">기본 인원은 입력하지 않은 날에 쓰는 숫자예요. 없어진 곳은 지우지 말고 "사용"을 끄면 지난 기록은 남아요.</p>';
    $('#cAdd').onclick = function () { editCfg(kind, null); };
    $$('[data-edit]').forEach(function (el) {
      el.onclick = function () {
        var id = el.closest('.row').dataset.id;
        editCfg(kind, list.filter(function (x) { return x.id === id; })[0]);
      };
    });
    $$('[data-mv]').forEach(function (b) {
      b.onclick = function () {
        var id = b.closest('.row').dataset.id;
        var ids = list.map(function (x) { return x.id; });
        var i = ids.indexOf(id), j = i + Number(b.dataset.mv);
        ids[i] = ids[j]; ids[j] = id;
        api('reorder', { table: kind, ids: ids }).then(function (res) { setAdmin(res); drawCfg(kind); }).catch(report);
      };
    });
  }

  function editCfg(kind, x) {
    var isD = kind === 'depts', isNew = !x;
    x = x || { name: '', level: 1, total: 0, active: true };
    var body = '<label class="field"><span>' + (isD ? '부서명' : '업체명') + '</span><input type="text" class="inp" id="cName" maxlength="30" value="' + h(x.name) + '"></label>' +
      '<div class="totalrow"><b>기본 총인원</b><div class="stepper"><button type="button" id="cMinus">−</button><input type="number" id="cTotal" class="num" min="0" value="' + x.total + '"><button type="button" id="cPlus">+</button></div></div>' +
      (isD ? '<label class="toggle"><span>하위 부서 (현황표에서 들여쓰기)</span><input type="checkbox" id="cLevel"' + (x.level ? ' checked' : '') + '></label>' : '') +
      (isNew ? '' : '<label class="toggle"><span>사용</span><input type="checkbox" id="cActive"' + (x.active ? ' checked' : '') + '></label>') +
      '<div class="err" id="cErr"></div>';
    var ov = openSheet(isNew ? (isD ? '부서 추가' : '협력사 추가') : h(x.name), '', body,
      '<button class="btn grey lg" data-close>취소</button><button class="btn primary lg" id="cSave">저장하기</button>');
    var tot = $('#cTotal', ov);
    $('#cMinus', ov).onclick = function () { tot.value = Math.max(0, (Number(tot.value) || 0) - 1); };
    $('#cPlus', ov).onclick = function () { tot.value = (Number(tot.value) || 0) + 1; };
    $('#cSave', ov).onclick = function () {
      var payload = { id: isNew ? '' : x.id, name: $('#cName', ov).value.trim(), total: tot.value, active: isNew ? true : $('#cActive', ov).checked };
      if (isD) payload.level = $('#cLevel', ov).checked;
      api(isD ? 'saveDeptCfg' : 'savePartnerCfg', payload).then(function (res) {
        setAdmin(res); closeSheet(); drawCfg(kind); toast('저장했어요.');
      }).catch(function (err) { $('#cErr', ov).textContent = err.message; });
    };
  }

  function drawSettings() {
    var s = S.admin.settings;
    $('#aOut').innerHTML = '<section class="card" style="max-width:640px"><div class="card-h"><h2>설정</h2></div><form id="setForm">' +
      '<label class="field"><span>조직 이름</span><input type="text" class="inp" name="orgName" value="' + h(s.orgName) + '" maxlength="40"></label>' +
      '<label class="field"><span>협력사 제목</span><input type="text" class="inp" name="partnerTitle" value="' + h(s.partnerTitle) + '" maxlength="30"></label>' +
      '<label class="field"><span>협력사 설명</span><input type="text" class="inp" name="partnerNote" value="' + h(s.partnerNote) + '" maxlength="40"></label>' +
      '<label class="field"><span>기타 칸 제목</span><input type="text" class="inp" name="etcTitle" value="' + h(s.etcTitle) + '" maxlength="30"></label>' +
      '<label class="field"><span>입력 담당이 고칠 수 있는 지난 날짜 (일)</span><input type="number" class="inp" name="editDays" min="0" max="365" value="' + h(s.editDays) + '">' +
      '<div class="hint">7이면 7일 전까지만 고칠 수 있고, 그보다 이전은 관리자만 고쳐요.</div></label>' +
      '<button class="btn primary lg block">저장하기</button></form></section>';
    $('#setForm').onsubmit = function (e) {
      e.preventDefault();
      var f = e.target.elements;
      api('saveSettings', { orgName: f.orgName.value, partnerTitle: f.partnerTitle.value, partnerNote: f.partnerNote.value,
                            etcTitle: f.etcTitle.value, editDays: f.editDays.value })
        .then(function (res) { setAdmin(res); render(); toast('설정을 저장했어요.'); }).catch(report);
    };
  }

  function loadLog() {
    api('log', { limit: 300 }).then(function (res) {
      $('#aOut').innerHTML = '<section class="card flush"><div class="card-h"><h2>기록</h2><span class="note">최근 300건</span></div>' +
        (res.log.length ? res.log.map(function (l) {
          return '<div class="row"><div class="avatar sm">' + initial(l.user) + '</div><div class="mid"><div class="t" style="font-size:16px">' + h(l.user) + ' · ' + h(l.action) + '</div>' +
            (l.detail ? '<div class="d">' + h(l.detail) + '</div>' : '') + '</div><div class="end"><span class="num" style="font-size:13px">' + h(String(l.at).slice(5, 16)) + '</span></div></div>';
        }).join('') : '<div class="empty">기록이 없어요.</div>') + '</section>';
    }).catch(function (err) { if (err.error !== 'AUTH') report(err); });
  }

  /* ---------- 내 정보 ---------- */

  function showMe() {
    var u = S.user;
    $('#view').innerHTML = demoBanner() +
      '<div class="ph"><div><h1>내 정보</h1></div></div>' +
      '<section class="card" style="max-width:560px"><div style="display:flex;align-items:center;gap:14px">' +
      '<div class="avatar" style="width:56px;height:56px;font-size:22px">' + initial(u.name) + '</div>' +
      '<div><div style="font-size:20px;font-weight:800">' + h(u.name) + '</div><span class="badge ' + ROLE_BADGE[u.role] + '">' + h(u.roleLabel) + '</span></div></div></section>' +
      '<section class="card" style="max-width:560px"><div class="card-h"><h2>PIN 바꾸기</h2></div><form id="myPin">' + pinFields() +
      '<div class="err" id="myErr"></div><button class="btn primary lg block">바꾸기</button></form></section>' +
      '<section class="card flush" style="max-width:560px">' +
      '<div class="row click" id="meOut"><div class="mid"><div class="t">로그아웃</div></div>' + CHEV + '</div>' +
      (DEMO ? '<div class="row click" id="demoReset"><div class="mid"><div class="t" style="color:var(--red)">체험 데이터 지우기</div><div class="d">이 브라우저의 체험 데이터를 처음으로 되돌려요</div></div>' + CHEV + '</div>' : '') +
      '</section>';
    bindPinForm($('#myPin'), $('#myErr'), function () {});
    $('#meOut').onclick = function () { logout(); };
    if ($('#demoReset')) $('#demoReset').onclick = function () {
      ask('체험 데이터를 지울까요?', '이 브라우저에 저장된 체험 데이터를 모두 지우고 처음 상태로 돌아가요.', '지우기', function () {
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
