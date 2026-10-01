/**
 * 수업 시간표 — 구글 시트에 저장하는 웹앱
 * 데이터는 이 스프레드시트의 "_앱데이터" 시트에 저장돼요. 그 시트는 직접 고치지 마세요.
 */

// 수정할 때 쓰는 PIN. 프로젝트 설정(톱니바퀴) → 스크립트 속성에 EDIT_PIN 으로 넣어 두세요.
// 넣지 않으면 0000 이에요. (PIN을 코드에 적지 않으니 코드를 새로 붙여 넣어도 PIN이 그대로 유지돼요)
const EDIT_PIN = PropertiesService.getScriptProperties().getProperty('EDIT_PIN') || '0000';

const DATA_SHEET = '_앱데이터';

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('수업 시간표')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

function getVersion() {
  return PropertiesService.getScriptProperties().getProperty('ver') || '0';
}

function getAll() {
  const sh = sheet_();
  const n = sh.getLastRow();
  const docs = {};
  if (n > 1) {
    sh.getRange(2, 1, n - 1, 2).getValues().forEach(function (r) {
      if (!r[0]) return;
      try { docs[r[0]] = JSON.parse(r[1]); } catch (e) {}
    });
  }
  return { docs: docs, ver: getVersion(), pinRequired: !!EDIT_PIN, noteKey: hasNoteKey() };
}

function checkPin(pin) {
  return !EDIT_PIN || String(pin) === String(EDIT_PIN);
}

function setDoc(path, json, pin) {
  guard_(pin, path);
  JSON.parse(json);
  return locked_(function (sh) {
    const row = findRow_(sh, path);
    if (row) sh.getRange(row, 2, 1, 2).setValues([[json, new Date()]]);
    else sh.appendRow([path, json, new Date()]);
  });
}

function deleteDoc(path, pin) {
  guard_(pin, path);
  return locked_(function (sh) {
    const row = findRow_(sh, path);
    if (row) sh.deleteRow(row);
  });
}

/* ---------- 알림장 쓰기 (AI) ---------- */
// 프로젝트 설정(톱니바퀴) → 스크립트 속성에 둘 중 하나를 넣으면 동작해요.
//   GEMINI_API_KEY    : 구글 Gemini 키 (AQ. 로 시작, 무료로 받을 수 있어요)
//   ANTHROPIC_API_KEY : Claude 키 (sk-ant-로 시작, 유료)
// 둘 다 있으면 Claude를 써요. Gemini 모델은 GEMINI_MODEL 속성으로 정할 수 있고, 없으면 최신 Flash-Lite(무료 한도가 가장 넉넉)를 골라요.
const NOTE_MODEL = 'claude-opus-5-5';

function noteProvider_() {
  const p = PropertiesService.getScriptProperties();
  if (p.getProperty('ANTHROPIC_API_KEY')) return 'anthropic';
  if (p.getProperty('GEMINI_API_KEY')) return 'gemini';
  return '';
}

function hasNoteKey() {
  return !!noteProvider_();
}

