#!/usr/bin/env python3
"""공공데이터포털 '통합식품영양성분정보' CSV → 사이트가 바로 검색하는 작은 파일(food-db/foods.tsv)

    python3 food-db/build-foods.py

- 입력: food-db/raw/*.csv (음식, 원재료성식품). 새 CSV를 받으면 raw/ 에 덮어쓰고 다시 실행하세요.
- 탄수화물 값이 비어 있는 항목(주로 프랜차이즈 메뉴)은 뺍니다. 이 계산기는 탄수화물이 핵심이라서요.
- 수산물 원재료는 산지·달별 표본이 많아 '평균' 값만 남깁니다 (평균이 없는 종은 그대로).
- 이름·업체가 같은 항목(출처마다 조사값이 조금씩 다름)은 열량이 중간인 것 하나로 합칩니다.
- 출력 한 줄: 이름 \t 업체 \t 분류 \t 100g당 탄수 \t 100g당 kcal \t 100g당 단백질 \t 1회 양(g) \t 종류(D=음식, R=원재료)
"""
import csv
import glob
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, 'raw')
OUT = os.path.join(HERE, 'foods.tsv')


def num(v):
    try:
        return float(str(v).replace(',', '').strip())
    except ValueError:
        return None


def grams(v):
    m = re.search(r'([\d.,]+)\s*(g|ml)', str(v or ''), re.I)
    return num(m.group(1)) if m else None


def fmt(n):
    s = ('%.1f' % n).rstrip('0').rstrip('.')
    return s or '0'


def clean(s):
    return re.sub(r'[\t\r\n]+', ' ', str(s or '')).strip()


rows = []
for path in sorted(glob.glob(os.path.join(RAW, '*.csv'))):
    with open(path, encoding='utf-8-sig', newline='') as f:
        rows += list(csv.DictReader(f))

# 수산물: 같은 대표식품에 '평균' 행이 있으면 그것만 남김
has_avg = {r['대표식품명'] for r in rows if r['식품코드'].startswith('R2') and '평균' in r['식품명']}

groups = {}
skipped_carb = 0
for r in rows:
    code = r['식품코드']
    kind = code[:1]
    if kind not in ('D', 'R'):
        continue
    if code.startswith('R2') and r['대표식품명'] in has_avg and '평균' not in r['식품명']:
        continue
    carb = num(r['탄수화물(g)'])
    kcal = num(r['에너지(kcal)'])
    if carb is None or kcal is None:
        skipped_carb += 1
        continue
    prot = num(r['단백질(g)']) or 0.0
    base = grams(r['영양성분함량기준량']) or 100.0
    carb, kcal, prot = carb * 100 / base, kcal * 100 / base, prot * 100 / base
    if carb > 100 or kcal > 950:
        continue
    unit = 100.0
    if kind == 'D':
        w = grams(r.get('식품중량'))
        if w and 0 < w <= 1500:
            unit = w
    maker = clean(r.get('업체명'))
    if maker in ('해당없음', '없음', '-'):
        maker = ''
    name = clean(r['식품명'])
    groups.setdefault((name, maker), []).append(
        (kcal, carb, prot, unit, clean(r['식품대분류명']).replace('해당없음', ''), kind))

out = []
for (name, maker), items in groups.items():
    items.sort(key=lambda x: x[0])
    kcal, carb, prot, _, group, kind = items[len(items) // 2]
    units = sorted(x[3] for x in items)
    unit = round(units[len(units) // 2])
    out.append('\t'.join([name, maker, group, fmt(carb), str(round(kcal)), fmt(prot), fmt(unit), kind]))

with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
    f.write('\n'.join(out) + '\n')

print(f'{len(out)}개 저장 → {os.path.relpath(OUT)} ({os.path.getsize(OUT) // 1024}KB), 탄수화물 없음으로 제외 {skipped_carb}개')
