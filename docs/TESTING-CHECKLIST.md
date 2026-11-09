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
- [ ] "CPU levels" and "History" start **closed**; click to open them.
- [ ] Put CPUs in seats (easy / medium / hard). **Remove CPU** empties a seat.
- [ ] **Remove player** takes a person out of their seat (they become a spectator).
- [ ] Chips: change a number in a seat card, press **Set**, then **tap again** to confirm.
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
- [ ] The **deal animation** (~5 s): tiles slide to each player and the wall picture empties.
- [ ] Your hand is **sorted once** when dealt (fewest suit → most suit, 1–9, then winds E S W N, then dragons). After that it never re-sorts: new tiles go on the right, and your order stays even after locking the phone or reloading.
- [ ] Your name, chips (and dice if you deal) are at the **top left**.
- [ ] The top bar shows the **minimum fan** next to the round name ("Min 1 fan" / "1番起糊"). Change it on the host page between hands: every device updates.
- [ ] **Draw**: tap the glowing **Draw** tile in the middle, or drag it into your hand.
- [ ] The new tile sits **apart on the right**; drag it into your hand and it joins it.
- [ ] Drag tiles to **reorder** your hand: while you drag, the other tiles slide apart to show where it will land.
- [ ] **Discard**: drag a tile to the middle; it slides into place. Other players' discards slide in too.
- [ ] The **last discard** also shows big in the middle (next to "tiles left") with who threw it; it goes away when someone claims it.
- [ ] When you can claim, the tile shows big in the middle as **Take**; tap or drag it.
      The flashing Soeng / Pung / Gong / Wu buttons also work, and so does tapping the discard.
- [ ] Once the next player draws, the buttons and flashing **disappear**.
- [ ] Flowers go to your public tiles (left of your hand) and you draw a **Replacement**.
- [ ] When anyone makes a **Soeng / Pung / Gong** (also a gong from their own tiles), a pop-up shows the set big in the middle with a coloured badge and "N CPU Easy: Pung!" / "You: Pung!", and the new set glows gold. These pop-ups stay for 3 seconds.
- [ ] When anyone draws a flower (not during the deal), a big pop-up shows it in the middle ("N CPU Easy drew a flower" / "You drew a flower"), and the new flower glows gold where it lands.
- [ ] Left / right players' tiles lie **sideways in columns**; their name tags are one small line.
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
