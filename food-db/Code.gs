/**
 * 탄수화물 계산기 — 식약처 식품영양성분 DB 검색 서버 (Google Apps Script)
 *
 * 공공데이터포털의 "식품의약품안전처_식품영양성분DB정보" API를 대신 불러 주는 작은 서버예요.
 * API 키는 이 스크립트의 "스크립트 속성"에만 저장되고, 사이트(index.html)에는 드러나지 않아요.
 * 설치 방법은 food-db/README.md 를 보세요.
 *
 * 요청:  GET <웹 앱 주소>?q=짜장면
 * 응답:  { ok:true, items:[{ code, name, maker, group, per100, per100Cal, per100Protein, unit }] }
 *        per100·per100Cal·per100Protein = 100g(ml)당 탄수화물 g·열량 kcal·단백질 g
 *        unit = 1회 섭취 기준 중량 g (모르면 100)
 */

var API_URL = 'https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo03/getFoodNtrCpntDbInq03';
var ROWS = 100;                 // 한 번에 받아올 개수 (API 최대 100)
var MAX_PAGES = 3;              // 결과가 많으면 최대 300개까지 받아서 그중 잘 맞는 것을 골라요
var RETURN = 40;                // 사이트로 보내는 개수
var CACHE_SECONDS = 6 * 60 * 60; // 같은 검색어는 6시간 동안 다시 부르지 않아요 (하루 호출 한도 절약)

function doGet(e) {
  var q = String((e && e.parameter && e.parameter.q) || '').trim();
  if (!q || q.length > 40) return json_({ ok: false, error: 'query' });
  try {
    if (e.parameter.raw === '1') return json_({ ok: true, raw: callApi_(q, 3) });
    return json_({ ok: true, items: search_(q) });
  } catch (err) {
    var msg = String(err && err.message || err);
    return json_({ ok: false, error: /LIMITED|EXCEEDS|busy/i.test(msg) ? 'busy' : 'api', message: msg.slice(0, 300) });
  }
}

function search_(q) {
  var cache = CacheService.getScriptCache();
  var key = 'v2:' + Utilities.base64EncodeWebSafe(Utilities.newBlob(q).getBytes());
  var hit = cache.get(key);
  if (hit) return JSON.parse(hit);

  // 1쪽을 먼저 받고, 더 있으면 나머지 쪽은 동시에 받아요 (하나씩 받으면 느려서 사이트가 기다리다 포기해요)
  var first = callApi_(q, ROWS, 1);
  var raw = extractItems_(first);
  var total = num_(((first && first.body) || {}).totalCount);
  var pages = Math.min(MAX_PAGES, Math.ceil(total / ROWS) || 1);
  if (raw.length >= ROWS && pages > 1) {
    var urls = [];
    for (var page = 2; page <= pages; page++) urls.push(apiUrl_(q, ROWS, page));
    var responses = UrlFetchApp.fetchAll(urls.map(function (u) { return { url: u, muteHttpExceptions: true }; }));
    responses.forEach(function (res, i) {
      try {
        raw = raw.concat(extractItems_(parse_(res)));
      } catch (err) {
        // 뒤쪽 한 쪽이 실패하면 한 번만 다시 받아 보고, 그래도 안 되면 받은 것만으로 보여 줘요
        try { raw = raw.concat(extractItems_(fetchJson_(urls[i]))); } catch (err2) {}
      }
    });
  }
  var seen = {};
  var items = rank_(raw.map(normalize_).filter(function (it) {
    if (!it) return false;
    var k = it.name + '|' + it.maker + '|' + it.per100;
    if (seen[k]) return false;
    seen[k] = true;
    return true;
  }), q).slice(0, RETURN);
  var s = JSON.stringify(items);
  if (s.length < 90000) cache.put(key, s, CACHE_SECONDS);
  return items;
}