// req = { klass: '목 10/1 16:10-17:00 5세', topic: '키워드', photos: ['base64 jpeg', ...],
//         students: [{ id, name, status, memo }], style: '예전 알림장 글' }
function writeNotes(req, pin) {
  if (!checkPin(pin)) throw new Error('PIN이 맞지 않아요');
  const provider = noteProvider_();
  if (!provider) throw new Error('AI 키가 아직 설정되지 않았어요');
  const students = (req.students || []).slice(0, 30);
  if (!students.length) throw new Error('아이를 한 명 이상 골라 주세요');
  const photos = (req.photos || []).slice(0, 6);

  const STATUS = { makeup: '보강으로 온 아이', new: '이번 주 처음 온 신규', trial: '체험 수업으로 온 아이' };
  const lines = students.map(function (s) {
    return '- id=' + s.id + ' / ' + s.name + (STATUS[s.status] ? ' (' + STATUS[s.status] + ')' : '') +
      (s.memo ? ' / 선생님 메모: ' + s.memo : '');
  });
  const style = String(req.style || '').trim();

  const system = [
    '당신은 어린이 미술학원 선생님을 대신해 학부모에게 보내는 "알림장" 글을 씁니다.',
    '글은 선생님이 학부모 앱(클래스노트) 알림장에 그대로 붙여 넣어 아이별로 보냅니다.',
    '',
    '쓰는 법:',
    '- 아이마다 한 편씩 씁니다. 오늘 수업에서 무엇을 했는지(주제, 재료, 기법)를 사진과 키워드를 바탕으로 따뜻하고 구체적으로 설명합니다.',
    '- 선생님 메모가 있는 아이는 그 내용을 자연스럽게 한두 문장으로 녹입니다. 메모가 없으면 그 아이에 대한 구체적인 행동이나 작품 내용을 지어내지 않습니다.',
    '- 사진에서 확실히 보이지 않는 것은 단정하지 않습니다.',
    '- 아이 이름은 "OO이는", "OO는"처럼 자연스럽게 부릅니다(받침에 맞춰).',
    '- 보강·신규·체험 아이는 그 상황에 맞게 한마디를 더할 수 있습니다(예: 체험이면 와 줘서 반가웠다는 인사).',
    '- 반 아이들 글의 수업 설명 부분은 내용이 같아도 되지만, 문장은 조금씩 다르게 써서 복사한 티가 나지 않게 합니다.',
    '- 길이는 4~7문장 정도. 이모지는 예시 글에 있으면 비슷하게, 없으면 쓰지 않습니다.',
    style ? '\n아래는 이 선생님이 실제로 보냈던 알림장입니다. 말투, 길이, 인사말, 끝맺음, 이모지 쓰는 습관을 그대로 따라 하세요.\n<예시>\n' + style + '\n</예시>' : '- 말투는 다정하고 공손한 존댓말(해요체)로 씁니다.'
  ].join('\n');

  const text = '수업: ' + (req.klass || '') + '\n' +
    '오늘 수업 키워드: ' + (String(req.topic || '').trim() || '(없음 — 사진을 보고 판단)') + '\n' +
    (photos.length ? '함께 보낸 사진 ' + photos.length + '장은 오늘 수업 사진입니다.\n' : '사진은 없습니다.\n') +
    '\n알림장을 쓸 아이들:\n' + lines.join('\n');

  const out = provider === 'gemini' ? notesGemini_(system, text, photos) : notesClaude_(system, text, photos);
  return { notes: (out && out.notes) || [] };
}

const NOTES_SCHEMA_ = {
  type: 'object',
  properties: {
    notes: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, text: { type: 'string' } },
        required: ['id', 'text'],
        additionalProperties: false
      }
    }
  },
  required: ['notes'],
  additionalProperties: false
};

function notesClaude_(system, text, photos) {
  const key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  const content = photos.map(function (b64) {
    return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } };
  });
  content.push({ type: 'text', text: text });
  const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'server-side-fallback-2026-07-01'
    },
    payload: JSON.stringify({
      model: NOTE_MODEL,
      max_tokens: 16000,
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: NOTES_SCHEMA_ } },
      system: system,
      messages: [{ role: 'user', content: content }]
    }),
    muteHttpExceptions: true
  });
  const code = res.getResponseCode();
  let data;
  try { data = JSON.parse(res.getContentText()); } catch (e) { data = {}; }
  if (code !== 200) {
    const msg = (data.error && data.error.message) || ('HTTP ' + code);
    console.error('writeNotes ' + code + ': ' + msg);
    if (code === 401) throw new Error('AI 키가 올바르지 않아요');
    if (code === 429 || code === 529 || code >= 500) throw new Error('AI가 지금 바빠요. 잠시 후 다시 눌러 주세요');
    throw new Error('AI 요청이 실패했어요 (' + code + ')');
  }
  if (data.stop_reason === 'refusal') throw new Error('AI가 이 요청은 쓰지 않겠다고 했어요. 키워드를 바꿔 다시 해 주세요');
  if (data.stop_reason === 'max_tokens') throw new Error('글이 너무 길어 끊겼어요. 아이 수를 줄여 다시 해 주세요');
  const block = (data.content || []).filter(function (b) { return b.type === 'text'; }).pop();
  if (!block) throw new Error('AI 답을 읽지 못했어요');
  return JSON.parse(block.text);
}

