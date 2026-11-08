# Hong Kong Mahjong Web App: Full Project Plan

Status: Plan draft (no code yet)
Owner: Kyle
Source of requirements: mahjong-project-notes.md

## 1. Important decision needed first: where the game server runs

The game needs one "server" program that keeps the game state and sends it to every device. The notes say the host device runs this server.

- A laptop can run a server program (Node.js) and keep it running.
- An iPhone, iPad, or Samsung tablet cannot run a server program that keeps going after the browser closes. Browsers stop background programs when the app is closed or the phone locks.

So the requirement "the game stays loaded on the host's device even if the webapp is closed" cannot work if the host is a phone or tablet.

Options:
- (A) Only laptops can host. Phones and tablets can join and play, but cannot create a game. Recommended: simplest and most reliable.
- (B) Build a small native app for iPhone and iPad (written in Swift) that can host. This is much more work and a different project (Apple developer account, app install on each device).
- (C) Phones and tablets can host, but the game only runs while the host's browser is open and the screen is awake. If the host closes the app, the game pauses and resumes when they reopen it.

Decision: Option C. Any device can host. When a phone or tablet host closes the app or locks the screen, the game pauses for everyone and resumes when the host reopens it.

What this means in practice:
- The full game state (tiles, balances, turn, undo history) is saved on the host's device, so it survives closing the app.
- While the host's app is closed, other players see "Host disconnected, waiting for host" and cannot act.
- When the host reopens the app, everyone reconnects to the same game and seat.
- Phones and tablets may pause the app after a short time in the background, so the host should keep the screen on during games. Laptop hosts keep running normally.
- The earlier requirement "the game stays loaded even if the webapp is closed" is replaced by this behaviour.

## 2. Plain-language overview of the tech

- Front end: the screens players see (buttons, tiles, layout). Written in TypeScript with React, a common tool for building web screens. It runs in any browser.
- Back end: the server that holds the real game state (tiles, balances, turns). Written in TypeScript and run with Node.js.
- Live connection: WebSockets. This keeps a two-way connection open so every device updates instantly when something happens.
- Shared rules: the same game-rule code runs on the server (to decide what is legal) and is used by the front end (to show only legal buttons).
- No database: nothing is saved between sessions, as you asked. Everything lives in memory on the host's server.

## 3. How devices find each other on the LAN (key technical risk)

Browsers cannot listen for network broadcasts, so a web page cannot "search the LAN" by itself. Options:

- (A) The host's server sends out a regular broadcast and each device's page listens through a tiny helper. Needs a helper program on each device, so not ideal.
- (B) The page scans the local network address range for the server (for example, all addresses from 192.168.1.1 to 192.168.1.254) and checks which ones answer. Works in browsers, but takes a few seconds.
- (C) Players type the host's address once, and the lobby lists games from that host only. Simple and reliable, but it means no automatic search.

Decision: (B), scanning the local network with a short timeout, plus a "type address" box as a backup.

Also: home-screen apps and some browser features may need a secure (https) connection. On a home network this needs a self-signed certificate, which causes a warning screen the first time. This needs testing on iPhone and Samsung.

## 4. Game structure

- Full game: 16 rounds (4 winds × 4 dealers per wind).
- Each round:
  1. Every player presses Start.
  2. The dealer rolls 3 dice (automatic if the dealer is a CPU).
  3. The dice decide where the wall splits.
  4. Tiles are dealt: dealer 14, others 13. Flowers (if on) are set aside and replaced.
  5. Dealer discards to begin.
  6. Turns continue until a win or a draw (wall empty).
- Dealer rotation: after a draw, the host's setting decides whether the dealer changes. Default: stays the same.

## 5. Tiles (the critical part)

- 34 tile types. With flowers: 4 copies of each (136) plus 8 unique flowers = 144. Without flowers: 136.
- Walls: 36 tiles each with flowers on, 34 each with flowers off.
- The server creates and shuffles the full set once per round and keeps it. Devices never create tiles. Each device only shows what the server sends, so tiles cannot be duplicated or lost.
- Automated test: at the start of every round, the server checks that the count and duplicates are correct. If not, it stops and reports an error. (A check like this is important to catch bugs early.)

## 6. Players, seats, and spectators

- Seats: 4, fixed around the table. Players choose a seat on joining. Taken seats are greyed out and show the player's name.
- Seat changes: only between rounds.
- Spectators: must have a display name. Can watch one player or all players. Can toggle visibility of each player's hand (if the player allows it).
- Swapping (settings):
  - Drop-out button → choose easy/medium/hard CPU or a spectator → confirm.
  - Spectator swap-in requires their confirmation before the swap happens.
- Host spectating: the host can give up their seat to a CPU and keep host controls.
- All-CPU mode: the game runs with 4 CPUs until a player joins or the host ends it.
- Disconnection:
  - A human who drops out keeps their seat and balance.
  - The host chooses: wait for them to reconnect, or fill the seat with a CPU.
  - Reconnecting with the same display name (not case sensitive) returns the player to their seat.

