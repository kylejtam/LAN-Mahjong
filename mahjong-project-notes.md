# Hong Kong Mahjong Web App: Project Notes

Status: Plan written (see mahjong-plan.md). No code yet.
Owner: Kyle

## Overview
A webapp for playing Hong Kong style mahjong with up to 4 players. Hosted on one device on the local network (LAN). No internet or accounts required.

## Tile set (critical)
- Tiles must stay in sync across all devices.
- The correct number and duplicate counts must always be maintained.
- With flower tiles: 144 tiles total.
  - Each different tile type has 4 identical copies.
  - 8 flower tiles in total (each flower tile is different, one of each).
  - Each player's wall: 36 tiles (144 ÷ 4).
- Without flower tiles (when toggled off in game settings): 136 tiles total. The 8 flower tiles are removed.
  - Each player's wall: 34 tiles (136 ÷ 4).
- The host device's server is the single source of truth for all tiles. Other devices only display what the server sends. No device can create or lose a tile.

## Opening the app (start screen)
- On opening, the webapp searches the LAN for existing games.
- Text box for display name (this is the login).
- Below the text box: "Create game" button and a list of all existing games found on the LAN.
- Spectators also need a display name to watch.

## Creating a game
- Press "Create game" and enter:
  - A game name. The game name lets other devices tell the games apart.
  - Starting balance (set by the host).
- Each game in the list shows its current state:
  - Current wind direction (for example, East).
  - Game number within that wind (for example, game 2).

## Full game structure
- A full game is all 4 winds, with each of the 4 players being the dealer once per wind.
- Total: 16 rounds.
- Rounds with no winner (a draw): the host chooses in settings whether the dealer advances or stays the same for the next round. Default: stays the same.

## Round start sequence
1. Each player presses Start on their own device.
2. The round begins once all players have pressed Start.
3. The dealer swipes the 3 dice to the centre of the screen to roll them. If the dealer is a CPU, the dice roll happens automatically.
4. The dice result decides where the wall is split for dealing (standard HK rules).
5. Tiles are dealt automatically.
   - The dealer receives 14 tiles.
   - Each other player receives 13 tiles.
   - With flowers on, flower tiles drawn during dealing are set aside and replaced from the wall.
6. Each player's hand appears on their own device only.
7. The dealer starts their turn by discarding one tile.

## Players and seats
- Up to 4 seats. The host also plays.
- Players choose their seat when joining. The square table has 4 seats.
- Filled seats cannot be selected. The name of the player in each filled seat is visible.
- Players can move to another empty seat if they want, but not in the middle of a round.
- Empty seats can be filled by CPU players (bots).
- CPU difficulty: easy, medium, hard.
- Players sit next to each other in person. Playing on separate devices.
- A player who drops out or is replaced keeps the balance of the seat/name (the balance does not reset).
- Spectators can watch: choose one player to watch, or all players.
- Each player's visibility (hand) can be toggled for spectators.
- Reconnecting: same display name = same player. Not case sensitive.

## Host spectating (all 4 CPUs)
- The host can drop out of their seat and replace it with a CPU. The host then becomes a spectator.
- The host keeps all host controls while spectating.
- If all 4 seats are CPUs, the game keeps running on its own, with 4 CPUs playing.
- The game continues this way until either a player joins again or the host ends the game.

## Human player leaves
- The host chooses: wait for the human to reconnect, or fill the seat with a CPU.

## Swapping players (in settings)
- Drop out button: the player chooses a replacement, then presses confirm.
- Replacement options: easy, medium, or hard CPU, or any spectator.
- If the replacement is a spectator, that spectator gets a prompt to confirm they want to swap in.
- The swap only happens after the spectator confirms.

## Login
- No usernames, no passwords, no accounts.
- Display name is the login.

## Changing display name
- A player can change their display name in the settings.
- When they change it, their settings, balance, and login info are copied over to the new name.
- If the player disconnects and logs in from a new device using the new name, it counts as the same person.

