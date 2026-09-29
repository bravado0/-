#!/usr/bin/env python3
"""손익 양식 변환기 빌드 스크립트.

완성된 손익 양식 파일(외부 파일을 참조하는 수식이 들어 있는 xlsx) 하나를 받아서
  1) 외부 연결·작성자·경로·캐시값을 걷어낸 빈 양식(template)을 만들고
  2) 외부 참조 수식을 해석해 "어느 칸에 무엇을 채울지" 계획(plan)을 뽑은 뒤
  3) app.html + core.js + SheetJS + 양식 + 계획을 합쳐 인터넷 없이 여는 HTML 한 파일을 만든다.

사용법:
  python3 build.py <완성본.xlsx> [출력.html]

양식 파일에는 회사 자료가 들어 있으므로 결과 HTML은 저장소에 올리지 않는다(.gitignore).
"""
import base64
import io
import json
import re
import sys
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
SHEET = "xl/worksheets/sheet1.xml"

# 양식 맨 위의 "행 찾기" 보조 칸들. 변환기가 구간을 직접 찾으므로 필요 없다.
CLEAR_CELLS = {"D1", "E1", "D2", "E2", "F2", "D3", "E3"}

CELL_RE = re.compile(r'<c r="([A-Z]+)(\d+)"([^>]*?)(?:/>|>(.*?)</c>)', re.S)


def col_idx(col):
    n = 0
    for ch in col:
        n = n * 26 + ord(ch) - 64
    return n


def unescape(s):
    return (s.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"')
             .replace("&apos;", "'").replace("&amp;", "&"))


def read_shared_strings(z):
    xml = z.read("xl/sharedStrings.xml").decode("utf-8")
    out = []
    for si in re.findall(r"<si>(.*?)</si>", xml, re.S):
        out.append(unescape("".join(re.findall(r"<t[^>]*>(.*?)</t>", si, re.S))))
    return xml, out


def parse_cells(sheet_xml, sst):
    cells = {}
    for m in CELL_RE.finditer(sheet_xml):
        col, row, attrs, inner = m.group(1), int(m.group(2)), m.group(3), m.group(4) or ""
        f = re.search(r"<f[^>]*>(.*?)</f>", inner, re.S)
        v = re.search(r"<v[^>]*>(.*?)</v>", inner, re.S)
        text = None
        if not f and v and 't="s"' in attrs:
            text = sst[int(v.group(1))]
        cells[f"{col}{row}"] = {
            "col": col, "row": row, "attrs": attrs,
            "formula": unescape(f.group(1)) if f else None,
            "shared_child": bool(re.search(r"<f[^>]*/>", inner)),
            "text": text,
        }
    return cells


def label_of(cells, ref):
    c = cells.get(ref.replace("$", ""))
    if not c or c["formula"] is not None or c["shared_child"]:
        return None
    return c["text"]


def row_label(cells, row):
    for col in "BCD":
        t = label_of(cells, f"{col}{row}")
        if t and t.strip():
            return col, t
    return None, None


def parent_label(cells, row, level_col, top_row):
    """row 의 라벨이 level_col(B/C/D)에 있을 때, 바로 위 단계 라벨을 찾는다."""
    if level_col == "B":
        return None
    want = chr(ord(level_col) - 1)
    for r in range(row - 1, top_row - 1, -1):
        col, text = row_label(cells, r)
        if col == want:
            return text
        if col and col < want:
            return None
    return None


RAW_TERM = re.compile(
    r'SUMPRODUCT\(\(\[1\]Sheet!\$A\$\d+:\$A\$\d+=(\$?[A-Z]+\$?\d+|"[^"]*")\)'
    r'\*\(\[1\]Sheet!\$([A-Z])\$\d+:\$[A-Z]\$\d+\)\)')
LEDGER = re.compile(
    r"SUMPRODUCT\(\('\[4\]([^']+)'!\$([A-Z])\$(\d+):\$[A-Z]\$\d+=(\$?[A-Z]+\$?\d+)\)"
    r"\*\('\[4\][^']+'!\$([A-Z])\$\d+:\$[A-Z]\$\d+\)\)/1000$")
WIP = re.compile(
    r"IFERROR\(VLOOKUP\((\$?[A-Z]+\$?\d+),\[3\]Sheet!\$([A-Z])\$(\d+):\$[A-Z]\$(\d+),(\d+),0\),\)/1000$")
WIP_MATCH = re.compile(r"MATCH\((\$?[A-Z]+\$?\d+),\[3\]Sheet!\$([A-Z]):\$[A-Z],0\)$")


