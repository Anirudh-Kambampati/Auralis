// Messages that arrive while the tab is in the background show as "(3) Auralis" and a red dot on the favicon.
const TITLE = document.title;
const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]'));
const original = links.map((l) => l.href);
let count = 0;
let dotted = ''; // the favicon with its red dot, drawn once

const logo = new Image();
logo.src = '/icon.svg';
logo.onload = () => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.drawImage(logo, 0, 0, 64, 64);
  g.beginPath();
  g.arc(48, 16, 15, 0, Math.PI * 2);
  g.fillStyle = '#ed4245';
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = '#fff';
  g.stroke();
  dotted = c.toDataURL();
  show();
};

function show() {
  document.title = count ? `(${count > 99 ? '99+' : count}) ${TITLE}` : TITLE;
  links.forEach((l, i) => { l.href = count && dotted ? dotted : original[i]; });
}

export function countUnseen(n = 1) {
  if (!document.hidden || n <= 0) return;
  count += n;
  show();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden || !count) return;
  count = 0;
  show();
});