## Room and host
- The person who creates the room is the host.
- Only the host can: reset balances, replace players, and change room/admin settings.
- If the host leaves, the first player who joined becomes the host.
- Any device can host. The game state is saved on the host's device.
- If the host's app is closed or the screen locks, the game pauses for everyone. When the host reopens the app, everyone reconnects to the same game and seat.
- Host should keep the screen on during games (phone and tablet hosts).
- Host can end the game and disconnect everyone (in settings). This needs two clicks: the first click turns the button into a confirmation button, and the second click ends the game.

## Devices
- Players: iPhone, iPad, Samsung tablet, laptop. Must work in a browser, with no app install.
- Host device can be any of the above.
- Screen layout is the same for all players.

## Home screen install and landscape
- Players add the app to their home screen so it opens full screen.
- The app is always shown in landscape (sideways) mode.

## Language
- Each player can choose English or Traditional Chinese on their own device.
- Each player's choice applies only to their own screen.

## Rules (Hong Kong style)
- Standard HK rules. Detailed rules to be reviewed later.
- Flower tiles: included, toggleable in game settings.
- Minimum fan: adjustable in game settings.
- Self-draw win (zimo) counts.
- Chicken win (when the minimum fan is not met): the chicken win button is the same as the normal win button and looks identical to it. The winner pays 32 to each of the other 3 players (96 total). The game shows no sign that it is not a real win.

## Money / points
- Balance (money points, shown as plain chips with no currency symbol) tracked throughout the game.
- Balance is shown for each player.
- Chip total shown in the top right corner, with a lock button. The lock prevents accidental changes while in manual calculating mode.
- Default payout (standard HK): everyone pays the winner, and the player who discarded the winning tile pays double.
- Alternative payout setting: only the player who discarded the winning tile pays.
- Manual payout calculator: enter the result and the app works out the payout.

## Top bar
- Top centre: wind direction and player positions.
- Top left: undo button.
- Top right: chip total with lock button, then settings button (to the right of the chip total).
- All player and host settings live under the settings button.

## Table centre
- All discarded tiles stay visible in the middle of the table for the whole hand.
- The wall is always visible on the screen.

## Gameplay controls
- Discard: drag a tile to the middle of the table.
- Reorder: drag a tile within your hand.
- Action buttons (bottom right): 上 (chow), 碰 (pong), 槓 (gong), 胡 (win).
- Action buttons only appear when that move is legal.
- Your hand is hidden from other players during play (spectators only see it if visibility is on).
- Undo button (top left): available to all players. Only the current player (the player who has to make the next move) can press it.
- Undo can go back over any player move, including wins.
- Undoing a win requires all players to agree.
- Multiple undos happen most recent first. Example: Player 1 makes a move, then Player 2 makes a move, and it is now Player 3's turn. If Player 1 wants to undo, Player 3 presses undo (undoing Player 2's move), then Player 2 presses undo (undoing Player 1's move). Then Player 1 makes a new move.
- Controls tutorial wanted. No gameplay tutorial.

## After a win (win summary)
- Show all players' hands to everyone.
- Show the number of fan.
- Show a list of all winning criteria, shown in the player's chosen language (English or Traditional Chinese).
- Show the total chips paid out from all players to the winning player.
- Every player must press confirm before the next game starts.
- Manual adjustment of winnings: anyone can start it, and all players must agree to the change before the game moves on.

## Look and feel
- Clean, flat, minimalistic style.
- Theme setting: a 3-part slider with Light, Dark, and System (follows the device's light or dark setting).
- Default theme: Dark. Each player sets their own theme.
- Table felt colour: green by default. Host can change to black, white, red, or blue. Change syncs to everyone.

## Features NOT wanted (for now)
- No chat box.
- No turn timers.
- No saved game history.
- No gameplay tutorial (controls tutorial only).
- Sound: simple win sound only. No sounds that reveal a hand.

## Open questions
- None right now.

## Technical plan (see mahjong-plan.md)
- Language: TypeScript.
- Server: Node.js, runs on whichever device hosts.
- Frontend: web pages that work in any modern browser.
- Live sync: WebSockets (real-time connection between devices).
