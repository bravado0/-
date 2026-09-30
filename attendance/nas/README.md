# 사내 서버(시놀로지 NAS)용

구글 Apps Script + GitHub Pages 대신, 이 폴더의 `server.js` 하나로 근태현황을 사내 서버에서 돌립니다.
서버 로직은 `../core.js`를 그대로 쓰고, 데이터는 `DATA_DIR`의 JSON 파일에 저장합니다.

| 파일 | 하는 일 |
| --- | --- |
| `server.js` | 화면 파일 제공 + 서버 기능. `node nas/server.js` |
| `start.sh` | NAS 작업 스케줄러(부트업)에서 서버를 켜는 스크립트 |

- 구글에서 옮기기: Apps Script 편집기에서 `exportForNas` 실행 → 받은 JSON을 `node nas/server.js --import <파일>`
- 관리자 PIN 초기화: 서버를 끄고 `node nas/server.js --reset-admin` 후 다시 켜기
- 자동 사본: `DATA_DIR/backups/날짜/` (30일치)
- 설치 안내서는 관리자에게 받은 문서를 따르세요.
