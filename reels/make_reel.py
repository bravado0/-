"""인스타 릴스: '절대 살 못 빼는 사람 특징' 텍스트 누적 영상 (1080x1920, 30fps, 11초)."""
import math, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import imageio_ffmpeg

W, H, FPS, DUR = 1080, 1920, 30, 11.0
FONT = sys.argv[1]            # Pretendard-Black.otf
EMOJI = sys.argv[2]           # 👇 PNG
OUT = sys.argv[3]

WHITE, BLACK = (255, 255, 255), (0, 0, 0)
YELLOW = (255, 214, 0)
PINK = (255, 92, 138)

HEADER = ["절대 살 못 빼는", "사람 특징"]
# (등장 시점, [(텍스트, 색)...])  - 한 항목이 두 줄이면 리스트의 리스트
ITEMS = [
    (0.8, [[("언제든 먹을 준비 OK", WHITE)]]),
    (1.6, [[("평일 식단, 주말 폭식", WHITE)]]),
    (2.4, [[("밥 먹고 카페는 필수", WHITE)]]),
    (3.2, [[("식후 바로 눕기", WHITE)]]),
    (4.0, [[("밥 대신 과자·디저트", WHITE)]]),
    (4.8, [[("잦은 야식과 다음날 속 더부룩함", WHITE)], [("(맨날 후회함)", WHITE)]]),
    (6.0, [[("이로 인해 수면질이 떨어져", WHITE)], [("맨날 피곤함", WHITE)]]),
    (7.2, [[("먹기 전 ", WHITE), ("\"오늘까지만\"", YELLOW)]]),
]
QUESTION_T = 8.2
SLIDE = 0.28   # 등장 애니메이션 길이

LEFT = 72
TOP = 190
F_HEAD = ImageFont.truetype(FONT, 92)
F_ITEM = ImageFont.truetype(FONT, 54)
F_SUB = ImageFont.truetype(FONT, 44)
F_NUM = ImageFont.truetype(FONT, 40)
F_Q = ImageFont.truetype(FONT, 64)
STROKE = 7


def ease_out(x):
    x = max(0.0, min(1.0, x))
    return 1 - (1 - x) ** 3


MAXX = [0]
def draw_runs(d, x, y, runs, font, stroke=STROKE):
    for text, color in runs:
        d.text((x, y), text, font=font, fill=color, stroke_width=stroke, stroke_fill=BLACK)
        x += d.textlength(text, font=font)
    MAXX[0] = max(MAXX[0], x)
    return x


def make_layer(draw_fn, h):
    img = Image.new("RGBA", (W, h), (0, 0, 0, 0))
    draw_fn(ImageDraw.Draw(img))
    # 살짝 그림자로 가독성 보강
    shadow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    a = img.split()[3].filter(ImageFilter.GaussianBlur(8))
    shadow.putalpha(a.point(lambda v: int(v * 0.55)))
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    out.alpha_composite(shadow, (0, 6))
    out.alpha_composite(img)
    return out


# ---- 레이어 미리 렌더 ----
layers = []  # (t, image, y)
y = TOP
head_h = 108
def header(d):
    for i, line in enumerate(HEADER):
        d.text((LEFT, 10 + i * head_h), line, font=F_HEAD, fill=YELLOW if i == 1 else WHITE,
               stroke_width=9, stroke_fill=BLACK)
hdr = make_layer(header, head_h * 2 + 40)
layers.append((0.0, hdr, y))
y += head_h * 2 + 40

for n, (t, lines) in enumerate(ITEMS, 1):
    lh_main, lh_sub = 70, 56
    h = lh_main + (len(lines) - 1) * lh_sub + 14
    def item(d, lines=lines, n=n):
        # 번호 배지
        cx, cy, r = LEFT + 24, 12 + 35, 25
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=PINK, outline=BLACK, width=4)
        d.text((cx, cy), str(n), font=F_NUM, fill=WHITE, anchor="mm")
        tx = LEFT + 66
        draw_runs(d, tx, 10, lines[0], F_ITEM)
        for j, runs in enumerate(lines[1:]):
            draw_runs(d, tx, 10 + lh_main + j * lh_sub, runs, F_SUB)
    layers.append((t, make_layer(item, h + 20), y))
    y += h

# 질문 박스
y += 20
emoji = Image.open(EMOJI).convert("RGBA").resize((78, 78), Image.LANCZOS)
q_text = "몇 개 해당돼요?"
def question(d):
    tw = d.textlength(q_text, font=F_Q)
    bw, bh = tw + 48 + 96, 108
    d.rounded_rectangle((LEFT, 8, LEFT + bw, 8 + bh), radius=28, fill=PINK, outline=BLACK, width=6)
    d.text((LEFT + 28, 8 + bh / 2), q_text, font=F_Q, fill=WHITE, anchor="lm",
           stroke_width=5, stroke_fill=BLACK)
q_layer = make_layer(question, 140)
tw = ImageDraw.Draw(Image.new("L", (1, 1))).textlength(q_text, font=F_Q)
q_layer.alpha_composite(emoji, (int(LEFT + 28 + tw + 14), 8 + 15))
layers.append((QUESTION_T, q_layer, y))
y += 140
print("right edge =", MAXX[0], "content bottom y =", y, f"({y / H:.0%} of height)")
assert y < H * 0.75, "텍스트가 안전영역을 넘어감"


# ---- 배경: 움직임 적은 어두운 그라데이션 ----
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
def background(t):
    ph = 2 * math.pi * t / DUR   # 11초 주기 → 반복 시 이음새 없음
    bx1, by1 = W * (0.25 + 0.08 * math.sin(ph)), H * (0.30 + 0.05 * math.cos(ph))
    bx2, by2 = W * (0.80 + 0.06 * math.cos(ph)), H * (0.75 + 0.05 * math.sin(ph))
    g1 = np.exp(-(((xx - bx1) ** 2 + (yy - by1) ** 2) / (2 * 520.0 ** 2)))
    g2 = np.exp(-(((xx - bx2) ** 2 + (yy - by2) ** 2) / (2 * 600.0 ** 2)))
    base = np.array([28, 22, 44], np.float32)
    c1 = np.array([120, 40, 90], np.float32)
    c2 = np.array([40, 60, 130], np.float32)
    img = base + g1[..., None] * c1 + g2[..., None] * c2
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).convert("RGBA")

bg_cache = {}
def frame(i):
    t = i / FPS

    bg = background(t)
    for t0, img, ly in layers:
        if t < t0:
            continue
        p = ease_out((t - t0) / SLIDE) if t0 > 0 else 1.0
        if p < 1.0:
            img2 = img.copy()
            img2.putalpha(img.split()[3].point(lambda v, p=p: int(v * p)))
        else:
            img2 = img
        bg.alpha_composite(img2, (0, int(ly - 40 * (1 - p))))
    return bg.convert("RGB")


ff = imageio_ffmpeg.get_ffmpeg_exe()
cmd = [ff, "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
       "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
       "-shortest", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
       "-profile:v", "high", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", OUT]
p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)
for i in range(int(DUR * FPS)):
    p.stdin.write(frame(i).tobytes())
p.stdin.close()
p.wait()
print("done", OUT)