// 이름이 검색어와 같은 것 → 이름의 한 부분("갈비_떡갈비"의 "떡갈비")이 같은 것 → 검색어로 시작/끝나는 것 → 포함
// 같은 순위면 조리 음식(D) → 원재료(R) → 가공식품(P), 짧은 이름 순
function rank_(items, q) {
  var n = function (x) { return String(x).toLowerCase().replace(/\s+/g, ''); };
  var k = n(q);
  var score = function (it) {
    var name = n(it.name);
    var parts = String(it.name).toLowerCase().split(/[_,()\/\s]+/).filter(String);
    if (name === k) return 0;
    if (parts.indexOf(k) >= 0) return 1;
    if (name.indexOf(k) === 0 || parts.some(function (p) { return p.indexOf(k) === 0; })) return 2;
    if (parts.some(function (p) { return p.slice(-k.length) === k; })) return 3;
    return 4;
  };
  var kind = function (it) { var c = String(it.code).charAt(0); return c === 'D' ? 0 : c === 'R' ? 1 : 2; };
  return items.map(function (it, i) { return { it: it, s: score(it), t: kind(it), i: i }; })
    .sort(function (a, b) { return a.s - b.s || a.t - b.t || a.it.name.length - b.it.name.length || a.i - b.i; })
    .map(function (x) { return x.it; });
}

function apiUrl_(q, rows, page) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('MFDS_API_KEY');
  if (!apiKey) throw new Error('스크립트 속성 MFDS_API_KEY 가 비어 있어요');
  // 공공데이터포털은 "Encoding"·"Decoding" 키 두 가지를 줘요. 이미 인코딩된 키(%가 들어 있음)는 그대로 씁니다.
  var encodedKey = apiKey.indexOf('%') >= 0 ? apiKey : encodeURIComponent(apiKey);
  return API_URL
    + '?serviceKey=' + encodedKey
    + '&type=json&pageNo=' + (page || 1) + '&numOfRows=' + rows
    + '&FOOD_NM_KR=' + encodeURIComponent(q);
}

function callApi_(q, rows, page) {
  return fetchJson_(apiUrl_(q, rows, page));
}

// 식약처 서버가 가끔 잠깐 오류를 내요. 그럴 땐 0.7초 쉬고 한 번 더 받아요 (키 오류·한도 초과는 다시 해도 같아서 바로 알려요)
function fetchJson_(url) {
  try {
    return parse_(UrlFetchApp.fetch(url, { muteHttpExceptions: true }));
  } catch (err) {
    if (/SERVICE_KEY|LIMITED|EXCEEDS|MFDS_API_KEY/i.test(String(err && err.message))) throw err;
    Utilities.sleep(700);
    return parse_(UrlFetchApp.fetch(url, { muteHttpExceptions: true }));
  }
}

function parse_(res) {
  var text = res.getContentText('UTF-8');
  if (text.charAt(0) === '<') {
    // 키 오류·호출 한도 초과 같은 건 XML로 와요
    var m = text.match(/<returnAuthMsg>([^<]*)<\/returnAuthMsg>/) || text.match(/<resultMsg>([^<]*)<\/resultMsg>/);
    throw new Error(m ? m[1] : 'XML 응답 (HTTP ' + res.getResponseCode() + ')');
  }
  if (res.getResponseCode() !== 200) throw new Error('HTTP ' + res.getResponseCode() + ' ' + text.slice(0, 200));
  return JSON.parse(text);
}

// 응답 모양이 조금씩 달라도 항목 배열을 꺼내요
function extractItems_(data) {
  var body = (data && data.body) || (data && data.response && data.response.body) || {};
  var items = body.items;
  if (items && items.item) items = items.item;
  if (!items) return [];
  return Array.isArray(items) ? items : [items];
}

