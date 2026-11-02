# Renders the composition with headless Chromium.
#   python render.py stills 0.5 3.2 ...   -> work/stills/t<time>.png
#   python render.py video                -> work/video.mp4 (silent, 30fps), piped straight into ffmpeg
import subprocess, sys
from pathlib import Path
import imageio_ffmpeg
from playwright.sync_api import sync_playwright

URL = 'http://localhost:5199/brag-output/work/comp.html'
FPS, DURATION = 30, 21.5
HERE = Path(__file__).parent

with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome')
    page = b.new_page(viewport={'width': 1920, 'height': 1080})
    page.goto(URL)
    page.wait_for_function('typeof window.renderAt === "function"', timeout=60000)
    page.evaluate('window.ready')
    shoot = lambda t: (page.evaluate(f'renderAt({t})'), page.screenshot(type='png'))[1]
    if sys.argv[1] == 'stills':
        (HERE / 'stills').mkdir(exist_ok=True)
        for t in sys.argv[2:]:
            (HERE / 'stills' / f't{t}.png').write_bytes(shoot(float(t)))
    else:
        ff = subprocess.Popen([imageio_ffmpeg.get_ffmpeg_exe(), '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', str(FPS),
                               '-c:v', 'png', '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p',
                               str(HERE / 'video.mp4')], stdin=subprocess.PIPE)
        n = round(FPS * DURATION)
        for i in range(n):
            ff.stdin.write(shoot(i / FPS))
            if i % 60 == 0: print(f'frame {i}/{n}', flush=True)
        ff.stdin.close(); ff.wait()
    b.close()
