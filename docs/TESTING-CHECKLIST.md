# Phase 8: testing on real devices (Windows host)

Tick each box as you go. If something goes wrong, see "What to send me" at the end.

## Part A: install on the Windows laptop (once, and again for each update)

- [ ] **Sign in to GitHub** in the laptop's browser (the project is private).
- [ ] **Download the game:** <https://github.com/kylejtam/LAN-Mahjong/archive/refs/heads/main.zip>
      and extract it (right-click → **Extract All**).
- [ ] In the extracted folder, double-click **LAN-Mahjong-Setup.exe**.
- [ ] Windows may say **"Windows protected your PC"**: click **More info → Run anyway**
      (this happens because the installer isn't paid-for "signed"; it is safe).
- [ ] Click through the installer. Leave **"Start LAN Mahjong now"** ticked and click **Finish**.
- [ ] **Make sure your Wi-Fi is a "Private" network:** Settings → Network & internet → Wi-Fi →
      your network → **Private**.
- [ ] **Stop the laptop going to sleep** while you play: Settings → System → Power →
      "When plugged in, put my device to sleep after" → **Never**.

To update later: download the new ZIP and run the new **LAN-Mahjong-Setup.exe**; your saved
games are kept. You don't need Node.js, the black command window, or `npm` any more.

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
- [ ] Scan the QR code on the host page with the camera, or type the address
      into Safari (iPhone/iPad) or Chrome (Samsung).
- [ ] The start screen appears. (On the laptop, open the same address in a new tab.)

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
- [ ] After a few hands, open **History**: one column per seat, winner **green**,
      discarder **red** (on a self-draw all losers are red).
- [ ] **Roll back to before this** (two taps) and **Change current game** (two taps).
- [ ] **End game** (two taps): every device is told.

### Join screen (each phone / tablet)
- [ ] The bird logo shows next to "LAN Mahjong" (no white background).
- [ ] Open the join screen **first**, then create a game on the laptop: it appears by itself.
- [ ] Switch English / 中文.
- [ ] Type a name, tap **Join**, then a seat (or **Spectate** in the middle).

### Playing a hand
- [ ] Press **Start**; the dealer swipes the dice; the dice then show next to the dealer's name.
- [ ] The **deal animation** (~5 s): tiles slide to each player and the wall picture empties.
- [ ] Your hand is **sorted** (fewest suit → most suit, 1–9, then winds E S W N, then dragons).
- [ ] Your name, chips (and dice if you deal) are at the **top left**.
- [ ] **Draw**: tap the glowing **Draw** tile in the middle, or drag it into your hand.
- [ ] The new tile sits **apart on the right**; drag it into your hand and it joins it.
- [ ] Drag tiles to **reorder** your hand.
- [ ] **Discard**: drag a tile to the middle; it slides into place. Other players' discards slide in too.
- [ ] When you can claim, the tile shows big in the middle as **Take**; tap or drag it.
      The flashing Shàng / Pèng / Gàng / Hú buttons also work, and so does tapping the discard.
- [ ] Once the next player draws, the buttons and flashing **disappear**.
- [ ] Flowers go to your public tiles (left of your hand) and you draw a **Replacement**.
- [ ] Left / right players' tiles lie **sideways in columns**; their name tags are one small line.
- [ ] The wall picture around "tiles left" shrinks as tiles are drawn.
- [ ] **Undo** after a discard. When it's a CPU's turn, you can undo for it.
- [ ] Open **?** (Help): both tables readable.
- [ ] Open **⚙** (Settings): change your name, change the language, **Leave my seat**,
      **Swap with …** a spectator, close with the **×**.

### End of a hand
- [ ] Summary: winning conditions, the winner's sets grouped together, flowers,
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

### Controls tutorial (phase 9)
- [ ] The **first time** you sit down on a device, 7 short cards appear with moving pictures
      (draw, discard, arrange, take a discard, win, undo, help & settings).
- [ ] **Next / Back / Skip**, the dots, and the **×** all work. After **Done** it doesn't come back.
- [ ] **?** (Help) → **Controls tutorial** shows it again. Try it in 中文 too.

### Home screen (phase 9)
- [ ] On the join screen, tap **📲 Add to home screen**: it shows the steps for your device
      (you can switch between iPhone / iPad, Android (Chrome) and Samsung Internet).
- [ ] Follow the steps. The icon is the **bird** on a dark square, named **Mahjong**.
- [ ] Open the game from the icon: it fills the screen (iPhone/iPad). Type your name to rejoin.
- [ ] When opened from the icon, the **Add to home screen** button is gone.

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
