# LAN Mahjong

Hong Kong style mahjong for up to 4 players on a local network. Runs in the
browser, no app install.

- What the app should do: `mahjong-project-notes.md`
- How it is built and in what order: `mahjong-plan.md`
- Decisions made while building: `PROJECT_NOTES.md`

## Installing on the Windows laptop

1. Download the installer: <https://github.com/kylejtam/LAN-Mahjong/releases/latest/download/LAN-Mahjong-Setup.exe>
   (all versions: <https://github.com/kylejtam/LAN-Mahjong/releases>).
2. Double-click **LAN-Mahjong-Setup.exe** and click through it
   (if Windows says "Windows protected your PC": **More info → Run anyway**).
3. Double-click the **LAN Mahjong** icon on the desktop. A small window opens (keep it
   open while playing; close it to stop the game) and the host page opens in the browser.
4. Phones and tablets on the same Wi-Fi scan the QR code on the host page.

Uninstall from the Start menu (LAN Mahjong → Uninstall LAN Mahjong) or Settings → Apps.
Saved games live in `%LOCALAPPDATA%\LAN Mahjong` and are kept when you update.

**Updates are automatic:** each time LAN Mahjong starts, it checks GitHub for a newer
release. If there is one, it downloads it, checks its fingerprint, installs it quietly and
restarts by itself (before anyone joins). The version number is shown on the host page
and the join screen.

## Making a release

Raise the `version` in `package.json` (for example 1.1.0 → 1.2.0) and merge it into
`main`. GitHub (`.github/workflows/release.yml`) then runs the checks, builds
`LAN-Mahjong-Setup.exe` and publishes it as release `v1.2.0` with its SHA-256 fingerprint.
To add your own words to a release, put them in `docs/release-notes/v1.2.0.md`; they appear above the automatic list of changes.
The installer is no longer stored in the code itself.

## For developers: running from the code

You need Node.js (version 20 or newer).

```
npm install     # download the tools (first time only)
npm start       # build the screens and start the game server
npm run build:windows   # rebuild LAN-Mahjong-Setup.exe (needs NSIS / makensis)
```

The **host page** is `http://localhost:3000/host` on the laptop itself (it does not open
on other devices). Settings: `PORT=4000 npm start` uses a different port.

## Running the tests

You need Node.js installed (version 20 or newer).

```
npm install     # download the tools (first time only)
npm test        # run all automated tests
npm run typecheck   # check the code for type mistakes
```

## Folders

- `shared/` – the rules engine: tiles, wall, dealing, legal moves, winning hands, payments.
- `server/` – the game server: rounds, full games, rooms, CPU players, network, saving.
- `client/` – the screens: the game table (players) and the host page (laptop).
- `docs/screenshots/` – pictures of the screens.
- `docs/TESTING-CHECKLIST.md` – step-by-step setup on a Windows laptop and what to test on each device.
- `windows/` – the Windows installer recipe, start-up file and icon; `scripts/build-windows.sh` builds the installer.
