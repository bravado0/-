# 수업 시간표 (Apps Script)

구글 시트에 붙어 있는 Apps Script 웹앱의 코드 보관본입니다. 여기 파일을 고친 뒤 Apps Script 편집기에 붙여 넣어야 실제 시간표에 반영됩니다.

| 파일 | 붙여 넣을 곳 |
|---|---|
| `Code.gs` | Apps Script 편집기의 `Code.gs` |
| `Index.html` | Apps Script 편집기의 `Index` |

붙여 넣을 주소
- https://raw.githubusercontent.com/bravado0/-/main/timetable/Code.gs
- https://raw.githubusercontent.com/bravado0/-/main/timetable/Index.html

붙여 넣은 뒤: **배포 → 배포 관리 → 연필 → 버전: 새 버전 → 배포** ("새 배포"는 주소가 바뀌므로 하지 않기)

## 스크립트 속성 (프로젝트 설정 → 스크립트 속성)

| 속성 | 값 |
|---|---|
| `EDIT_PIN` | 편집 PIN (없으면 0000) |
| `GEMINI_API_KEY` | `AIza`로 시작하는 구글 Gemini 키 (aistudio.google.com, 무료). "알림장 쓰기"에 사용 |
| `ANTHROPIC_API_KEY` | `sk-ant-`로 시작하는 Claude 키 (유료). 둘 다 있으면 이쪽을 씀 |
| `GEMINI_MODEL` | (선택) Gemini 모델 고정. 없으면 최신 Flash를 자동으로 고름 |

무료 Gemini 키로 보낸 사진·글은 구글 약관상 서비스 개선에 쓰일 수 있습니다.

## 알림장 쓰기

반 카드 아래 **✏️ 알림장 쓰기** → 사진(최대 6장)·키워드·아이별 메모 → 아이마다 알림장 초안 → [복사] → 클래스노트 알림장에 붙여 넣기.
결석 아이는 체크가 빠져 있고, 말투 예시는 한 번 넣어 두면 시트(`meta/notestyle`)에 저장돼 계속 쓰입니다.
편집 PIN이 맞아야 쓸 수 있습니다 (AI 사용료가 들기 때문).
