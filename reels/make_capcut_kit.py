"""캡컷용 글자 오버레이 키트: 그린스크린 MP4, 줄별 투명 PNG, SRT 자막, 미리보기 MP4."""
import os, subprocess, sys
from PIL import Image, ImageDraw, ImageFont
import imageio_ffmpeg

FONT_DIR, EMOJI, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
W, H, FPS, DUR = 1080, 1920, 30, 11.0
SLIDE = 0.22
GREEN = (0, 255, 0)
WHITE, INK, YELLOW = (255, 255, 255), (17, 17, 17), (255, 221, 51)

f = lambda w, s: ImageFont.truetype(os.path.join(FONT_DIR, f"Pretendard-{w}.otf"), s)
F_HEAD, F_ITEM, F_SUB, F_Q = f("ExtraBold", 72), f("Bold", 52), f("SemiBold", 42), f("ExtraBold", 58)

LEFT, TOP = 72, 215
# (등장 시점, 이름, 그리는 방식, 내용)
ITEMS = [
    (0.8, "언제든 먹을 준비 OK"),
    (1.6, "평일 식단, 주말 폭식"),
    (2.4, "밥 먹고 카페는 필수"),
    (3.2, "식후 바로 눕기"),
    (4.0, "밥 대신 과자·디저트"),
    (4.8, "잦은 야식과 다음날 속 더부룩함\n(맨날 후회함)"),
    (6.0, "이로 인해 수면질이 떨어져\n맨날 피곤함"),
    (7.2, None),  # 먹기 전 "오늘까지만"
]
QUESTION_T = 8.2
MAXX = [0]
NUM_W = 72  # 번호 칸 폭 (문구 시작 위치를 한 줄로 맞춤)


def canvas():
    return Image.new("RGBA", (W, H), (0, 0, 0, 0))


def label(d, x, y, text, font, fg, bg, pad=(22, 12), r=14):
    """인스타 텍스트 도구의 '배경 있는 글자' 스타일 박스."""
    l, t, rr, b = d.textbbox((0, 0), text, font=font)
    w, h = rr - l, font.size * 1.0
    d.rounded_rectangle((x, y, x + w + pad[0] * 2, y + h + pad[1] * 2), radius=r, fill=bg)
    d.text((x + pad[0], y + pad[1] + h / 2), text, font=font, fill=fg, anchor="lm")
    MAXX[0] = max(MAXX[0], x + w + pad[0] * 2)
    return x + w + pad[0] * 2, y + h + pad[1] * 2


def plain(d, x, y, text, font, fill=WHITE):
    d.text((x, y), text, font=font, fill=fill, stroke_width=4, stroke_fill=INK)
    MAXX[0] = max(MAXX[0], x + d.textlength(text, font=font))


layers = []  # (시점, 파일명, RGBA 이미지 전체 화면 크기, 자막 텍스트)
y = TOP
im = canvas(); d = ImageDraw.Draw(im)
_, y2 = label(d, LEFT, y, "절대 살 못 빼는", F_HEAD, INK, WHITE)
_, y3 = label(d, LEFT, y2 - 2, "사람 특징", F_HEAD, INK, YELLOW)
layers.append((0.0, "00_제목", im, "절대 살 못 빼는 사람 특징"))
y = y3 + 44

for i, (t, text) in enumerate(ITEMS, 1):
    im = canvas(); d = ImageDraw.Draw(im)
    num_y = y + 6 if text is None else y
    key = Image.open(os.path.join(os.path.dirname(EMOJI), f"key{i}.png")).convert("RGBA").resize((56, 56), Image.LANCZOS)
    im.alpha_composite(key, (LEFT, int(num_y + 6)))   # 번호: 1️⃣~8️⃣ 이모지
    TX = LEFT + NUM_W
    if text is None:
        plain(d, TX, y + 6, "먹기 전 ", F_ITEM)
        x = TX + d.textlength("먹기 전 ", font=F_ITEM)
        _, yb = label(d, x, y - 2, "\"오늘까지만\"", F_ITEM, INK, YELLOW, pad=(14, 8), r=10)
        cap, y = f'{i}\ufe0f\u20e3 먹기 전 "오늘까지만"', yb + 22
    else:
        main, *sub = text.split("\n")
        plain(d, TX, y, main, F_ITEM)
        y += 80
        for s in sub:
            plain(d, TX, y - 6, s, F_SUB, fill=(225, 225, 225))
            y += 60
        cap = f"{i}\ufe0f\u20e3 " + text.replace("\n", " ")
        y += 10
    layers.append((t, f"{i:02d}_항목{i}", im, cap))

