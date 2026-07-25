# -*- coding: utf-8 -*-
# 숏폼 상단 후킹 제목을 투명 PNG로 렌더 (ffmpeg drawtext가 freetype 없어 못 쓰므로 우회)
# 사용법: python3 render_title.py "제목 텍스트" /tmp/title.png
import sys
from PIL import Image, ImageDraw, ImageFont

text = sys.argv[1]
out = sys.argv[2]

W = 1080
MARGIN = 70                     # 좌우 여백
MAXW = W - MARGIN * 2
FONT = '/System/Library/Fonts/AppleSDGothicNeo.ttc'
EMER = (16, 200, 130, 255)      # 브랜드 에메랄드(강조용, 현재는 흰색 기본)

def F(sz):
    return ImageFont.truetype(FONT, sz, index=6)  # 6 = Bold(시스템 .ttc 최대)

measure = ImageDraw.Draw(Image.new('RGBA', (10, 10)))

def wrap(txt, font):
    words, lines, cur = txt.split(' '), [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if measure.textlength(t, font=font) <= MAXW:
            cur = t
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines

# 3줄 넘으면 폰트 축소
size = 74
font = F(size)
lines = wrap(text, font)
while len(lines) > 3 and size > 46:
    size -= 6
    font = F(size)
    lines = wrap(text, font)

lh = int(size * 1.32)
pad = 36
H = lh * len(lines) + pad * 2
img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# 가독성용 반투명 검정 라운드 박스(블러 배경 위에서도 잘 보이게)
maxlw = max(measure.textlength(l, font=font) for l in lines)
bx0, bx1 = (W - maxlw) / 2 - 46, (W + maxlw) / 2 + 46
d.rounded_rectangle([bx0, 0, bx1, H], radius=30, fill=(0, 0, 0, 160))

# 퀄리오 브랜드 에메랄드 텍스트 + 검정 외곽선(어떤 배경에서도 확 튀게)
EMER = (16, 200, 130, 255)      # 밝은 에메랄드(썸네일과 동일 톤, 어두운 박스 위에서 잘 튐)
y = pad
for l in lines:
    x = (W - measure.textlength(l, font=font)) / 2
    d.text((x, y), l, font=font, fill=EMER, stroke_width=4, stroke_fill=(0, 0, 0, 255))
    y += lh

img.save(out)
