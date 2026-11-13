import { createCanvas } from 'canvas';
import { drawFurniture, AV, T, PAD } from './src/draw.ts';
import { ITEMS, lying } from './shared/game.js';
import * as fs from 'fs';
import * as path from 'path';

const outDir = path.resolve('D:/Projects/Auralis/furniture_views');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const SCALE = 3;
const CELL = Math.max(...Object.values(ITEMS).map((it: any) => Math.max(it.w, it.h))) * 16 + 14;
const FLOOR = 68;

for (const [item, it] of Object.entries(ITEMS) as [string, any][]) {
  const canvas = createCanvas(CELL * 4, 200); // height enough for furniture
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  for (let rot = 0; rot < 4; rot++) {
    const cx = rot * CELL + CELL / 2;
    const fw = (rot % 2 ? it.h : it.w) * 16;
    ctx.fillStyle = 'rgba(58,38,51,0.13)';
    ctx.fillRect(Math.round(cx - fw / 2), FLOOR, fw, 2);
    ctx.fillStyle = 'rgba(58,38,51,0.07)';
    ctx.fillRect(Math.round(cx - fw / 2 - 3), FLOOR + 2, fw + 6, 1);
    drawFurniture(
      ctx,
      item,
      Math.round(cx - fw / 2),
      FLOOR,
      1200,
      undefined,
      false,
      it.w,
      0,
      0,
      rot,
      it.h,
      lying(it)
    );
  }
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(outDir, `${item}.png`), buffer);
}
console.log('generated');
