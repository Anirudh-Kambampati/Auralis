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

The Guide can be read, but it cannot make you read it. The tour is the same words at the moment they matter, in a dialog that lists **every step at once**: a scrollable column of cards, each one an icon, the thing's name and its sentence, with a single **Got it** underneath. Nothing hides behind a toast or a "next" — the whole shape of it is on screen.

**A card never prints the same words twice.** The heading is the item's name and the sentence is the line from `GUIDE_TIPS`; when the sentence already opens with that name ("Coffee: click it for…") the heading is dropped, and an intro row that is only a sentence shows the sentence alone rather than a heading cut from it. A tour that repeated its own text made every card read as a stutter.

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
- A chat log sits on a soft wash of its thread's accent rather than the accent itself (`color-mix(in srgb, var(--thread-accent) 12%, #fff)`), so the white bubbles on both sides read in every thread while a theme still visibly changes the tint. The thread colour lives in `--thread-accent` alone; the old full-strength `--thread-bg` is gone.
- A chat thread's header carries its small buttons on the right: Leave group, Unfriend (or Cancel request, Decline) and a bell. The bell opens a dropdown with 2 hours, 8 hours and Always (Unmute while it is muted); once muted it is drawn with a stroke through it, and the same crossed bell sits beside the name in the chat list. Muting never hides the unread badge.
- The to-do card keeps finished items behind a **Completed tasks** fold with a count, so the list reads as what is left to do; the fold looks the same before and after the list is rebuilt (a new house state arrives on every action), and opening it shows the same rows, strikethrough and all.
- Phone: panels are bottom sheets above an icon dock. Desktop (≥ 900px): to-dos and chat in a left sidebar, panels in a right sidebar, the room centred between them.
- Focus mode swaps the dock for a focus card with the big timer, a progress track with a coin marker, and two icon buttons (give up needs two taps; room view hides the card). Opening any panel steps the card aside and moves the timer to the HUD chip, and closing the panel brings the card back — the Guide and the to-do card are as reachable mid-session as they are any other time.

## Pixel art

- Everything is original, drawn in code in `src/draw.ts`. There are no image files except the app icon.
- Tiles are 16×16 art pixels and scale by whole numbers. Image smoothing is off and the canvas matches device pixels exactly, so sprites stay sharp.
- Characters are 16×21 chibi sprites built from text rows plus overlays: haircut, outfit and face layers, coloured from the player's choices.
- Furniture uses a few shapes: an outlined box with a top highlight and bottom shade, discs and hearts. Recolourable pieces take one base colour and shade from it.
- The 3/4 view: furniture overhangs its floor footprint upwards (`OVERHANG`). Sprites draw in order of their bottom edge, so characters walk in front of and behind things correctly.
- Pets draw with a little hop when they move, with a dark version of their coat as the outline so they read soft. The art comes in two sizes (12×10 and 16×12), but every pet is drawn at one size: the capybara's 16×12 at 1.0. Smaller art is scaled up to the same width (`PET_SCALE` in `src/pets.ts`), so a duckling takes up as much floor as a capybara, and accessories scale with the art they sit on instead of staying icon-sized. Coats themselves are a step brighter than the accessories' base tones, and each column of coat carries a one-pixel shine along its lit top edge, so a pet looks glossy next to its accessories instead of flat.
- Extra furniture looks sit in one block at the end of the furniture section of `draw.ts`, next to the shapes they are built from: a crowned wingback, three beds (four-poster, brass frame, buttoned four-poster), a glass cabinet and an arched bookcase, a pleated paper lantern, a mid-century dresser and a hairpin sideboard, an armoire and a linen press, a Persian or gingham rug, and three karaoke machines (a retro record-player console with a plain spindle and chrome tonearm, a neon booth with a heart sign and breathing EQ, and a cute mint dome with cat ears and a singing face plate). They paint in the room's own art pixels and take the owner's colour, so a style recolours exactly like the original piece.
- Singing swaps the face layer to an open-mouth variant that is not offered in the editor, adds a mic at the chin (or both hands at the chest for a duet) and three one-pixel notes drifting up. Behind the singer, a separate sprite lays a faint dithered cone and a pool of warm light over the floor, so the mic stand and the singer stay crisp on top of it. The whole thing is ambient: it stays quieter than a lamp. The stand itself is graphite — a nearly black clip, a dark pole with a lit edge and a dark base — because the pale lavender it used to be disappeared against cream and pink floor tiles.
- A pet's rest states have to read at a glance: a nap in the sun is a floor shadow and a warm gold Zzz, a nap on a cushion is a few pixels higher with the shadow gone, and a lap nap is higher still. Same lying pose, three different places, and the room tells you which without a single word.
- A pet's name is a piece of the world, not a label on a widget: it fades in while the pet trots about, while it is being fussed over, and for a few seconds now and then, then goes away. A permanently named pet reads as a status bar with legs, and the room stops feeling lived in.
- A bond with someone else's pet is never a number, bar or badge — only what the pet does: coming over, settling beside you, a trick with a few gold sparkles. If you can read your bond off the screen, it has stopped being a relationship and become a progress track.
- Pet accessories are the one place that turns up the volume: a candy palette (hot pink, gold, sky blue, red, violet) with a cream highlight and a full ink outline on every piece, so a bow or crown pops off a coat instead of melting into it.

## Icon

A happy character with hair buns holding an open book, on a soft pink rounded square with the same dark outline. Unlike the in-game art it is smooth vector, so it stays clean at any size (`public/icon.svg`).