y += 30
im = canvas(); d = ImageDraw.Draw(im)
q = "몇 개 해당돼요?"
qw = d.textlength(q, font=F_Q)
xe, yb = label(d, LEFT, y, q + "      ", F_Q, WHITE, INK, pad=(26, 16), r=18)
xe = LEFT + 26 + qw + 16 + 66 + 26  # 글자 + 간격 + 이모지 + 여백으로 박스 폭 재조정
im = canvas(); d = ImageDraw.Draw(im)
d.rounded_rectangle((LEFT, y, xe, yb), radius=18, fill=INK)
d.text((LEFT + 26, (y + yb) / 2), q, font=F_Q, fill=WHITE, anchor="lm")
emo = Image.open(EMOJI).convert("RGBA").resize((66, 66), Image.LANCZOS)
im.alpha_composite(emo, (int(LEFT + 26 + qw + 16), int((y + yb) / 2 - 33)))
layers.append((QUESTION_T, "09_질문", im, "몇 개 해당돼요? 👇"))
print(f"right edge={MAXX[0]:.0f}px  bottom={yb:.0f}px ({yb / H:.0%})")
assert MAXX[0] < W - 150 and yb < H * 0.75

# ---- 1) 줄별 투명 PNG (전체 화면 크기라 캡컷에서 꽉 채우기만 하면 위치가 맞음) ----
os.makedirs(f"{OUT}/png", exist_ok=True)
for t, name, im, _ in layers:
    im.save(f"{OUT}/png/{name}.png")

# ---- 2) SRT (캡컷 PC 자막 가져오기용, 줄이 쌓이는 형태) ----
def ts(s):
    ms = int(round(s * 1000)); return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"
with open(f"{OUT}/자막_캡컷PC용.srt", "w", encoding="utf-8") as fp:
    for k, (t, _, _, _) in enumerate(layers):
        end = layers[k + 1][0] if k + 1 < len(layers) else DUR
        body = "\n".join(c for _, _, _, c in layers[: k + 1])
        fp.write(f"{k + 1}\n{ts(t)} --> {ts(end)}\n{body}\n\n")

# ---- 3) 그린스크린 MP4 + 미리보기 ----
def ease(x):
    x = max(0.0, min(1.0, x)); return 1 - (1 - x) ** 3

def render(bg_fn, path):
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    p = subprocess.Popen([ff, "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                          "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "16",
                          "-pix_fmt", "yuv420p", "-movflags", "+faststart", path], stdin=subprocess.PIPE)
    for i in range(int(DUR * FPS)):
        t = i / FPS
        fr = bg_fn()
        for t0, _, im, _ in layers:
            if t >= t0:
                e = ease((t - t0) / SLIDE) if t0 > 0 else 1.0
                fr.alpha_composite(im, (0, int(-30 * (1 - e))))  # 위에서 살짝 내려오는 효과(투명도 변화 없음 → 크로마키 깔끔)
        p.stdin.write(fr.convert("RGB").tobytes())
    p.stdin.close(); p.wait()

render(lambda: Image.new("RGBA", (W, H), GREEN + (255,)), f"{OUT}/오버레이_그린스크린.mp4")
bg = Image.new("RGBA", (W, H), (0, 0, 0, 255))
for yy in range(H):  # 미리보기용 임시 배경
    c = int(70 + 60 * yy / H); ImageDraw.Draw(bg).line((0, yy, W, yy), fill=(c, c - 10, c - 25, 255))
render(lambda: bg.copy(), f"{OUT}/미리보기.mp4")
print("done")