function num_(v) {
  if (v === null || v === undefined) return NaN;
  var n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? NaN : n;
}
function first_(obj, keys) {
  for (var i = 0; i < keys.length; i++) {
    var v = obj[keys[i]];
    if (v !== undefined && v !== null && String(v).trim() !== '' && String(v).trim() !== '-') return v;
  }
  return undefined;
}
// "100g", "100 ml", "1인분 250g", "10개(40g)" → 숫자 g (g·ml 바로 앞 숫자를 우선)
function grams_(v) {
  if (v === undefined) return NaN;
  var s = String(v);
  var withUnit = s.match(/[\d.,]+(?=\s*(g|ml|mg)\b)/gi) || s.match(/[\d.,]+(?=\s*(g|ml))/gi);
  if (withUnit) return num_(withUnit[0]);
  var m = s.match(/[\d.,]+/);
  return m ? num_(m[0]) : NaN;
}

function round1_(n) { return Math.round(n * 10) / 10; }

function normalize_(it) {
  var name = first_(it, ['FOOD_NM_KR', 'DESC_KOR', 'FOOD_NM']);
  if (!name) return null;
  // 영양성분 기준량 (보통 100g). NUTRI_AMOUNT_SERVING 은 "1회 섭취참고량"이라 기준량이 아니에요
  var base = grams_(first_(it, ['SERVING_SIZE', 'NUTR_CONT_STD_QTY']));
  if (!(base > 0)) base = 100;
  var carb = num_(first_(it, ['AMT_NUM6', 'NUTR_CONT2']));
  var kcal = num_(first_(it, ['AMT_NUM1', 'NUTR_CONT1']));
  var protein = num_(first_(it, ['AMT_NUM3', 'NUTR_CONT3']));
  if (isNaN(carb)) return null;
  if (isNaN(protein)) protein = 0;
  if (isNaN(kcal)) kcal = carb * 4 + protein * 4;
  // 한 번에 담을 양: 조리 음식(D)은 1인분 중량, 가공식품은 제품 한 개 중량(500g 이하일 때) → 아니면 1회 섭취참고량 → 100g
  var code = String(first_(it, ['FOOD_CD', 'NUM']) || name);
  var dish = grams_(first_(it, ['DISH_ONE_SERVING']));
  var weight = grams_(first_(it, ['Z10500', 'FOOD_WEIGHT', 'SERVING_WT']));
  var ref = grams_(first_(it, ['NUTRI_AMOUNT_SERVING']));
  var unit = 100;
  if (dish > 0 && dish <= 1500) unit = dish;
  else if (weight > 0 && weight <= (code.charAt(0) === 'D' ? 1500 : 500)) unit = weight;
  else if (ref > 0 && ref <= 1500) unit = ref;
  unit = round1_(unit);
  // 100g당 탄수화물이 100g을 넘거나 열량이 900kcal를 넘으면 기준량을 잘못 읽은 것이라 빼요
  if (carb * 100 / base > 100 || kcal * 100 / base > 950) return null;
  return {
    code: code,
    name: String(name).trim(),
    maker: String(first_(it, ['MAKER_NM', 'MFR_NM', 'BIZ_NM']) || '').trim().replace(/^(해당없음|없음)$/, ''),
    group: String(first_(it, ['FOOD_CAT1_NM', 'DB_CLASS_NM', 'DB_GRP_NM', 'GROUP_NAME']) || '').trim(),
    per100: round1_(carb * 100 / base),
    per100Cal: Math.round(kcal * 100 / base),
    per100Protein: round1_(protein * 100 / base),
    unit: unit
  };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ── 편집기에서 실행해 보는 함수 ── */

// 1) 키가 잘 들어갔는지, 검색이 되는지 확인 (실행 로그에 결과가 나와요)
function testSearch() {
  var items = search_('짜장면');
  Logger.log('결과 ' + items.length + '개');
  items.slice(0, 5).forEach(function (it) { Logger.log(JSON.stringify(it)); });
}

// 2) 결과가 이상하면 원본 응답을 확인 (필드 이름 점검용)
function testRaw() {
  Logger.log(JSON.stringify(extractItems_(callApi_('떡갈비', 1))[0]));
}

