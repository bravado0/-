# 근태현황 (attendance/) 작업 규칙

## 사용자와 정한 진행 방식
- **디자인(화면 모양) 변경**: 먼저 예시 화면(스크린샷)을 보여 주고, 확인받은 뒤에 main에 올린다.
- **그 밖의 변경**(속도, 버그 수정, 기능 동작, 서버 로직): 묻지 말고 바로 main에 올리고, 무엇을 바꿨는지만 알린다.
- 사용자는 개발자가 아니다. 설명은 쉬운 말로, 단계별로 한다.

## 올리는 방법
- 작업 브랜치에서 커밋 → PR 생성 → 바로 merge. GitHub Pages가 main을 1~2분 안에 배포한다.
- 사용자에게는 반영 후 **Ctrl + F5**로 새로고침하라고 안내한다.

## 서버(Apps Script) 코드
- `core.js` 또는 `apps-script/sheets-env.js`를 바꾸면 `./tools/build-gs.sh`로 `apps-script/Code.gs`를 다시 만든다.
- 이 경우 사용자가 직접 Apps Script에 Code.gs를 다시 붙여 넣고
  **배포 → 배포 관리 → 연필 → 버전: 새 버전 → 배포**를 해야 한다 ("새 배포"는 주소가 바뀌므로 금지).
  붙여 넣을 주소: https://raw.githubusercontent.com/bravado0/-/main/attendance/apps-script/Code.gs
- 화면 코드는 옛 서버에서도 깨지지 않게 만든다 (새 기능은 서버가 지원할 때만 보이게).

## 확인
- 서버 로직: Node로 `core.js`를 직접 불러 테스트. Apps Script는 가짜 SpreadsheetApp/CacheService로 흉내 내 확인.
- 화면: `config.js`의 `apiUrl`을 비운 사본을 띄워 체험 모드로 Playwright 확인 (scratchpad에서).
