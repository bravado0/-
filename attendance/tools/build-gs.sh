#!/bin/sh
# core.js + apps-script/sheets-env.js → apps-script/Code.gs (Apps Script 편집기에 통째로 붙여 넣는 파일)
cd "$(dirname "$0")/.." || exit 1
{
  echo '// 이 파일은 tools/build-gs.sh 로 만들어집니다. 직접 고치지 말고 core.js / apps-script/sheets-env.js 를 고친 뒤 다시 만드세요.'
  echo
  grep -v '^if (typeof module' core.js
  echo
  cat apps-script/sheets-env.js
} > apps-script/Code.gs
echo "apps-script/Code.gs 생성 ($(wc -l < apps-script/Code.gs)줄)"
