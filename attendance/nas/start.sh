#!/bin/sh
# 근태현황 서버 시작 (시놀로지 작업 스케줄러 "부트업"에서 root로 실행)
#   sh /volume1/attendance/app/nas/start.sh
# 바꿀 수 있는 값 : PORT(기본 8080), DATA_DIR(기본 /volume1/attendance/data)
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-8080}"
DATA_DIR="${DATA_DIR:-/volume1/attendance/data}"
export PORT DATA_DIR TZ=Asia/Seoul

# 시놀로지 Node.js 패키지 위치를 찾음
NODE="$(command -v node 2>/dev/null)"
[ -z "$NODE" ] && NODE="$(ls /var/packages/Node.js_v*/target/usr/local/bin/node 2>/dev/null | sort | tail -1)"
[ -z "$NODE" ] && NODE="/usr/local/bin/node"

mkdir -p "$DATA_DIR"
# 이미 돌고 있으면 끄고 다시 켬
# node 프로세스만 (이 이름이 들어간 다른 명령 줄까지 끄지 않게)
pkill -f "^[^ ]*node [^ ]*/nas/[s]erver[.]js" 2>/dev/null
sleep 1
cd "$APP_DIR" || exit 1
nohup "$NODE" "$APP_DIR/nas/server.js" >> "$DATA_DIR/server.log" 2>&1 &
echo "근태현황 서버 시작: 포트 $PORT, 데이터 $DATA_DIR, node $NODE"