function gemini_(path, body) {
  const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  const opt = { method: body ? 'post' : 'get', headers: { 'x-goog-api-key': key }, muteHttpExceptions: true };
  if (body) { opt.contentType = 'application/json'; opt.payload = JSON.stringify(body); }
  const res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/' + path, opt);
  const code = res.getResponseCode();
  let data;
  try { data = JSON.parse(res.getContentText()); } catch (e) { data = {}; }
  if (code !== 200) {
    const msg = (data.error && data.error.message) || ('HTTP ' + code);
    console.error('gemini ' + code + ': ' + msg);
    if (code === 401 || code === 403 || (code === 400 && /API key|API_KEY/i.test(msg))) throw new Error('AI 키가 올바르지 않아요');
    if (code === 429) throw new Error('무료 한도를 넘었거나 요청이 많아요. 잠시 후 다시 눌러 주세요');
    if (code >= 500) throw new Error('AI가 지금 바빠요. 잠시 후 다시 눌러 주세요');
    const e = new Error('AI 요청이 실패했어요 (' + code + ')'); e.status = code; throw e;
  }
  return data;
}

// 쓸 수 있는 최신 Flash-Lite 모델 (하루 동안 기억)
function geminiModel_(fresh) {
  const p = PropertiesService.getScriptProperties();
  const fixed = p.getProperty('GEMINI_MODEL');
  if (fixed) return fixed;
  const cached = p.getProperty('_geminiLite');
  if (!fresh && cached && cached.split('|')[1] > Date.now() - 864e5) return cached.split('|')[0];
  let pick = 'gemini-2.5-flash-lite';
  try {
    const list = (gemini_('models?pageSize=200').models || [])
      .filter(function (m) { return (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0; })
      .map(function (m) { return m.name.replace(/^models\//, ''); })
      .filter(function (n) { return /^gemini/.test(n) && !/embedding|tts|image|live|audio|native|robotics|preview|exp/.test(n) && /flash-lite$/.test(n); });
    const ver = function (n) { return parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0); };
    if (list.length) pick = list.sort(function (a, b) { return ver(b) - ver(a); })[0];
  } catch (e) {}
  p.setProperty('_geminiLite', pick + '|' + Date.now());
  return pick;
}

function notesGemini_(system, text, photos) {
  const parts = photos.map(function (b64) { return { inlineData: { mimeType: 'image/jpeg', data: b64 } }; });
  parts.push({ text: text + '\n\n답은 JSON 하나로만: {"notes":[{"id":"아이 id","text":"알림장 글"}, ...]} — 위 아이들 모두, id는 그대로.' });
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: parts }],
    generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 16000 }
  };
  let data;
  try {
    data = gemini_('models/' + encodeURIComponent(geminiModel_()) + ':generateContent', body);
  } catch (e) {
    if (e.status !== 404) throw e;
    data = gemini_('models/' + encodeURIComponent(geminiModel_(true)) + ':generateContent', body);
  }
  const cand = data.candidates && data.candidates[0];
  if (!cand) throw new Error('AI가 이 요청에 답하지 않았어요. 키워드나 사진을 바꿔 다시 해 주세요');
  if (cand.finishReason === 'MAX_TOKENS') throw new Error('글이 너무 길어 끊겼어요. 아이 수를 줄여 다시 해 주세요');
  const t = ((cand.content && cand.content.parts) || []).map(function (x) { return x.text || ''; }).join('');
  if (!t) throw new Error('AI가 답하지 않았어요 (' + (cand.finishReason || '이유 없음') + ')');
  try { return JSON.parse(t); } catch (e) {}
  const m = t.match(/\{[\s\S]*\}/);
  if (m) return JSON.parse(m[0]);
  throw new Error('AI 답을 읽지 못했어요');
}

/* ---------- 매주 금요일 새 주차 자동 만들기 ---------- */
// 처음 한 번만: 위쪽 함수 목록에서 setupAutoWeek 를 고르고 [실행] → 권한 허용
function setupAutoWeek() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'autoCreateNextWeek') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('autoCreateNextWeek').timeBased()
    .onWeekDay(ScriptApp.WeekDay.FRIDAY).atHour(18).inTimezone('Asia/Seoul').create();
  return '매주 금요일 오후 6시쯤 다음 주 시간표가 자동으로 만들어져요';
}

