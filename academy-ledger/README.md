# 학원 통장장부

농협(NH스마트뱅킹) **거래내역조회 화면 캡처**를 올리면 AI가 거래를 읽어
기존 엑셀 장부와 같은 항목으로 분류하고, 월별 손익을 분석하는 웹앱입니다.
서버 없이 정적 파일만으로 동작합니다.

```
academy-ledger/
├─ index.html                          앱 전체 (HTML·CSS·JS 한 파일)
├─ vendor/anthropic-sdk-0.128.0.mjs    Anthropic 공식 SDK (브라우저용 번들)
├─ vendor/xlsx-0.18.5.full.min.js      엑셀 읽기/쓰기 (SheetJS)
└─ tools/excel_to_seed.py              엑셀 장부 → JSON 변환 (선택)
```

## 배포

폴더 전체(`index.html` + `vendor/`)를 정적 호스팅에 올리면 됩니다. HTTPS 주소여야 합니다.

- **GitHub Pages**: 저장소 Settings → Pages → 배포할 브랜치를 고르면
  `https://<아이디>.github.io/<저장소>/academy-ledger/` 에서 열립니다.
- **Netlify / Cloudflare Pages / Vercel**: `academy-ledger` 폴더를 끌어다 놓거나, 루트 디렉터리를 `academy-ledger`로 지정합니다.
- 로컬에서 확인: `cd academy-ledger && python3 -m http.server 8000` → http://localhost:8000
  (`file://`로 직접 열면 SDK를 불러오지 못합니다)

휴대폰에서 연 뒤 "홈 화면에 추가"를 하면 앱처럼 쓸 수 있습니다.

## 처음 설정

1. **설정 → 사진 읽기 AI**에서 Claude(Anthropic) 또는 Gemini(Google)를 고르고 API 키를 넣습니다.
   - Anthropic: https://console.anthropic.com → API Keys (기본 모델 `claude-opus-5`)
   - Gemini: https://aistudio.google.com → Get API key (연결할 때 쓸 수 있는 최신 Flash 모델을 자동으로 고릅니다)
   - "연결 확인"은 모델 목록만 불러와서 키를 확인하므로 사용료가 들지 않습니다.
2. **설정 → 장부 가져오기**에서 예전 수기 엑셀 장부(총괄 + `N월 출금` / `N월 입금` / `N월입출금` 시트)를 올리면
   거래, 재원생 수, 거래처 분류 규칙까지 가져옵니다. 이미 있는 거래는 건너뜁니다.
3. **캡처 올리기** 탭에서 캡처를 올리고 항목을 확인한 뒤 저장합니다.

## 데이터와 키는 어디에 있나요

- 장부와 API 키는 모두 **이 기기 브라우저의 localStorage**에만 저장됩니다. 서버로 보내지 않습니다.
- 캡처는 브라우저에서 **Anthropic 또는 Google API로 바로** 전송됩니다(긴 변 1800px JPEG로 줄여서 보냄).
- 휴대폰과 컴퓨터는 장부가 따로 저장됩니다. 기기를 옮기거나 브라우저 데이터를 지우기 전에는
  **설정 → 백업 파일 받기**로 JSON을 받아 두고, 다른 기기에서 **가져오기**로 불러오세요.

### 보안 주의

- 브라우저에 저장된 키는 그 기기를 쓰는 사람이 볼 수 있습니다. **다른 사람과 같이 쓰는 컴퓨터에는 저장하지 마세요.**
- 이 앱 전용 키를 새로 만들고, Anthropic Console / Google Cloud에서 **월 사용 한도**를 걸어 두세요.
- 여러 사람에게 공개하는 서비스라면 키를 브라우저에 두지 말고 서버(프록시)를 거쳐야 합니다. 이 구조는 본인·가족만 쓰는 개인용입니다.

## 분류 기준 (기존 엑셀 총괄표 그대로)

- 고정지출: 보안, 가맹비, 월세, 세무비, 관리비, 렌탈, 월급
- 변동지출: 세금, 재료비, 식대, 카페, 카드
- 기타비용: 기타
- 통장이동: 내 계좌 간 이체 → 수입·지출 합계에서 제외
- 입금: 수강료 / 기타수입 / 통장이동

## Claude 앱 안에서 열 때

같은 코드를 Claude Artifact로 열면 API 키 없이 Claude 앱의 기능으로 사진을 읽고,
장부는 Artifact 클라우드 저장소에 저장됩니다. 독립 사이트에서는 위의 개인 키 방식으로 동작합니다.
