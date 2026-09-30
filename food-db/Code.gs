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

var API_URL = 'https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02';
var ROWS = 40;                  // 한 번에 받아올 개수
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
  var key = 'q:' + Utilities.base64EncodeWebSafe(Utilities.newBlob(q).getBytes());
  var hit = cache.get(key);
  if (hit) return JSON.parse(hit);

  var items = extractItems_(callApi_(q, ROWS)).map(normalize_).filter(function (it) { return it; });
  var s = JSON.stringify(items);
  if (s.length < 90000) cache.put(key, s, CACHE_SECONDS);
  return items;
}

function callApi_(q, rows) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('MFDS_API_KEY');
  if (!apiKey) throw new Error('스크립트 속성 MFDS_API_KEY 가 비어 있어요');
  // 공공데이터포털은 "Encoding"·"Decoding" 키 두 가지를 줘요. 이미 인코딩된 키(%가 들어 있음)는 그대로 씁니다.
  var encodedKey = apiKey.indexOf('%') >= 0 ? apiKey : encodeURIComponent(apiKey);
  var url = API_URL
    + '?serviceKey=' + encodedKey
    + '&type=json&pageNo=1&numOfRows=' + rows
    + '&FOOD_NM_KR=' + encodeURIComponent(q);
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
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
// "100g", "100 ml", "1인분 250g" → 숫자 g
function grams_(v) {
  if (v === undefined) return NaN;
  var m = String(v).match(/([\d.,]+)\s*(g|ml|mL|ML|G)?/);
  return m ? num_(m[1]) : NaN;
}

function round1_(n) { return Math.round(n * 10) / 10; }

function normalize_(it) {
  var name = first_(it, ['FOOD_NM_KR', 'DESC_KOR', 'FOOD_NM']);
  if (!name) return null;
  // 영양성분 기준량 (보통 100g)
  var base = grams_(first_(it, ['NUTR_CONT_STD_QTY', 'NUTRI_AMOUNT_SERVING', 'SERVING_SIZE']));
  if (!(base > 0)) base = 100;
  var carb = num_(first_(it, ['AMT_NUM6', 'NUTR_CONT2']));
  var kcal = num_(first_(it, ['AMT_NUM1', 'NUTR_CONT1']));
  var protein = num_(first_(it, ['AMT_NUM3', 'NUTR_CONT3']));
  if (isNaN(carb)) return null;
  if (isNaN(protein)) protein = 0;
  if (isNaN(kcal)) kcal = carb * 4 + protein * 4;
  // 1회 섭취 기준 중량 (식품중량). 너무 크면(대용량 포장) 100g으로 둬요
  var weight = grams_(first_(it, ['Z10500', 'FOOD_WEIGHT', 'SERVING_WT']));
  var unit = weight > 0 && weight <= 1500 ? round1_(weight) : 100;
  return {
    code: String(first_(it, ['FOOD_CD', 'NUM']) || name),
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
  Logger.log(JSON.stringify(callApi_('바나나', 1)).slice(0, 4000));
}

