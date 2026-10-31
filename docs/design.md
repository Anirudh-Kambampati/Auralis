# Design

## Feel

Calm, cozy and flat. A dollhouse cutaway sits on warm paper. The game should be pleasant to leave open for an hour of studying, so nothing flashes or competes for attention.

## Palette

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#efe6da` | Paper background with a faint dot grid |
| `--paper` | `#fffaf3` | Cards, panels, dock |
| `--soft` | `#ece2d5` | Unselected buttons, tracks |
| `--ink` | `#2b2530` | Every outline and offset shadow |
| `--blue` | `#5b7fd6` | Primary actions, focus |
| `--gold` | `#f2c14e` | Selection, coins, rewards |
| `--coral` | `#e06a5a` | Giving up, errors |

Panel headers use a pastel per area: focus blue, decorate mint, shop butter, you pink, house lilac, stats peach.

## UI rules

- One outline colour (`--ink`, 3px) and solid offset shadows (`0 4px 0`). No gradients or gloss.
- Buttons press down 3px when tapped.
- Font: **Fredoka** for UI text, because its numbers are easy to read. The focus timer uses a blocky pixel font drawn in code (`paintBlockText`).
- Phone: panels are bottom sheets above an icon dock. Desktop (≥ 900px): to-dos and chat in a left sidebar, panels in a right sidebar, the room centred between them.
- Focus mode swaps the dock for a focus card with the big timer, a progress track with a coin marker, and two icon buttons (give up needs two taps; room view hides the card).

## Pixel art

- Everything is original, drawn in code in `src/draw.ts`. There are no image files except the app icon.
- Tiles are 16×16 art pixels and scale by whole numbers. Image smoothing is off and the canvas matches device pixels exactly, so sprites stay sharp.
- Characters are 16×21 chibi sprites built from text rows plus overlays: haircut, outfit and face layers, coloured from the player's choices.
- Furniture uses a few shapes: an outlined box with a top highlight and bottom shade, discs and hearts. Recolourable pieces take one base colour and shade from it.
- The 3/4 view: furniture overhangs its floor footprint upwards (`OVERHANG`). Sprites draw in order of their bottom edge, so characters walk in front of and behind things correctly.
- Pets are 12×10 sprites with a little hop when they move.

## Icon

A happy character with hair buns holding an open book, on a soft pink rounded square with the same dark outline. Unlike the in-game art it is smooth vector, so it stays clean at any size (`public/icon.svg`).
