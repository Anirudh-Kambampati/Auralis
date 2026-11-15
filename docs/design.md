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

Panel headers use a pastel per area: focus blue, decorate mint, shop butter, you pink, house lilac, stats peach, guide mist.

## The Guide

A `?` chip sits in the HUD, grouped with the coin count on the left, and opens the Guide panel.

The panel is one card per system — sixteen of them, plus the opening card — and a card expands in place rather than navigating anywhere. Each card shows a sentence of prose, then either a numbered list of steps (the opening card) or a row per item: the item's own art, its name, and the one thing a hover tooltip cannot say, that a coffee buys ten minutes of extra pay, that the claw waits half an hour between plays.

An item gets a row only when the tooltip does not already explain it. `Water`, `Nap`, `Play music` and `Send a gift` are on the tooltip, so plants, chairs, speakers and gift boxes are not listed.

## The tour

The Guide can be read, but it cannot make you read it. The tour is the same words at the moment they matter, in a dialog that lists **every step at once**: a scrollable column of rows, the current one expanded to its sentence, the rest collapsed to their titles, with `1 / 9`, Back, Next and Got it underneath. Nothing hides behind a toast or a "next" — the whole shape of it is on screen, and any row can be tapped to jump straight there.

It opens by itself in three cases, and only those:

- **A new player**, once, on their first room: they own nothing worth a tip yet, so they get the five welcome steps.
- **An existing player**, once, the first time they load after the tour exists: every tipped thing they own is one step.
- **A new thing with a hidden feature**, bought or otherwise arrived: a short tour of just that item, after the last one closes.

Opening the tour is what marks its steps as seen, so it never asks twice — which is why the old per-item toasts are gone. Two or three toasts and then silence was the failure: a player who owned ten of these things saw two of them and the rest were marked seen without ever being shown. The Guide panel is where to read them again; the tour is where to be told.

The tour is a `<dialog>` (`#tour`) with the same outline-and-offset-shadow card as the other modals, and it is not a form: the only buttons are close, the step rows, and the footer.

## UI rules

- One outline colour (`--ink`, 3px) and solid offset shadows (`0 4px 0`). No gradients or gloss.
- Buttons press down 3px when tapped.
- Font: **Fredoka** for UI text, because its numbers are easy to read. The focus timer uses a blocky pixel font drawn in code (`paintBlockText`).
- Phone: panels are bottom sheets above an icon dock. Desktop (≥ 900px): to-dos and chat in a left sidebar, panels in a right sidebar, the room centred between them.
- Focus mode swaps the dock for a focus card with the big timer, a progress track with a coin marker, and two icon buttons (give up needs two taps; room view hides the card). Opening any panel steps the card aside and moves the timer to the HUD chip, and closing the panel brings the card back — the Guide and the to-do card are as reachable mid-session as they are any other time.

## Pixel art

- Everything is original, drawn in code in `src/draw.ts`. There are no image files except the app icon.
- Tiles are 16×16 art pixels and scale by whole numbers. Image smoothing is off and the canvas matches device pixels exactly, so sprites stay sharp.
- Characters are 16×21 chibi sprites built from text rows plus overlays: haircut, outfit and face layers, coloured from the player's choices.
- Furniture uses a few shapes: an outlined box with a top highlight and bottom shade, discs and hearts. Recolourable pieces take one base colour and shade from it.
- The 3/4 view: furniture overhangs its floor footprint upwards (`OVERHANG`). Sprites draw in order of their bottom edge, so characters walk in front of and behind things correctly.
- Pets are 12×10 sprites with a little hop when they move, drawn with a dark version of their coat as the outline so they read soft. Coats themselves are a step brighter than the accessories' base tones, and each column of coat carries a one-pixel shine along its lit top edge, so a pet looks glossy next to its accessories instead of flat.
- Pet accessories are the one place that turns up the volume: a candy palette (hot pink, gold, sky blue, red, violet) with a cream highlight and a full ink outline on every piece, so a bow or crown pops off a coat instead of melting into it.

## Icon

A happy character with hair buns holding an open book, on a soft pink rounded square with the same dark outline. Unlike the in-game art it is smooth vector, so it stays clean at any size (`public/icon.svg`).
