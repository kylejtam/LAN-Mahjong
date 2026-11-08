# LAN Mahjong

Hong Kong style mahjong for up to 4 players on a local network. Runs in the
browser, no app install.

- What the app should do: `mahjong-project-notes.md`
- How it is built and in what order: `mahjong-plan.md`
- Decisions made while building: `PROJECT_NOTES.md`

## Running the tests

You need Node.js installed (version 20 or newer).

```
npm install     # download the tools (first time only)
npm test        # run all automated tests
npm run typecheck   # check the code for type mistakes
```

## Folders

- `shared/` – the rules engine: tiles, wall, dealing, legal moves, winning hands, payments.
- `server/` – the game server (phase 2, not built yet).
- `client/` – the screens (phase 3, not built yet).
