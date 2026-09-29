/* 손익 양식 변환 로직. 브라우저(app.html)와 node(verify.js)에서 같이 쓴다. */
(function (root) {
  'use strict';

  // 원본(프로젝트 원가) 파일에서 구간을 나누는 제목 행들
  const HEADERS = ['제품', '총원가', '영업원가', '매출원가', '직접비', '자재비', '원자재비', '구입자재비',
    '부자재비', '노무비', '직접경비', '생산간접비', '영업비', '원가비용', '영업이익', '공헌이익', '매출이익'];
  const norm = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();
  const HSET = new Set(HEADERS.map(norm));

  function num(v) {
    if (v == null || v === '') return 0;
    if (typeof v === 'number') return v;
    let s = String(v).replace(/[,\s]/g, '');
    if (s === '' || s === '-') return 0;
    const neg = /^\(.*\)$/.test(s);
    if (neg) s = s.slice(1, -1);
    const n = Number(s);
    return isFinite(n) ? (neg ? -n : n) : 0;
  }

  const colIndex = col => [...col].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

  // 항상 A1부터 읽는다. (A열이 비어 있으면 SheetJS가 B열부터 세기 때문)
  function rowsOf(XLSX, ws) {
    if (!ws || !ws['!ref']) return [];
    const r = XLSX.utils.decode_range(ws['!ref']);
    r.s.r = 0; r.s.c = 0;
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true,
      range: XLSX.utils.encode_range(r) });
  }

  function firstSheet(wb) { return wb.Sheets[wb.SheetNames[0]]; }

  /** 파일 종류 알아내기: raw(프로젝트 원가) / ledger(계정별 원장) / wip(재공품) */
  function classify(XLSX, wb, fileName) {
    const rows = rowsOf(XLSX, firstSheet(wb));
    const a1 = norm(rows[0] && rows[0][0]);
    const b1 = norm(rows[0] && rows[0][1]);
    if (a1 === norm('공종명')) return 'raw';
    if (b1 === norm('원가구분') || /재공품/.test(fileName)) return 'wip';
    if (wb.SheetNames.some(n => /원장/.test(n)) || /원장/.test(fileName)) return 'ledger';
    return null;
  }

  function parseRaw(XLSX, wb) {
    const ws = firstSheet(wb);
    const rows = rowsOf(XLSX, ws);
    const list = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i] || [];
      if (r[0] == null || String(r[0]).trim() === '') continue;
      list.push({ name: String(r[0]).trim(), n: norm(r[0]), row: r, excelRow: i + 1 });
    }
    // 구간 나누기. 제목과 같은 이름의 하위 항목(예: 부자재비 > 부자재비)은 항목으로 본다.
    const sections = {};
    let cur = null;
    list.forEach((it, i) => {
      if (HSET.has(it.n) && it.n !== cur) {
        if (!sections[it.n]) sections[it.n] = { head: i, items: [] };
        cur = it.n;
      } else if (cur) {
        sections[cur].items.push(i);
      }
    });
    const cell = addr => {
      const c = ws[addr];
      return c ? c.v : null;
    };
    const project = String(cell('B2') || '').trim();
    return { list, sections, cell, project };
  }

  function rawValue(raw, key, parent, col) {
    const ci = colIndex(col);
    const k = norm(key);
    const val = it => num(it.row[ci]);
    if (HSET.has(k)) {
      const s = raw.sections[k];
      return s ? val(raw.list[s.head]) : 0;
    }
    const p = raw.sections[norm(parent)];
    const pool = p ? p.items.map(i => raw.list[i]) : raw.list;
    return pool.filter(it => it.n === k).reduce((a, it) => a + val(it), 0);
  }

  function ledgerValue(XLSX, wb, step, project) {
    const ws = wb.Sheets[step.sheet] || firstSheet(wb);
    const rows = rowsOf(XLSX, ws);
    const kc = colIndex(step.keyCol), vc = colIndex(step.valCol);
    let sum = 0;
    for (let i = step.firstRow - 1; i < rows.length; i++) {
      const r = rows[i] || [];
      if (norm(r[kc]) === norm(project)) sum += num(r[vc]);
    }
    return sum;
  }

  function wipRows(XLSX, wb) { return rowsOf(XLSX, firstSheet(wb)); }

  function wipValue(rows, step) {
    if (step.key == null) return 0;
    const kc = colIndex(step.keyCol);
    for (let i = step.r1 - 1; i < Math.min(step.r2, rows.length); i++) {
      const r = rows[i] || [];
      if (norm(r[kc]) === norm(step.key)) return num(r[step.valCol - 1]);
    }
    return 0;
  }

  function wipMatch(rows, step) {
    if (step.key == null) return null;
    const kc = colIndex(step.keyCol);
    for (let i = 0; i < rows.length; i++) {
      if (norm((rows[i] || [])[kc]) === norm(step.key)) return i + 1;
    }
    return null;
  }

  /** 계획(plan)대로 칸마다 들어갈 값을 계산한다. */
  function computeCells(XLSX, plan, raw, ledgerWb, wipWb) {
    const values = {};
    const wrows = wipWb ? wipRows(XLSX, wipWb) : null;
    for (const step of plan) {
      const div = step.div || 1;
      let v = null;
      switch (step.t) {
        case 'clear': v = null; break;
        case 'project': v = raw.project; break;
        case 'rawcell': {
          const c = raw.cell(step.addr);
          v = step.div ? num(c) / div : (c == null ? null : String(c));
          break;
        }
        case 'raw':
          v = step.keys.reduce((a, k) => a + rawValue(raw, k, step.parent, step.col), 0) / div;
          break;
        case 'ledger': v = ledgerWb ? ledgerValue(XLSX, ledgerWb, step, raw.project) / div : 0; break;
        case 'wip': v = wrows ? wipValue(wrows, step) / div : 0; break;
        case 'wipmatch': v = wrows ? wipMatch(wrows, step) : null; break;
        default: throw new Error('모르는 계획 종류: ' + step.t);
      }
      if (typeof v === 'number') v = Math.round(v * 1e6) / 1e6;
      values[step.ref] = v;
    }
    return values;
  }

  /** 요약표와 검증 결과(원본의 합계와 비교) */
  function summarize(plan, raw, values) {
    const sum = (key, col) => rawValue(raw, key, null, col) / 1000;
    const find = key => plan.find(p => p.t === 'raw' && p.keys.length === 1 && norm(p.keys[0]) === norm(key) && p.col === 'C');
    const pair = key => {
      const e = find(key);
      const f = e && plan.find(p => p.t === 'raw' && p.ref.slice(1) === e.ref.slice(1) && p.col !== 'C');
      return [e ? values[e.ref] : 0, f ? values[f.ref] : 0];
    };
    const sales = [values.E5 || 0, values.F5 || 0];
    const mat = ['원자재비', '구입자재비', '부자재비'].map(pair).reduce((a, b) => [a[0] + b[0], a[1] + b[1]], [0, 0]);
    const labor = pair('노무비'), direct = pair('직접경비'), indirect = pair('생산간접비');
    const cogs = [0, 1].map(i => mat[i] + labor[i] + direct[i] + indirect[i]);
    const actualCol = (plan.find(p => p.t === 'raw' && p.col !== 'C') || { col: 'E' }).col;
    const close = (a, b) => Math.abs(a - b) < 0.0015;
    const checks = [
      ['자재비 합계 = 원본 자재비 (계획)', close(mat[0], sum('자재비', 'C'))],
      ['자재비 합계 = 원본 자재비 (실적)', close(mat[1], sum('자재비', actualCol))],
      ['매출원가 합계 = 원본 매출원가 (계획)', close(cogs[0], sum('매출원가', 'C'))],
      ['매출원가 합계 = 원본 매출원가 (실적)', close(cogs[1], sum('매출원가', actualCol))],
    ];
    return {
      rows: [
        ['매출액', sales], ['자재비', mat], ['노무비', labor], ['직접경비', direct],
        ['생산간접비', indirect], ['매출원가', cogs], ['매출이익', [sales[0] - cogs[0], sales[1] - cogs[1]]],
      ],
      checks,
    };
  }

  /** 원본에는 있는데 양식에 줄이 없는 항목(금액이 있는 것만) */
  function unmapped(plan, raw) {
    const byParent = {};
    for (const p of plan) {
      if (p.t !== 'raw' || !p.parent) continue;
      const k = norm(p.parent);
      (byParent[k] = byParent[k] || new Set());
      p.keys.forEach(x => byParent[k].add(norm(x)));
    }
    const ac = colIndex((plan.find(p => p.t === 'raw' && p.col !== 'C') || { col: 'E' }).col);
    const out = [];
    for (const [sec, keys] of Object.entries(byParent)) {
      const s = raw.sections[sec];
      if (!s) continue;
      for (const i of s.items) {
        const it = raw.list[i];
        if (keys.has(it.n)) continue;
        const c = num(it.row[2]), e = num(it.row[ac]);
        if (c === 0 && e === 0) continue;
        out.push({ section: raw.list[s.head].name, name: it.name, plan: c / 1000, actual: e / 1000 });
      }
    }
    return out;
  }

  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function setCell(xml, ref, value) {
    const re = new RegExp('<c r="' + ref + '"([^>]*?)(?:/>|>[\\s\\S]*?</c>)');
    const m = xml.match(re);
    if (!m) throw new Error('양식에서 칸을 찾지 못했습니다: ' + ref);
    const attrs = m[1].replace(/\st="[^"]*"/, '');
    let cell;
    if (value == null || value === '') cell = '<c r="' + ref + '"' + attrs + '/>';
    else if (typeof value === 'number') cell = '<c r="' + ref + '"' + attrs + '><v>' + value + '</v></c>';
    else cell = '<c r="' + ref + '"' + attrs + ' t="inlineStr"><is><t xml:space="preserve">' + esc(value) + '</t></is></c>';
    return xml.replace(re, () => cell);
  }

  /** 양식(xlsx 바이트)에 값을 채워 새 xlsx 바이트를 돌려준다. */
  function fillTemplate(XLSX, templateBytes, values) {
    const cfb = XLSX.CFB.read(templateBytes, { type: 'array' });
    const path = '/xl/worksheets/sheet1.xml';
    const entry = XLSX.CFB.find(cfb, path);
    let xml = new TextDecoder('utf-8').decode(entry.content);
    for (const [ref, v] of Object.entries(values)) xml = setCell(xml, ref, v);
    entry.content = new TextEncoder().encode(xml);
    entry.size = entry.content.length;
    return XLSX.CFB.write(cfb, { type: 'array', fileType: 'zip', compression: true });
  }

  function zipFiles(XLSX, files) {
    const cfb = XLSX.CFB.utils.cfb_new();
    for (const f of files) XLSX.CFB.utils.cfb_add(cfb, '/' + f.name, f.bytes);
    return XLSX.CFB.write(cfb, { type: 'array', fileType: 'zip', compression: true });
  }

  function convert(XLSX, plan, templateBytes, rawWb, ledgerWb, wipWb) {
    const raw = parseRaw(XLSX, rawWb);
    if (!raw.project) throw new Error('원본 B2 칸에서 프로젝트 번호를 찾지 못했습니다');
    const values = computeCells(XLSX, plan, raw, ledgerWb, wipWb);
    return {
      project: raw.project,
      bytes: fillTemplate(XLSX, templateBytes, values),
      summary: summarize(plan, raw, values),
      unmapped: unmapped(plan, raw),
      values,
    };
  }

  const api = { classify, parseRaw, computeCells, convert, zipFiles, num, norm };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PLCore = api;
})(typeof self !== 'undefined' ? self : this);