## 7. Identity and login

- No accounts or passwords. Display name is the login.
- Name matching ignores capitalisation.
- Changing a display name copies settings, balance, and login info to the new name.
- Logging in from another device with the new name counts as the same person.
- Name collisions: if a name is already in use in the same game, the app asks for another name.

## 8. Host controls

- Only the host can: reset balances, replace players, change room settings, change table colour, and end the game.
- If the host leaves, the first player who joined becomes host.
- If the host's device closes, the game saves on the host's device and resumes when they reopen it (dependent on decision in section 1).
- Ending the game requires two clicks (first click turns the button into a confirmation, second click ends the game and disconnects everyone).

## 9. Scoring

- Balance: plain chips, no currency symbol. Shown per player.
- Starting balance: set by the host when creating the game.
- Default payout (standard HK): everyone pays the winner, and the discarder pays double.
- Alternative payout: only the discarder pays.
- Self-draw (zimo) counts.
- Chicken win (below minimum fan): looks identical to a normal win. The winner pays 32 to each of the other three (96 total). No on-screen warning.
- Minimum fan: adjustable in game settings. Flowers: toggleable in game settings.
- Manual payout calculator: enter the result and the app computes the payout.
- Manual adjustments after a game: anyone can start one, and all players must agree before the game moves on.
- Chip total in top right with a lock button (prevents accidental changes during manual calculating).

## 10. Turns, actions, and undo

- Players drag a tile to the centre to discard. Drag within the hand to reorder.
- Action buttons (bottom right): 上 (chow), 碰 (pong), 槓 (gong), 胡 (win). Shown only when legal.
- The 胡 button is the same for normal and chicken wins.
- Undo (top left): only the current player (the player who must make the next move) can press it. It can undo any move, including wins.
- Undoing a win needs all players to agree.
- Multiple undos happen one at a time, most recent first.
- Hands are hidden during play. Spectators see them only if visibility is turned on.

## 11. After a win

- All players' hands are revealed to everyone.
- Fan count and a list of the winning criteria in each player's chosen language (English or Traditional Chinese).
- Total chips paid to the winner.
- Each player presses confirm before the next game begins.

## 12. Screens and layout

- Landscape only. Players add the app to their home screen so it opens full screen.
- Layout is the same for every player.
- Top centre: wind direction and player positions.
- Top left: undo.
- Top right: chip total with lock, then settings (to the right of chip total).
- Centre: discards and the wall (always visible).
- Bottom: player's hand. Bottom right: action buttons.
- Settings contains all player and host settings.
- Style: clean, flat, minimal.
- Theme: 3-part slider (Light, Dark, System). Default: Dark. Each player sets their own.
- Table felt: green by default. Host can change to black, white, red, or blue. Changes sync to everyone.
- Language: English or Traditional Chinese, per player.

## 13. Sound and extras

- One simple win sound. No sounds that reveal a hand.
- No chat box, no turn timers, no saved game history, no gameplay tutorial.
- Controls tutorial: short, shows how to discard, reorder, and use action buttons and undo.

## 14. CPU players

- Difficulty: easy, medium, hard.
- Fill empty seats and replace dropped players.
- The CPU logic runs on the server.
- Exact behaviour per difficulty is to be designed in a later phase.

## 15. Build order (phases)

1. Rules engine: tile set, shuffling, dealing, legal moves, win checking, HK scoring. Test with automated tests (tile counts, duplicates, scoring cases).
2. Game server: rounds, turns, undo, full 16-round game, host controls, reconnection, LAN game list.
3. Basic interface (one table): tiles, discards, action buttons, landscape layout.
4. Lobby and joining: start screen, create game, seat selection, spectators.
5. Settings: language, theme, table colour, scoring options, flower and minimum fan, dealer rule, swap players, end game.
6. Win summary and manual payouts with multi-player confirmation.
7. CPU players (easy, medium, hard).
8. Testing on iPhone, iPad, Samsung tablet, and laptop on a real LAN.
9. Controls tutorial and home-screen install instructions.

## 16. Testing checklist

- Tile counts: 144 with flowers, 136 without, correct duplicates each round.
- Dealing: 14 for dealer, 13 for others, flowers replaced.
- Undo: single undo, multiple undos in order, undoing a win needs all agreement.
- Chicken win: pays 96 total from winner, no visible warning.
- Reconnect: same name returns to same seat and balance.
- Name change: balance and settings follow the new name.
- Host leaves: first joined player becomes host.
- Spectator swap: requires spectator confirmation.
- All-CPU mode runs until a player joins or the host ends the game.
- End game: needs two clicks.
- Two devices, four devices, and spectators all see the same state.

## 17. Open decisions

1. Where the server runs: decided, Option C (any device can host; game pauses when a phone or tablet host closes the app).
2. How devices find games on the LAN: decided, network scan with a type-in backup (section 3).
3. Secure connection: decided, accept the one-time certificate warning on your home network (section 3).
