from pathlib import Path

from PIL import Image, ImageDraw


output = Path(__file__).parents[1] / "src-tauri" / "icons" / "icon.ico"
output.parent.mkdir(parents=True, exist_ok=True)
web_icons = Path(__file__).parents[1] / "src" / "icons"
web_icons.mkdir(parents=True, exist_ok=True)

image = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
draw = ImageDraw.Draw(image)
ink = "#4b3b35"
cream = "#fff8e9"
orange = "#f2a13a"
blue = "#86cce8"
pink = "#f29ca7"

draw.polygon([(50, 78), (48, 24), (103, 60)], fill=orange, outline=ink, width=10)
draw.polygon([(153, 60), (209, 24), (206, 82)], fill="#292629", outline=ink, width=10)
draw.ellipse((38, 48, 218, 220), fill=cream, outline=ink, width=10)
draw.pieslice((38, 48, 142, 154), 155, 350, fill=orange)
draw.pieslice((135, 42, 219, 141), 190, 20, fill="#292629")
draw.ellipse((85, 111, 111, 145), fill=ink)
draw.ellipse((151, 111, 177, 145), fill=ink)
draw.ellipse((91, 116, 99, 127), fill="white")
draw.ellipse((157, 116, 165, 127), fill="white")
draw.polygon([(128, 147), (117, 154), (128, 163), (139, 154)], fill=pink)
draw.arc((98, 149, 128, 177), 5, 105, fill=ink, width=5)
draw.arc((128, 149, 158, 177), 75, 175, fill=ink, width=5)
draw.rounded_rectangle((55, 179, 201, 216), radius=18, fill=blue, outline=ink, width=8)
draw.ellipse((111, 199, 154, 232), fill="#f4c64f", outline=ink, width=6)
draw.polygon([(112, 215), (93, 202), (93, 228)], fill="#f4c64f", outline=ink)

image.save(output, sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
image.resize((192, 192), Image.Resampling.LANCZOS).save(web_icons / "icon-192.png")
image.resize((512, 512), Image.Resampling.LANCZOS).save(web_icons / "icon-512.png")