function autoCreateNextWeek() {
  const docs = getAll().docs;
  const weeks = Object.keys(docs).filter(function (p) { return p.indexOf('weeks/') === 0; })
    .map(function (p) { const w = docs[p]; w.id = p.slice(6); w._s = weekStart_(w); return w; })
    .filter(function (w) { return w._s; });
  const today = seoulToday_();
  const target = addDays_(mondayOf_(today), 7);
  if (weeks.some(function (w) { return iso_(w._s) === iso_(target); })) return '이미 있어요';
  const src = weeks.filter(function (w) { return w._s <= today; })
    .sort(function (a, b) { return b._s - a._s; })[0];
  if (!src) return '복사할 주차가 없어요';
  const teachers = (docs['meta/config'] && docs['meta/config'].teachers) || [];
  const wid = 'w' + Date.now().toString(36);
  const order = weeks.reduce(function (m, w) { return Math.max(m, w.order || 0); }, 0) + 1;
  const rid = function () { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3); };
  locked_(function (sh) {
    sh.appendRow(['weeks/' + wid, JSON.stringify({ label: labelFor_(target), start: iso_(target), order: order, memo: '', createdAt: Date.now(), auto: true }), new Date()]);
    teachers.forEach(function (t) {
      const from = docs['sheets/' + src.id + '__' + t.id];
      const slots = ((from && from.slots) || []).map(function (s) {
        const c = JSON.parse(JSON.stringify(s)); c.id = rid();
        c.students = (s.students || []).filter(function (st) { return st.status !== 'makeup'; }).map(function (st) {
          return { id: rid(), name: st.name, note: st.note || '', status: (st.status === 'absent' || st.status === 'new') ? 'normal' : (st.status || 'normal') };
        });
        return c;
      });
      sh.appendRow(['sheets/' + wid + '__' + t.id, JSON.stringify({ weekId: wid, teacherId: t.id, slots: slots }), new Date()]);
    });
  });
  return labelFor_(target) + ' 만들었어요';
}

function seoulToday_() {
  const p = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd').split('-');
  return new Date(+p[0], +p[1] - 1, +p[2]);
}
function addDays_(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
function mondayOf_(d) { return addDays_(d, -((d.getDay() + 6) % 7)); }
function iso_(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
function labelFor_(mon) { const th = addDays_(mon, 3); return (th.getMonth() + 1) + '월 ' + (Math.floor((th.getDate() - 1) / 7) + 1) + '주'; }
function weekStart_(w) {
  const m = String(w.start || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  const l = String(w.label || '').match(/(\d+)월\s*(\d+)주/);
  if (!l) return null;
  const t = seoulToday_(); let best = null;
  [t.getFullYear() - 1, t.getFullYear(), t.getFullYear() + 1].forEach(function (y) {
    const f = new Date(y, +l[1] - 1, 1), thu = addDays_(f, (4 - f.getDay() + 7) % 7), mon = addDays_(thu, 7 * (+l[2] - 1) - 3);
    if (!best || Math.abs(mon - t) < Math.abs(best - t)) best = mon;
  });
  return best;
}

/* ---------- 내부 함수 ---------- */
function guard_(pin, path) {
  if (!checkPin(pin)) throw new Error('PIN이 맞지 않아요');
  if (!/^(meta|weeks|sheets)\/[A-Za-z0-9_\-]+$/.test(path)) throw new Error('잘못된 경로예요');
}

function locked_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    fn(sheet_());
    return bump_();
  } finally {
    lock.releaseLock();
  }
}

function bump_() {
  const v = Date.now() + '-' + Math.floor(Math.random() * 1e6);
  PropertiesService.getScriptProperties().setProperty('ver', v);
  return v;
}

function findRow_(sh, path) {
  const n = sh.getLastRow();
  if (n < 2) return 0;
  const hit = sh.getRange(2, 1, n - 1, 1).createTextFinder(path).matchEntireCell(true).findNext();
  return hit ? hit.getRow() : 0;
}

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(DATA_SHEET);
  if (!sh) {
    sh = ss.insertSheet(DATA_SHEET);
    sh.getRange(1, 1, 1, 3).setValues([['path', 'json', 'updatedAt']]);
    bump_();
  }
  return sh;
}

// 코드 끝 (이 줄이 보이면 끝까지 잘 붙여넣은 거예요)
