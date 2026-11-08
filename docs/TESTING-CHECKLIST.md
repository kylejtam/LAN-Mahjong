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

### On the host page (laptop)
- [ ] Create a game (name + starting balance).
- [ ] Put CPU players in some seats (try easy, medium and hard).
- [ ] Change "CPU time per move" (try 0.5 and 3) and see the CPUs speed up and slow down.
- [ ] Change the table colour; check every device changes too.

### On each player device
- [ ] Type a name and tap **Join**. Tap a seat, then **Start**.
- [ ] Turn the device upright: it asks you to turn it sideways. Turn it back.
- [ ] Dealer only: **swipe the dice** to the middle.
- [ ] **Drag** a tile from your hand to the middle to discard.
- [ ] **Drag** the glowing wall tile into your hand to draw.
- [ ] **Drag** tiles within your hand to reorder them.
- [ ] When the buttons flash, try **Pèng / Shàng / Gàng / Hú**, and also try
      tapping the discarded tile instead.
- [ ] Try **Undo** after a discard (only the player whose turn it is can).
- [ ] Open **?** (Help) and check both tables are readable.
- [ ] Open **⚙** (Settings): switch to **中文**, change the theme, change your name.
- [ ] Play a round to the end and check the summary (winning conditions, + / −
      chips, total transferred). Everyone presses **Confirm**.

### Leaving and coming back
- [ ] **Lock** a phone for 30 seconds, then unlock it. It should reconnect by itself.
- [ ] **Close** the browser tab, open the address again, and join with the **same
      name** (try different capitals, e.g. "kyle"). You should get your seat back.
- [ ] On another device, tap **Spectate**, then try **All hands** and the eye buttons.
- [ ] On the host page: set someone's chips, use **Roll back to before this**
      on a finished game, and **Change current game**.
- [ ] **Restart the server:** in the black window press **Ctrl + C**, then run
      `npm start` again. Every device should reconnect to the same game and seats.
- [ ] On the host page: **End game** (two taps). Every device should be told.

### Home screen (optional for now; full instructions come in phase 9)
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