def build_plan(cells):
    plan = []
    for ref, c in sorted(cells.items(), key=lambda kv: (kv[1]["row"], col_idx(kv[1]["col"]))):
        if ref in CLEAR_CELLS:
            plan.append({"ref": ref, "t": "clear"})
            continue
        f = c["formula"]
        if ref == "D4":
            plan.append({"ref": ref, "t": "project"})
            continue
        if f is None or "[" not in f:
            continue
        if c["shared_child"]:
            raise SystemExit(f"{ref}: 외부 참조 공유수식은 처리하지 못합니다")

        if f == "+[2]Sheet!A2":
            plan.append({"ref": ref, "t": "rawcell", "addr": "A2"})
        elif re.fullmatch(r"\[1\]Sheet!\$C\$2/1000", f):
            plan.append({"ref": ref, "t": "rawcell", "addr": "C2", "div": 1000})
        elif (m := LEDGER.match(f)):
            sheet, key_col, first_row, key_ref, val_col = m.groups()
            if key_ref.replace("$", "") != "D4":
                raise SystemExit(f"{ref}: 매출 원장 조회 기준이 D4가 아닙니다: {f}")
            plan.append({"ref": ref, "t": "ledger", "sheet": sheet, "keyCol": key_col,
                         "valCol": val_col, "firstRow": int(first_row), "div": 1000})
        elif (m := WIP.match(f)):
            key_ref, key_col, r1, r2, idx = m.groups()
            plan.append({"ref": ref, "t": "wip", "key": label_of(cells, key_ref),
                         "keyCol": key_col, "r1": int(r1), "r2": int(r2),
                         "valCol": col_idx(key_col) + int(idx) - 1, "div": 1000})
        elif (m := WIP_MATCH.match(f)):
            plan.append({"ref": ref, "t": "wipmatch", "key": label_of(cells, m.group(1)),
                         "keyCol": m.group(2)})
        elif "[1]Sheet!" in f and "SUMPRODUCT" in f:
            terms = RAW_TERM.findall(f)
            rest = RAW_TERM.sub("", f)
            if not terms or not re.fullmatch(r"(/1000\+?)+", rest):
                raise SystemExit(f"{ref}: 해석하지 못한 수식: {f}")
            cols = {col for _, col in terms}
            if len(cols) != 1:
                raise SystemExit(f"{ref}: 한 칸에 여러 열을 섞은 수식: {f}")
            keys = []
            for key, _ in terms:
                keys.append(key[1:-1] if key.startswith('"') else label_of(cells, key))
            level_col, own = row_label(cells, c["row"])
            plan.append({"ref": ref, "t": "raw", "col": cols.pop(), "keys": keys,
                         "parent": parent_label(cells, c["row"], level_col, 5), "div": 1000})
        else:
            raise SystemExit(f"{ref}: 해석하지 못한 외부 참조 수식: {f}")

    # 같은 행의 계획/실적은 같은 항목을 봐야 한다. (예: 계획에만 "Outlet Damper"가 더해진 칸)
    by_row = {}
    for p in plan:
        if p["t"] == "raw":
            by_row.setdefault(int(re.sub(r"\D", "", p["ref"])), []).append(p)
    for row_plans in by_row.values():
        union = []
        for p in row_plans:
            for k in p["keys"]:
                if k not in union:
                    union.append(k)
        for p in row_plans:
            p["keys"] = union
    return plan


def rewrite_sheet(sheet_xml, plan_refs):
    def repl(m):
        col, row, attrs, inner = m.group(1), m.group(2), m.group(3), m.group(4) or ""
        ref = f"{col}{row}"
        style = re.search(r'\ss="\d+"', attrs)
        style = style.group(0) if style else ""
        if ref in plan_refs:
            return f'<c r="{ref}"{style}/>'
        if "<f" in inner:
            # 내부 수식은 그대로 두고 캐시값만 지운다. 엑셀이 열 때 다시 계산한다.
            inner = re.sub(r"<v[^>]*>.*?</v>|<v/>", "", inner, flags=re.S)
            attrs = re.sub(r'\st="(str|b|e|n)"', "", attrs)
            return f'<c r="{ref}"{attrs}>{inner}</c>'
        if re.search(r"<v>", inner) and 't="s"' not in attrs:
            raise SystemExit(f"{ref}: 양식에 숫자가 직접 입력된 칸이 있습니다 — 확인 필요")
        return m.group(0)

    out = CELL_RE.sub(repl, sheet_xml)
    out = re.sub(r'<sheetView ([^>]*?)topLeftCell="[^"]*"', r"<sheetView \1", out)
    out = re.sub(r'<selection [^>]*/>', '<selection activeCell="A1" sqref="A1"/>', out)
    return out


