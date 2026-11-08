# Phase 8: testing on real devices (Windows host)

Tick each box as you go. If something goes wrong, see "What to send me" at the end.

## Part A: set up the Windows laptop (once)

- [ ] **Install Node.js.** Go to <https://nodejs.org>, download the **LTS** version
      for Windows, and run the installer. Click Next through every step (the
      default choices are fine).
- [ ] **Sign in to GitHub** on the laptop's browser (github.com → Sign in).
      The project is private, so GitHub shows "404 Not Found" until you are signed in.
- [ ] **Download the game.** Go to <https://github.com/kylejtam/LAN-Mahjong>.
      1. Click the branch button near the top left (it says **main**) and choose
         **claude/nice-sagan-boolsz**. (The game is on this branch; *main* only has
         the two planning files.)
      2. Click the green **Code** button → **Download ZIP**.
- [ ] **Unzip it.** Right-click the ZIP file → **Extract All…** → **Extract**.
      You get a folder called `LAN-Mahjong-claude-nice-sagan-boolsz`.
- [ ] **Open a command window in that folder.** Open the folder, click the
      address bar at the top, type `cmd`, and press Enter. A black window opens.
- [ ] **Install the game's tools.** In the black window, type this and press Enter:

      npm install

      Wait until it finishes (a minute or two). Some yellow "warn" lines are normal.
- [ ] **Make sure your Wi-Fi is a "Private" network.** Windows Settings → Network &
      internet → Wi-Fi → click your network → set **Network profile type** to
      **Private**. (On "Public", Windows blocks other devices from joining.)
- [ ] **Stop the laptop going to sleep** while you play: Settings → System →
      Power → Screen and sleep → set "When plugged in, put my device to sleep
      after" to **Never**. Keep the laptop plugged in.

## Part B: start the server (every time you play)

- [ ] In the black window (in the game folder), type `npm start` and press Enter.
- [ ] **If Windows shows a firewall box** ("Windows Defender Firewall has blocked
      some features of Node.js"): tick **Private networks**, then click **Allow**.
- [ ] The window shows an address like `http://192.168.1.20:3000`. Leave this
      window open the whole time you play. (Closing it stops the game.)
- [ ] On the laptop, open a browser and go to `http://localhost:3000/host`.
      This is the **host page**. You should see a QR code.

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

### Home screen (full instructions come in phase 9)
- [ ] iPhone/iPad: Safari → Share → **Add to Home Screen**. Open it from there.
- [ ] Samsung: Chrome → ⋮ menu → **Add to Home screen**. Open it from there.

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
- **"npm is not recognized":** restart the laptop after installing Node.js, then try again.
- **"'vite' is not recognized" (or "tsx" / "not recognized")** when running `npm start`:
  the tools aren't installed in this folder yet. Run `npm install` first. Every newly
  downloaded folder needs its own `npm install`.
- **"running scripts is disabled on this system":** you're in PowerShell. Use the
  black `cmd` window from Part A instead, or type `npm.cmd start`.
- **"address already in use":** the server is already running in another window.
  Close the other window, or start on another port with `set PORT=4000 && npm start`.
