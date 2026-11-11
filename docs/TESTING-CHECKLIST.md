# Phase 8: testing on real devices (Windows host)

Tick each box as you go. If something goes wrong, see "What to send me" at the end.

## Part A: install on the Windows laptop (once, and again for each update)

- [ ] **Download the installer:** <https://github.com/kylejtam/LAN-Mahjong/releases/latest/download/LAN-Mahjong-Setup.exe>
- [ ] Double-click the downloaded **LAN-Mahjong-Setup.exe**.
- [ ] Windows may say **"Windows protected your PC"**: click **More info → Run anyway**
      (this happens because the installer isn't paid-for "signed"; it is safe).
- [ ] Click through the installer. Leave **"Start LAN Mahjong now"** ticked and click **Finish**.
- [ ] **Make sure your Wi-Fi is a "Private" network:** Settings → Network & internet → Wi-Fi →
      your network → **Private**.
- [ ] **Stop the laptop going to sleep** while you play: Settings → System → Power →
      "When plugged in, put my device to sleep after" → **Never**.

**Updates are automatic** from version 1.1.0 on: each time you start LAN Mahjong it checks for a
newer version, installs it and restarts by itself (about 30 seconds; needs internet). Your saved
games are kept. The version number is on the host page (top) and the join screen (bottom).
- [ ] The version number shows as a "Version …" label next to the host page title, at the bottom of the join screen, and in the bottom-left corner of ⚙ Settings.
- [ ] When a newer release is out: start LAN Mahjong and watch the small window say
      "A new version … is available", then "Installing…"; the game restarts by itself with the new number.

## Part B: start the game (every time you play)

- [ ] Double-click the **LAN Mahjong** icon (bird) on the desktop or in the Start menu.
- [ ] A small window opens; **keep it open while playing**. Closing it stops the game.
- [ ] **The first time only**, Windows may ask about the firewall for Node.js: tick
      **Private networks** and click **Allow**.
- [ ] The **host page** opens in your browser by itself (`http://localhost:3000/host`).
- [ ] Double-clicking the icon again while it runs just opens the host page again.

## Uninstall

- [ ] Start menu → LAN Mahjong → **Uninstall LAN Mahjong** (or Settings → Apps → LAN Mahjong → Uninstall).
      It asks whether to also delete your saved games.

## Part C: join from each device

Do this on each device: iPhone, iPad, Samsung tablet, and the laptop itself.

- [ ] The device is on the **same Wi-Fi** as the laptop (not a guest network).
- [ ] iPhone held sideways: nothing (names, tiles, buttons, pop-ups) hides under the camera island.
- [ ] iPhone held sideways: when a side player has lots of tiles (more than 3 columns), they get smaller so all of them stay visible.
- [ ] Scan the QR code on the host page with the camera, or type the address
      into Safari (iPhone/iPad) or Chrome (Samsung).
- [ ] The start screen appears. (On the laptop: press **Play on this computer** on the host page; it opens in a new tab.)

Write down which devices worked: ☐ iPhone ☐ iPad ☐ Samsung tablet ☐ laptop

## Part D: things to try

### Host page (laptop, `http://localhost:3000/host`)
- [ ] Create a game: the starting balance shows **200** by default.
- [ ] "History" starts **closed**; click to open it. There is no "CPU levels" section any more.
- [ ] Put CPUs in seats (easy / medium / hard). They are called "Easy (CPU)" etc. **Remove CPU** empties a seat.
- [ ] Type a name in a CPU seat's **Name** box and press Set: everyone sees e.g. "Auntie May (CPU)". Typing "(CPU)" yourself does not double it. Clear the box and press Set: back to "Hard (CPU)". Change the level: the name stays.
- [ ] **Minimum fan** is a drop-down with only 0, 1, 2 and 3.
- [ ] Play a few hands at fan 3 with each level: Hard usually goes for one suit or pongs and wins bigger hands; Medium claims less often; Easy never calls chow / pong / gong.
- [ ] **Remove player** takes a person out of their seat (they become a spectator).
- [ ] Chips: change a number in a seat card, press **Set**, then **tap again** to confirm.
- [ ] A new game's **CPU time per move** starts at **5** seconds.
- [ ] Change **CPU time per move** (e.g. 0.5 and 3) and watch the CPUs speed up / slow down.
- [ ] Change the table colour; every device changes too.
- [ ] Settings → **Liability 包** (on by default for new games; can be turned off). With it on: once someone shows 3 face-up sets of one suit, the first player to discard a tile of that suit which they use is liable; if they win with a one-suit hand, the summary says "包: … pays for everyone" and only that player pays.
- [ ] After a few hands, open **History**: one column per seat, winner **green**,
      discarder **red** (on a self-draw all losers are red).
- [ ] **Roll back to before this** (two taps) and **Change current game** (two taps).
- [ ] Mid-hand, **Stop this hand** (two taps): every device says the host stopped the hand; chips don't change. Change a setting (e.g. Minimum fan), press **Save settings**, press **Start** on the devices: the same game is dealt again.
- [ ] **End game** (two taps): every device is told.

### Join screen (each phone / tablet)
- [ ] The bird logo shows next to "LAN Mahjong" (no white background).
- [ ] Open the join screen **first**, then create a game on the laptop: it appears by itself.
- [ ] Switch English / 中文.
- [ ] Type a name, tap **Join**, then a seat (or **Spectate** in the middle).

### Playing a hand
- [ ] Press **Start**; the dealer swipes the dice; on every screen three dice bounce around, then land in the middle on the rolled numbers (red 1 and 4); then the deal starts. The dice also show next to the dealer's name.
- [ ] The **deal animation** (~5 s): tiles slide to each player and the wall picture empties. Nobody's flowers show until the deal has finished. Your own tiles appear as they are dealt, 4 at a time, sorted as they come in.
- [ ] Your hand is **sorted once** when dealt (fewest suit → most suit, 1–9, then winds E S W N, then dragons). After that it never re-sorts: new tiles go on the right, and your order stays even after locking the phone or reloading.
- [ ] Your name, chips (and dice if you deal) are at the **top left**.
- [ ] The top bar shows the **minimum fan** next to the round name ("Min 1 fan" / "1番起糊"). Change it on the host page between hands: every device updates.
- [ ] **Draw**: tap the glowing **Draw** tile in the middle, or drag it into your hand.
- [ ] The new tile sits **apart on the right**; drag it into your hand and it joins it.
- [ ] Drag tiles to **reorder** your hand: while you drag, the other tiles slide apart to show where it will land.
- [ ] **Discard**: drag a tile to the middle; it slides into place. Other players' discards slide in too.
- [ ] The middle of the table: last discard (or **Take**) on the left, the wall and "tiles left" in the centre, **Draw** on the right. The wall stays still when Draw / Take appear or go.
- [ ] The **last discard** also shows big in the middle (next to "tiles left") with who threw it; it goes away when someone claims it.
- [ ] When you can claim, the tile shows big in the middle as **Take**; tap or drag it.
      The flashing Soeng / Pung / Gong / Wu buttons also work, and so does tapping the discard.
- [ ] After the next player draws, you can still claim for **10 seconds**, or until that player discards (whichever is sooner); the buttons stay until then.
- [ ] Flowers go to your public tiles (left of your hand) and you draw a **Replacement**.
- [ ] When anyone makes a **Soeng / Pung / Gong** (also a gong from their own tiles), a coloured bubble ("Pung!") pops up next to that player's name tag and the set's tiles show big in the middle, glowing in the claim's colour (Soeng green, Pung blue, Gong purple), for 3 seconds. Flowers keep their own pop-up.
- [ ] When anyone draws a flower (not during the deal), a big pop-up shows it in the middle ("N Easy (CPU) drew a flower" / "You drew a flower"), and the new flower glows gold where it lands.
- [ ] Left / right players' tiles lie **sideways in columns**; their name tags are one small line. The right player's discards and sets read from the bottom up (oldest at the bottom).
- [ ] The wall picture around "tiles left" shrinks as tiles are drawn.
- [ ] **Undo** after a discard. When it's a CPU's turn, you can undo for it.
- [ ] Open **?** (Help): both tables readable.
- [ ] Open **⚙** (Settings): change your name, change the language, **Leave my seat**,
      **Swap with …** a spectator, close with the **×**.

### End of a hand
- [ ] When someone wins, confetti goes off over the summary and a fanfare plays (iPhone/iPad: silent switch off). A draw has no celebration.
- [ ] On the win summary and the Ready / Start pop-up, **?** and **⚙** in the top right still open Help and Settings.
- [ ] ⚙ Settings → **Win celebration**: Confetti / Red & gold / Gold chips / Fireworks. Tapping one previews it; each device keeps its own choice.
- [ ] Summary: the tile that won the hand is outlined in gold; winning conditions, the winner's sets grouped together, flowers,
      **+ / −** chips for each player.
- [ ] As soon as the summary shows, everyone's chips (top right, name tags, host page) already include the win.
- [ ] Buttons are only **Ready** and **Leave seat** (plus **Undo chicken win** for a chicken win).
- [ ] Each player's row shows when they are **Ready**; when everyone is, the next hand starts.

### Spectators
- [ ] **Show / Hide** on each player; **All hands** shows all four hands.
- [ ] **Sit here** on an empty seat works straight away, even mid-hand.
- [ ] All-CPU table: the game waits at the end of each hand for **Next round**.

### Leaving and coming back
- [ ] **Lock** a phone for 30 s, unlock: it reconnects by itself.
- [ ] Switch to the camera and back: the game list / table updates by itself.
- [ ] Close the tab and rejoin with the **same name** (try different capitals): same seat.
- [ ] A swap request shows "Waiting for … to answer"; if declined, the asker is told.
- [ ] **Restart the server** (Ctrl + C, then `npm start`): everyone reconnects to the same game.

## What to send me if something goes wrong

1. **Which device** and browser (e.g. "iPad, Safari").
2. **What you did**, step by step.
3. **What happened**, and what you expected to happen.
4. A **screenshot** or photo of the screen.
5. If the black window on the laptop shows red text or "Error", a photo of that too.

## Common problems

- **Devices can't open the address:** check the Wi-Fi is set to **Private** (Part A),
  that you allowed Node.js in the firewall box, and that the device isn't on a guest
  Wi-Fi. If the firewall box never appeared, search Start for "Allow an app through
  Windows Firewall" and tick **Private** next to Node.js.
- **Nothing happens / the window closes at once:** take a photo of the window if you can and send it to me.
- **"Windows protected your PC" when installing:** click **More info**, then **Run anyway**.
- **The host page doesn't open:** open your browser and go to `http://localhost:3000/host`.

## End of the wall, ties and wins (1.16.0)
- [ ] Play until the wall shows 0. After the last tile is thrown, nobody can draw.
- [ ] If you can win on the last tile: the game waits (no time limit). You see **Wu** and a plain **Pass** button (no colour). Pass: you can't win on that tile any more.
- [ ] If you can only chow / pong / gong on it: the buttons stay for 10 s, then go. Pass makes them go straight away.
- [ ] If someone pongs the last tile and throws another, everyone may decide again on that tile.
- [ ] When nobody can take the tile: a red seal stamp "Tie" (Chinese 和) shows for 5 s, then the summary ("Draw – the wall is empty").
- [ ] A win on the last discard shows "Win on the last discard 河底撈魚" (1 fan) on the summary.
- [ ] Any win: a red "Wu!" bubble by the winner's name, the winner's hand in the middle with the winning tile glowing gold, and your confetti, all at once. The summary opens after 10 s and the confetti does **not** play again.
- [ ] Reload the page while a summary is showing: it goes straight to the summary (no bubble, no confetti).
- [ ] A CPU that can win on a discard wins it, even when the next player is a CPU that would otherwise draw first.

## 1.17.0
- [ ] With two or three possible Soengs, tap Soeng: the usable tiles glow green, the rest fade, no pop-up. Tap 三 (or 七) in 三四六七 + 五: done at once. Tap 四: it turns gold and only 三 and 六 stay lit; tap 六: Soeng 4-5-6. Tap the table: starts again. Tap Soeng again: stops choosing.
- [ ] Whose turn: that player's name tag pulses gold and the table edge in front of them glows gold (above your hand on your turn).
- [ ] After a win or a tie, "Tap anywhere to continue" shows; tapping opens the summary straight away (only on your screen).
- [ ] CPUs show "(CPU)" once, with no extra CPU badge.
- [ ] Draw: just touching the glowing tile draws it.
- [ ] Discard: push a tile up; when it is fully out of the dark hand area it glows red; let go to throw it. Let go before that: it goes back. Sideways still rearranges.
- [ ] Host page: each game is a tile; tap to open/close; a new game opens by itself. Open tiles stay open after reloading the host page.
- [ ] Host page history: tap a number, type a new one, Save. Only that player's chips change, by the difference. Orange outline, "was …", Edited tag, edit list line. Roll back to a later game keeps the edit.
- [ ] Win summary: winner's name green, thrower's name red.
- [ ] (1.17.1) Every discard, yours and other players', slides in from the player who threw it.
- [ ] (1.17.2) The big last discard in the middle disappears as soon as the next player draws, or someone claims it.
- [ ] (1.17.3, iPad) The whose-turn glow on name tags is never cut off, and doesn't run into the gold table-edge glow.
- [ ] (1.17.4) No tile glow is ever drawn over another tile: claim pop-ups, new flowers, the winning tile (summary and Wu moment), the Soeng choice in your hand.

## 1.18.0: start of each hand
- [ ] After everyone presses Start: the tiles are shoved around face down (never on top of each other) and glide into a square wall; all four sides build together.
- [ ] Dealer: a "Roll the dice" button appears in the middle of the wall only once it is built (swiping the dice still works). Others: "Waiting for … to roll".
- [ ] After the dice: a quick light runs round the walls, then along the stacks, and a gold mark shows the break.
- [ ] Tiles fly from the wall to each player in the right order; your tiles appear four at a time; the wall shrinks into the small tiles-left box and play starts.
- [ ] CPU dealer: rolls by itself after the wall is built. Reopening the page during the deal: the wall just appears (no mixing).

## 1.18.1: start-of-hand fixes (check on iPad)
- [ ] Mixing: tiles turn only a little as they are shoved, never spin.
- [ ] You see the wall being built; the Roll the dice button (or "Waiting for … to roll") only appears after it is finished.
- [ ] The four walls' ends don't overlap at the corners.
- [ ] CPU dealer: doesn't roll until the wall is built, and doesn't discard until all tiles are dealt and the wall has shrunk.
- [ ] The dice in the Roll the dice box are real dice pictures, not squares.
- [ ] The wall shrinks into the small tiles-left box without fading early; the box appears as it arrives.

## 1.19.0
- [ ] Opening flowers pop up in front of each player after the deal: green ring = scores for them, red = doesn't. They fade after about 2.5 s.
- [ ] Flowers sit first (on each player's left) in front of every player, including the right-hand player.
- [ ] A flower drawn during the hand glows green if it scores for that player, red if not.
- [ ] After the deal the leftover wall shrinks exactly onto the small tiles-left box, then fades into it with no jump.
- [ ] The dice stay inside the wall while they bounce.
- [ ] Joining: no pop-up; you watch the pile until you press Sit here on an empty seat. A full table: you can only watch.
- [ ] Moving your mouse / dragging your finger pushes the tiles; other players' and CPUs' pushing shows on every screen.
- [ ] Ready (green) then Unready (plain). When all four are ready: 6 shoves from random directions, then the wall builds.
- [ ] After a hand: Continue in the summary brings you back to the table, with Return to Game Summary in the middle and the next game's name at the top.
- [ ] After the very last hand: Continue goes straight to the final scores (including that hand).
- [ ] The dealer's 14th tile is sorted into the hand at the start (not apart on the right).
- [ ] Remaining tiles in the game summary: title, count on the right, tiles in drawing order (not after a draw).
- [ ] Fullscreen button works on laptop/iPad/Android and isn't shown on iPhone.
- [ ] Your tiles stay the same size when you draw, discard and claim.
- [ ] Claims: first tap holds (tiles glow, next player can't draw, bubble for everyone), Confirm claims, Cancel lets it go. Holding after the next player drew puts their tile back.
- [ ] Settings → Call all possible claims: any claimable tile is held automatically (colour-cycling bubble for others), with Cancel on the left.
- [ ] Undo takes back your own last move only (until someone else moves); anyone can undo a CPU's move.
- [ ] Turn off a player's Wi-Fi mid-hand: they see a huge Reconnecting…; everyone else sees the game paused with a red card within about 10 s; it carries on when they're back.
- [ ] Tutorial: from the game list; every step's glow points at the right control; Leave tutorial works at any time; ends with Tutorial complete → back to the game list.