def sanitize(src_bytes, plan_refs, sst_xml, sst, project_label):
    zin = zipfile.ZipFile(io.BytesIO(src_bytes))
    buf = io.BytesIO()
    zout = zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED)
    names = zin.namelist()
    order = ["[Content_Types].xml"] + [n for n in names if n != "[Content_Types].xml"]
    for name in order:
        if name.startswith("xl/externalLinks/") or name == "xl/calcChain.xml":
            continue
        data = zin.read(name).decode("utf-8") if name.endswith((".xml", ".rels")) else zin.read(name)
        if name == "[Content_Types].xml":
            data = re.sub(r'<Override PartName="/xl/(externalLinks/[^"]+|calcChain\.xml)"[^>]*/>', "", data)
        elif name == "xl/_rels/workbook.xml.rels":
            data = re.sub(r'<Relationship [^>]*Type="[^"]*/(externalLink|calcChain)"[^>]*/>', "", data)
        elif name == "xl/workbook.xml":
            data = re.sub(r"<externalReferences>.*?</externalReferences>", "", data, flags=re.S)
            data = re.sub(r"<mc:AlternateContent[^>]*>.*?absPath.*?</mc:AlternateContent>", "", data, flags=re.S)
            data = re.sub(r"<definedName[^>]*>[^<]*\[\d+\][^<]*</definedName>", "", data)
            data = re.sub(r"<calcPr([^>]*?)/>", lambda m: "<calcPr" + re.sub(r'\sfullCalcOnLoad="\d"', "", m.group(1)) + ' fullCalcOnLoad="1"/>', data)
        elif name == "docProps/core.xml":
            data = re.sub(r"<dc:creator>.*?</dc:creator>", "<dc:creator></dc:creator>", data)
            data = re.sub(r"<cp:lastModifiedBy>.*?</cp:lastModifiedBy>", "<cp:lastModifiedBy></cp:lastModifiedBy>", data)
        elif name == "docProps/app.xml":
            data = re.sub(r"<Company>.*?</Company>", "<Company></Company>", data)
        elif name == SHEET:
            data = rewrite_sheet(data, plan_refs)
        elif name == "xl/sharedStrings.xml":
            # 양식에 박혀 있던 프로젝트 번호는 지운다(매번 원본에서 채움).
            data = data.replace(f"<t>{project_label}</t>", "<t></t>")
        zout.writestr(name, data)
    zout.close()
    return buf.getvalue()


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    src = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else HERE / "dist" / "손익양식변환기.html"
    src_bytes = src.read_bytes()
    z = zipfile.ZipFile(io.BytesIO(src_bytes))
    names = z.namelist()
    if SHEET not in names or "xl/worksheets/sheet2.xml" in names:
        raise SystemExit("시트가 하나인 양식만 지원합니다")
    sst_xml, sst = read_shared_strings(z)
    cells = parse_cells(z.read(SHEET).decode("utf-8"), sst)
    plan = build_plan(cells)
    project_label = cells["D4"]["text"]
    template = sanitize(src_bytes, {p["ref"] for p in plan}, sst_xml, sst, project_label)

    html = (HERE / "app.html").read_text(encoding="utf-8")
    core = (HERE / "core.js").read_text(encoding="utf-8")
    xlsx_lib = (HERE.parent / "academy-ledger" / "vendor" / "xlsx-0.18.5.full.min.js").read_text(encoding="utf-8")
    html = (html.replace("/*__XLSX_LIB__*/", xlsx_lib.replace("</script", "<\\/script"))
                .replace("/*__CORE__*/", core)
                .replace("__TEMPLATE_B64__", base64.b64encode(template).decode())
                .replace("/*__PLAN__*/null", json.dumps(plan, ensure_ascii=False)))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    (out.parent / "template.xlsx").write_bytes(template)
    (out.parent / "plan.json").write_text(json.dumps(plan, ensure_ascii=False, indent=1), encoding="utf-8")
    kinds = {}
    for p in plan:
        kinds[p["t"]] = kinds.get(p["t"], 0) + 1
    print(f"완료: {out}  ({len(html) // 1024} KB)  채울 칸: {kinds}")


if __name__ == "__main__":
    main()
