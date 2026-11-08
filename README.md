# LAN Mahjong

Hong Kong style mahjong for up to 4 players on a local network. Runs in the
browser, no app install.

- What the app should do: `mahjong-project-notes.md`
- How it is built and in what order: `mahjong-plan.md`
- Decisions made while building: `PROJECT_NOTES.md`

## Starting the server (on the laptop)

You need Node.js installed (version 20 or newer).

```
npm install     # download the tools (first time only)
npm start       # build the screens and start the game server
```

The window shows an address such as `http://192.168.1.20:3000`. Open that
address on any device on the same Wi-Fi, or open it on the laptop to show a
QR code that other devices can scan. Keep the window open while playing;
press Ctrl+C to stop. Games are saved to `data/games.json` and carry on after
a restart.

**Host page:** on the laptop itself, open `http://localhost:3000/host` to
create games and use host controls (CPU players, settings, table colour,
balances, ending a game). It does not open on other devices. If you want to
play on the laptop too, open the normal address in another browser tab and
join like everyone else.

Settings: `PORT=4000 npm start` uses a different port.

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
