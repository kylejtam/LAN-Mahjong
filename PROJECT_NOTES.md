# LAN Mahjong: Project Notes (decision log)

This file records decisions made while building. The "what" lives in
`mahjong-project-notes.md` and the "how" in `mahjong-plan.md`. If this file
disagrees with those, the newest dated entry here wins.

## Current status

- Phase 1 (rules engine): **done**. Tile set and checks, shuffle, wall and dice
  break, dealing with flower replacement, winning-hand check, legal
  chow/pong/gong/win, two-winner rule, fan counting, payments.
- Tests: 233 passing (`npm test`), including 60 rounds of random play that check no tile is ever lost or created.
- Phase 2 (game server): **done**.
  - Step 1 round engine (`server/src/game/round.ts`): **done**.
  - Step 2 full 16-round game (`server/src/game/match.ts`): **done**.
  - Step 3 room: players, seats, host, spectators, swaps, renames, start
    sequence, confirmations, what each device may see (`room.ts`, `view.ts`): **done**.
  - Step 3 also adds a TEMPORARY simple CPU (`cpu.ts`) so CPU seats and
    all-CPU tables work. Phase 7 replaces it with easy/medium/hard.
  - Step 4 network (`server.ts`): WebSockets, game list, start page with
    QR code and address, saving to `data/games.json`: **done**. Start with `npm start`.
- Phase 3 (basic interface): **done**. Game table, drag to draw/discard/reorder,
  action buttons, claim by tapping the discard, dice swipe, seat picker, Help
  panel, round-end screen, simple settings (drop out, leave), basic join
  screen, and the host page. Screenshots in `docs/screenshots/`.
- Phase 4 (lobby, joining, spectators): **done**. Spectate button in the
  middle of the seat picker; "All hands" view for spectators.
- Phase 5 (player settings): **done**. Settings panel with name change,
  language (English / Hong Kong Chinese) and theme slider (Light / Dark /
  System). Host settings live on the host page (done in phase 3).
- Phase 6 (win summary): **done**. Winning conditions with fan each and a
  total; every hand with shown sets and flowers; each player's chips with
  + / − signs (winner highlighted); total chips transferred; everyone
  confirms. Manual chip changes are on the host page.
- Phase 7 (CPU players): **done**. Easy / medium / hard in `server/src/game/cpu.ts`,
  level descriptions and CPU time per move on the host page.
- Phase 8 (testing on real devices on a real LAN): **in progress**. Kyle is
  testing with a Windows laptop as host. Checklist: `docs/TESTING-CHECKLIST.md`.

## Decisions

| Date | Decision | Who |
|------|----------|-----|
| 2026-11-08 | Project layout: one repository with three parts: `shared/` (rules engine, used by both sides), `server/` (Node.js game server), `client/` (browser screens). | Claude (Kyle may change) |
| 2026-11-08 | Automated tests use **Vitest**, a common TypeScript testing tool. Run them with `npm test`. | Claude (Kyle may change) |
| 2026-11-08 | Tile codes in the code: `m1`–`m9` characters 萬, `p1`–`p9` dots 筒, `s1`–`s9` bamboo 索, `wE wS wW wN` winds, `dR dG dW` dragons 中發白, `f1`–`f4` flowers 梅蘭菊竹, `n1`–`n4` seasons 春夏秋冬. | Claude |
| 2026-11-08 | Seats are numbered 0–3 in turn order. Wall break: dice total counts seats from the dealer (dealer = 1); in that wall, count that many stacks from the right end; draws start after them. Replacement tiles come from the back end. | Claude (standard HK) |
| 2026-11-08 | Dealing: 3 rounds of 4 tiles each, then 1 each, then 1 extra for the dealer. Flowers replaced from the back, dealer first, repeating until no hand has a flower. | Claude (standard HK) |
| 2026-11-08 | Tile safety: the full set is checked right after shuffling and again after dealing. If anything is wrong the round stops with an error. | Claude |
| 2026-11-08 | **Chicken win** = a valid winning hand below the minimum fan. The winner pays 32 to each of the other 3 players (96 total). Same for self-draw or discard. | Kyle |
| 2026-11-08 | **Minimum fan** is a host setting. **Default 1.** (Code: `DEFAULT_SETTINGS` in `shared/src/settings.ts`.) | Kyle |
| 2026-11-08 | **Fan to chips table** approved (half-spicy, cap 10 fan = 128). Anything above 10 fan pays as 10. | Kyle |
| 2026-11-08 | **Payout, default mode:** discarder pays 2 × base, the other two pay 1 × base each. | Kyle |
| 2026-11-08 | **Payout, self-draw:** each of the other 3 players pays 2 × base. | Kyle |
| 2026-11-08 | **Payout, "only discarder pays" mode:** discarder pays 4 × base (example: 3 fan → 4 × 8 = 32). Self-draw in this mode pays the same as normal self-draw (no discarder exists). | Kyle / Claude (self-draw part) |
| 2026-11-08 | **Two winners on one discard:** standard HK 截糊. The next player in turn order after the discarder who can win gets priority (example: West discards, North and South can win → North). | Kyle |
| 2026-11-08 | **Win priority window:** the priority player has 10 seconds to tap 胡. The timer is NOT shown. If they don't tap in time, the next eligible player may win. (Exception to "no turn timers"; built in phase 2.) | Kyle |
| 2026-11-08 | **Fan list confirmed** by Kyle (table below). | Kyle |
| 2026-11-08 | Fan combining: 小三元 / 大三元 replace the separate dragon pong fan; 小四喜 replaces seat/round wind fan; 一台花 (2) replaces the 正花 from that set; 清一色 replaces 混一色; cap hands score 10 and nothing is added. When a hand can be split more than one way, the highest-scoring split is used. | Kyle (confirmed) |
| 2026-11-08 | 坑坑胡 (all concealed pongs): no claimed sets; on a discard win the discard must finish the pair. 門前清 still counts with a concealed gong. | Claude (standard HK) |
| 2026-11-08 | **New feature: Help button** in the top bar, immediately left of the settings button. Opens a screen showing the fan table and the fan to chips table. Built in phase 3; table contents live in `shared/src/fanTable.ts` and a test checks they match the scoring code. | Kyle |
| 2026-11-08 | **Hosting (option a):** a laptop runs the game server in the background. (Host controls later moved to the laptop's host page, see below.) The server's laptop does not have to be a player. No app install. Replaces plan section 1 option C. An iPhone/iPad host app may be added later. | Kyle |
| 2026-11-08 | **Host disconnects:** (superseded by the host page decision) the game never pauses for the host. | Kyle |
| 2026-11-08 | **Drawing is manual:** a player drags a tile from the end of the wall into their hand. | Kyle |
| 2026-11-08 | **Claiming a discard:** no pass button. 上 碰 槓 胡 buttons stay available until the next player draws. They are big and flashing. A player can also claim by tapping the discarded tile. | Kyle |
| 2026-11-08 | **3-second grace period:** for 3 seconds after the next player draws, another player can still claim the discard. The draw is undone (tile goes back to the wall) and the claim happens. | Kyle |
| 2026-11-08 | **Stronger claims after the fact:** claims happen straight away and play continues. A stronger claim can still take the tile; the game jumps back to the discard and gives it to them. 碰/槓 can take over 上 within 3 s; 胡 can take over any other claim (including a lower-priority 胡) within 10 s. Hidden timers. | Kyle (timings: Claude's reading of Kyle's rules) |
| 2026-11-08 | **Claim windows end at the next discard.** No discard lock during the grace period. | Kyle |
| 2026-11-08 | **Replacement draws are manual** (drag from the back end of the wall) and forced: you cannot discard until you have drawn it. Flowers drawn during play go to the flower area automatically. | Kyle |
| 2026-11-08 | Round engine details: a draw game happens when the next player tries to draw from an empty wall (so the 3 s grace still applies to the last discard). Robbing a gong 搶槓: others may 胡 on an added gong tile until 3 s after the gong player draws the replacement. Self-draw 胡 is only allowed straight after drawing. The full tile set is re-checked after every single move. | Claude |
| 2026-11-08 | **Name already in use:** joining with a name that is currently connected is refused ("choose another name"). The same name while that person is disconnected reconnects them. | Claude (from plan section 7) |
| 2026-11-08 | **Spectator hand view (updated):** all hands are hidden from spectators at first. Each SPECTATOR chooses which players' hands they see (players do not control this). All hands are shown to everyone when a round ends. | Kyle |
| 2026-11-08 | **Host page on the laptop (replaces the "host player"):** all host controls live on a host page that only opens on the laptop running the server (`http://localhost:3000/host`). It creates games and does: CPU seats, replace players, settings, table colour, reset balances, end game. Devices on the network are refused. Every player, including the laptop owner if they want to play, simply joins a game the same way. There is no host among the players, so "host leaves → first player becomes host" no longer applies. | Kyle |
| 2026-11-08 | **Start screen:** no "Create game" button for players; they see the game list and join. | Kyle (follows from host page) |
| 2026-11-08 | **Taking over a CPU seat:** between rounds a player may sit in a CPU's seat (the CPU leaves). This is how a player rejoins an all-CPU game. The host page can also replace any player with a CPU; that player becomes a spectator. | Claude (Kyle may change) |
| 2026-11-08 | **Leaving the game:** the person keeps their seat (shown as disconnected) until they come back or the host page fills it with a CPU. | Claude (from notes) |
| 2026-11-08 | **Round end:** balances change only after every seated human presses confirm. CPUs never hold up a round. The host can only empty a seat between rounds. | Claude |
| 2026-11-08 | **Server start:** `npm start` on the laptop. It prints the address(es) to open; the start page shows a QR code. Port 3000 by default. Games are saved within half a second of every change. | Claude |
| 2026-11-08 | **Tile look:** drawn in code (no image files), clean flat style, conventional colours: dots in blue/green/red, bamboo in green with red accents (1 bamboo is a bird), characters with a red 萬, dragons 中 red / 發 green / 白 blue frame, winds dark. | Kyle |
| 2026-11-08 | **Action button labels:** English mode shows pinyin (Shàng, Pèng, Gàng, Hú); Chinese mode shows 上 碰 槓 胡. Screens are built in English first; the Chinese option arrives in phase 5. | Kyle |
| 2026-11-08 | **Phase 3 includes** a simple host page (create game, seats/CPUs, end game) and a basic join screen, so a game can actually be played. Both are polished in phases 4–5. | Kyle |
| 2026-11-08 | **Screen tech:** React + Vite. `npm start` builds the screens and starts the server, which sends them to each device. | Claude |
| 2026-11-08 | **Screen layout:** your seat is always at the bottom; next player on the right, opposite at the top, previous on the left. Each player's discards sit in front of them in the middle; the newest discard is outlined in yellow. The tile to draw glows yellow on the wall. | Claude (Kyle may change) |
| 2026-11-08 | **Spectator view:** a spectator sees the table from seat East's side by default; tapping a player's panel moves that player to the bottom. The eye button on a player shows/hides their hand. | Claude (Kyle may change) |
| 2026-11-08 | **Spectator "All hands":** a button for spectators opens a screen showing only the 4 hands (tiles, flowers and shown sets). It does not change which single hands the spectator chose to reveal on the table. | Kyle |
| 2026-11-08 | **Spectate button** in the middle of the seat picker: anyone can start watching straight away (a seated player who taps it leaves their seat). Spectators get a "Take a seat" button between rounds. | Kyle |
| 2026-11-08 | **CPUs only from the host page.** New games start with all 4 seats empty. Players can never add a CPU. "Drop out" in a player's settings just frees the seat (the player becomes a spectator and keeps their chips). During a round the empty seat keeps its tiles and the game waits on it until the host page adds a CPU. Swapping with a spectator (who must confirm) is still available. | Kyle |
| 2026-11-08 | **8 bamboo:** outer sticks straight up; the middle four lean to make an M (top) over a W (bottom). | Kyle |
| 2026-11-08 | **Flower and season tiles show pictures, not words.** Flowers (the "Four Gentlemen"): plum blossom, orchid, chrysanthemum, bamboo. Seasons have no standard picture, so: spring peach blossom, summer lotus, autumn maple leaf, winter snowflake. Each shows a big number 1–4 in the top-left corner (red for flowers, blue for seasons). Preview: `docs/screenshots/flower-tiles.png`. | Kyle (season pictures: Claude, Kyle may change) |
| 2026-11-08 | **1 bamboo** is drawn as a flat peacock (crest, fanned tail with eye spots) instead of the earlier simple bird. | Kyle |
| 2026-11-08 | **Chinese wording:** Traditional Chinese with Hong Kong (Cantonese) table wording, e.g. 食糊, 出銃, 自摸, 流局, 雞糊, 爆棚. Server messages are translated on the device. CPU names show as 電腦東/南/西/北. | Kyle |
| 2026-11-08 | **Player settings panel** (⚙): change name (type + Save; chips, seat and settings move to the new name), language (English / 中文), (theme removed later: always dark), drop out, leave game. Language and theme are saved on the device AND under the player's name on the server, so they follow the name to another device. The language can also be chosen on the start screen. | Kyle |
| 2026-11-08 | **Manual chip changes: host page only.** Removed from the players' app: the manual payout calculator, manual adjustments with everyone agreeing, and the chip lock button (it only existed for manual calculating). The host page has a chip box for every person in a game: type the number, press Set, and it updates on every device at once. Automatic payouts after a win, and everyone confirming the round, stay as they are. | Kyle |
| 2026-11-08 | **Win summary:** lists every winning condition (番種) with its fan and the total; shows each player's hand, shown sets and flowers; each player's chips as +N (green) or −N (red); and "Total chips transferred". The two seat-flower items are labelled (flowers) / (seasons) so they can be told apart. | Kyle |
| 2026-11-08 | **Host page: history and roll back.** Every finished hand is recorded (game, result, chip changes, everyone's chips before it). "Roll back to before this" puts chips (including manual changes made since), wind and dealer back to just before that hand and removes the later hands. Two taps to confirm. Any round in progress is cancelled. | Kyle |
| 2026-11-08 | **Host page: change the current game.** Pick a wind and game number (1–4) and press Go (two taps). Game n of any wind is dealt by seat n (seat 1 = first dealer). Chips are not changed; any round in progress is cancelled. | Kyle |
| 2026-11-08 | **CPU levels:** Easy sometimes throws a random tile and never claims 上 碰 槓. Medium keeps the tiles that bring it closest to winning (and leave the most ways to finish), claims 上 碰 槓 when that helps, makes gongs. Hard plays like Medium, steers toward bigger hands, and near the end of the wall stops chasing a hand it cannot finish and throws the safest tiles. Descriptions are shown as bullet points on the host page. | Kyle (details: Claude) |
| 2026-11-08 | **CPUs never declare a chicken win** (any level). They only win at or above the minimum fan. | Kyle |
| 2026-11-08 | **CPU fair play:** CPUs only use what a real player in their seat could see (own tiles + everything face up). A test changes everyone else's hidden tiles and the wall and checks the CPU's move does not change. | Claude |
| 2026-11-08 | **CPU time per move** is an editable number of seconds on the host page, per game (0.2–30 s, default 1 s). It is the same for every CPU level. Can be changed any time. | Kyle |
| 2026-11-08 | **CPU strength (about 1,500 simulated hands):** easy wins ~13% against easy players; medium and hard win about two thirds of hands against easy players, hard collecting the most chips; against medium players hard is only slightly better (fewer chips lost). | Claude (measured) |
| 2026-11-08 | **Host laptop is Windows.** Setup: install Node.js LTS, download the branch ZIP, `npm install`, `npm start`; Wi-Fi set to Private and Node.js allowed through the firewall. Saving falls back to a direct write if Windows locks the file. | Kyle |
| 2026-11-08 | **iPhone fixes (from Kyle's first test):** a big glowing Draw / Replacement tile appears in the middle of the table to drag into your hand (the wall can be tiny on a phone); other players' hidden tiles show as one tile back with a count (×13) so their shown sets and flowers can be bigger; your own sets and flowers are bigger too. Checked on iPhone SE, 13 and 15 Pro Max sizes, including a short Safari window. | Kyle |
| 2026-11-08 | **Undo with CPUs:** when it is a CPU's (or an empty seat's) turn, any seated player can press Undo. After an undo, CPUs wait 5 seconds so players can undo again. | Kyle |
| 2026-11-08 | **CPU hands are shown sorted** (characters 1–9, dots 1–9, bamboo 1–9, winds, dragons) wherever they are visible. | Kyle |
| 2026-11-08 | **All-CPU tables:** at the end of each hand the game waits until at least one spectator presses "Confirm – next hand". With nobody watching, it carries on by itself. | Kyle |
| 2026-11-08 | **Public tiles left of private tiles.** Your shown sets and flowers sit in the same row as your hand, to their left; the row sizes itself so everything always fits on one line (public tiles a bit smaller than hand tiles). Your name tag sits under the row, next to the hint. Other players show name, then public tiles, then the hidden-tile count. | Kyle |
| 2026-11-08 | **Discards always fit.** Side players get tall discard areas; top and bottom share the middle. The discard tile size is calculated from the space and the number of discards, so every discard stays visible (checked with 80 discards on iPhone SE / 13 / short Safari). | Claude (fix for Kyle's report) |
| 2026-11-08 | **Hands are sorted automatically**, left to right: the three suits from the one you hold fewest of to the one you hold most of (ties: characters, dots, bamboo), each 1→9; then winds East, South, West, North; then dragons, fewest of a dragon first, most last (ties 中 發 白). Applies to every hand shown (yours, CPUs', spectators', end of round). You can still drag tiles into your own order on your device; it goes back to sorted at the start of each hand. Rule lives in `shared/src/sort.ts`. | Kyle |
| 2026-11-08 | **The tile you just drew** sits a little apart on the far right (yellow outline) until you discard. The Draw / Replacement tile in the middle can be **tapped** or dragged. | Kyle |
| 2026-11-08 | **Wall removed from the screen** to save space; the middle shows the tiles-left count and the Draw tile. **Dice** move next to the dealer's name once the hand starts. | Kyle |
| 2026-11-08 | **Swaps:** the player who asked sees "Waiting for … to answer" with a Cancel button, and is told if the spectator declines (or accepts). | Kyle |
| 2026-11-08 | **Empty seats:** a spectator can sit in an empty seat straight away, even mid-round (taking over that seat's tiles), using the "Sit here" button. Seated players still change seats only between rounds; CPU seats still need the host. | Kyle |
| 2026-11-08 | **Host can remove a CPU at any time** ("Remove CPU" on the host page) so a player can sit there; mid-round the empty seat keeps its tiles and the game waits. | Kyle |
| 2026-11-08 | **Win summary:** "Total chips transferred" removed; the winner's hand is grouped by set (runs and pongs together, a gap only between sets); winning conditions in the chosen language only. | Kyle |
| 2026-11-08 | **Other players:** no hidden-tile count; only public tiles (shown sets, flowers) unless a spectator presses Show. Left and right players' tiles (and their discards) lie sideways in columns, wrapping into more columns when long. | Kyle |
| 2026-11-08 | **Spectator buttons** say "Show" / "Hide" instead of an eye icon. | Kyle |
| 2026-11-08 | **Wall picture:** a small square around the tiles-left count shows the remaining wall; stacks disappear in the real order (draws from the front, replacements from the back). | Kyle |
| 2026-11-08 | **One language at a time:** top bar and winning conditions show only English or only Chinese; in English the winds are shown as E / S / W / N. (The Help tables still show the Chinese names next to the English ones.) | Kyle |
| 2026-11-08 | **"Next round"** replaces "Confirm – next hand". **Theme:** Light or Dark only (Dark default); "System" removed. **Your name** (with chips and, for the dealer, the dice) is at the top left next to Undo. | Kyle |
| 2026-11-08 | **New tile:** stays apart on the far right until you drag it into your hand; then it is part of your hand order. | Kyle |
| 2026-11-08 | **Claim tile:** when you can Shàng / Pèng / Gàng / Hú, the tile shows big in the middle ("Take"), tap or drag it into your hand (a choice appears if more than one claim is possible). | Kyle |
| 2026-11-08 | **After the next player draws:** buttons, flashing and the claim tile disappear for everyone, and the player who drew can no longer claim that tile. Others can still tap the discarded tile within 3 s (the earlier grace rule), without buttons. | Kyle (grace detail: Claude) |
| 2026-11-08 | **Discards slide** in from the player who threw them. **Deal animation** (~5 s) at the start of each hand: tiles slide from the wall to each player 4 at a time, then 1 each, then the dealer's extra tile, then flower replacements; the wall picture empties in the real order. | Kyle |
| 2026-11-08 | **Only chicken wins can be undone** ("Undo chicken win", everyone must agree). Normal wins cannot be undone. Replaces "undo can go back over any move, including wins". | Kyle |
| 2026-11-08 | **End of a round:** only "Ready" and "Leave seat". Ready also counts as Start: when every seated player is Ready the next round begins (dealer rolls). Each player's row shows whether they are ready. | Kyle |
| 2026-11-08 | Side players' name tags are one small line like the top player's; the wall picture has no outline. | Kyle |
| 2026-11-08 | **Host page layout:** "CPU levels" and "History" are collapsible sections that start closed. History shows one column per seat: winner's cell green, discarder's red; on a self-draw every losing player is red. | Kyle |
| 2026-11-08 | **Host chips:** set inside each seat's card (and a list for spectators); Set needs a second tap to confirm, like End game. **Remove player** forces a person out of their seat (they become a spectator and keep their chips), like Remove CPU. | Kyle |
| 2026-11-08 | **Default starting balance: 200** on the host page's Create game form. | Kyle |
| 2026-11-08 | **Always dark.** Light mode and the theme setting are removed. | Kyle |
| 2026-11-08 | **Settings panel:** compact name box and language buttons; no "Drop out" heading/text; "Leave my seat" (and any Swap buttons) sit in one row with "Leave game"; an × in the top-right corner closes it. | Kyle |
| 2026-11-08 | **Logo:** the original 1 bamboo bird on a tile is the game's logo, shown next to "LAN Mahjong" on the join screen and used as the browser tab icon (`client/public/logo.svg`). | Kyle |
| 2026-11-08 | **Connections heal themselves.** Phones ask for the game list every 10 s and check the connection whenever the page comes back into view (e.g. after scanning the QR code with the camera); a connection that stays silent for 25 s is replaced. The server pings every phone every 15 s and drops connections that died silently. So new games appear on a waiting phone automatically. | Kyle (fix for his report) |
| 2026-11-08 | **Logo without a background:** just the bird (lighter legs so they show on the dark screen); same for the browser tab icon. Tiles in the game keep their white faces. | Kyle |
| 2026-11-08 | **Glides:** tapping Draw makes the tile glide from the middle into your hand; when other players draw, a tile glides from the middle to them. | Kyle |
| 2026-11-08 | **Glides on every device (fix):** the old glide used a CSS trick iPhones ignore. Now uses the browser's built-in animation feature; the gliding tile is bigger and a little slower (about half a second). Applies to other players' draws (spectators see every seat's draws) and to the deal animation. | Kyle |
| 2026-11-08 | **Installer fix:** updating while the game was running gave "Error opening file for writing: node.exe" because the close-the-game step (32-bit PowerShell) could not see the 64-bit game. Now uses 64-bit PowerShell and Windows' process list; if the game is still running anyway, the installer asks you to close its window and click OK. | Kyle |
| 2026-11-08 | **Glides easier to see:** the gliding tile was green on a green table and small on a PC. It is now bigger on large screens, has a cream edge and a yellow glow, and takes about ¾ of a second. | Kyle |
| 2026-11-08 | **Phase 9 – controls tutorial:** 7 pop-up cards with small moving pictures (draw, discard, arrange, take a discard, win, undo, help & settings). Shown by itself the first time someone sits down on a device; reopen from ? → Controls tutorial. | Kyle |
| 2026-11-08 | **Phase 9 – home screen:** "📲 Add to home screen" button on the join screen shows the steps for the device (iPhone/iPad Safari, Android Chrome, Samsung Internet); hidden when already opened from the home screen. Icon: the bird on a dark square, named "Mahjong". Android on a home network may still show the address bar (needs https to hide; accepted). | Kyle |
| 2026-11-08 | **Merged into main.** Everything is now in the main version (pull request #1). Download link is now .../archive/refs/heads/main.zip. | Kyle |
| 2026-11-08 | **Faster loading (no visible change):** the laptop now sends the game's screen files compressed (gzip), so a phone downloads ~77 KB instead of ~241 KB, and keeps them in memory instead of re-reading the disk. Installer: stronger compression and a smaller server file (~0.24 MB less). Almost all of the installer is Node.js itself (~80 MB before compression), which can't safely be made smaller. | Kyle |
| 2026-11-08 | **Removed the tutorial and the "Add to home screen" button** (Kyle: the controls are intuitive, and home-screen shortcuts break whenever the laptop's address changes). The app icons and app settings file stay, so a manually added shortcut still shows the bird named "Mahjong". | Kyle |
| 2026-11-08 | **Minimum fan in the top bar:** a small label next to the round name, "Min 3 fan" / "3番起糊". Seen by players and spectators; updates when the host changes it. | Kyle |
| 2026-11-08 | **Flower draws are obvious:** when anyone draws a flower (not during the deal), a big pop-up in the middle shows the tile with "S CPU Easy drew a flower" / "南 電腦（易） 補花" ("You drew a flower" / "你補花" for your own) for about 2 s; the new flower then glows gold where it lands. Doesn't block taps or drags. | Kyle |
| 2026-11-08 | **Chip symbol:** a plain yellow circle in front of your chip count in the top right. | Kyle |
| 2026-11-08 | **Host: Stop this hand** (two taps, only while a hand or its dice roll is in progress; not on the win summary). Nobody pays, chips and dealer stay; settings unlock; when everyone presses Start the same game is dealt again with new tiles. Players see "The host stopped this hand. It will be dealt again." | Kyle |
| 2026-11-08 | **Win celebration:** when a win summary appears (not a draw; same for chicken wins), confetti plus a fanfare (sound D, louder) on every device. Each player picks the confetti style in ⚙ Settings: Confetti (cannons), Red & gold, Gold chips or Fireworks (default Confetti); it follows their name like the language. Made by code, no files. Doesn't replay when a page is reopened on the summary. | Kyle |
| 2026-11-08 | **Help and Settings during pop-ups:** the ? and ⚙ buttons stay tappable (and bright) above the win summary and the Ready / Start pop-up; the rest of the top bar stays dimmed. | Kyle |
| 2026-11-08 | **Cantonese romanization:** in English mode the action buttons (and the host page's CPU descriptions) now use Cantonese Jyutping without tone numbers: Soeng 上, Pung 碰, Gong 槓, Wu 胡 (was Mandarin pinyin Shàng, Pèng, Gàng, Hú). Chinese mode still shows 上 碰 槓 胡. | Kyle |
| 2026-11-08 | **Liability 包 (host setting, off by default):** once a player has 3 face-up sets all of one suit (9 tiles showing; concealed gongs don't count), the first player to discard a tile of that suit that they then use (for a set or the win, incl. robbing a gong) is liable. If that player wins with a one-suit hand (清一色, checked from the actual tiles), the liable player pays the whole amount the winner receives (self-draw or discard win); the others pay nothing. Not for chicken wins. Summary shows "包: X … pays for everyone". Kept through undo. CPUs don't yet avoid feeding. | Kyle |
| 2026-11-08 | **Versions and automatic updates (1.1.0):** version number from package.json, shown on the host page and the join screen. Releases: GitHub Actions builds the installer and publishes it (with a SHA-256 fingerprint) whenever the version changes on main; the installer is no longer kept in the code. The installed app checks the latest release each time it starts; if newer, it downloads it, checks the fingerprint, runs it quietly (/S /RELAUNCH) and the installer restarts the game. Any failure: starts the current version; the same version isn't retried for 6 hours. Kyle made the project public so the laptop can see the releases (no password in the app). | Kyle |
| 2026-11-08 | **Version in Settings (1.1.1):** the player Settings panel shows "LAN Mahjong v1.1.1" in its bottom-left corner (as well as the host page title and the join screen). | Kyle |
| 2026-11-09 | **1.2.0:** host page has a **Play on this computer** button that opens the player screen in a new tab. The liability rule 包 is now **on by default** for new games (games already saved keep their setting; the host can still turn it off). | Kyle |
| 2026-11-09 | **1.3.0:** iPhone camera island: the table area, pop-ups and join screen keep clear of the iPhone's safe-area strips (as the top bar and your row already did), and your hand is sized from the usable width. Claims are obvious like flower draws: Soeng / Pung / Gong (also concealed / added gongs) pop up in the middle with the set, a badge in the button's colour and "N name: Pung!", and the new set glows; a win shows a big red Wu badge over the summary (with the confetti). | Kyle |
| 2026-11-09 | **1.4.0:** host page shows a clear "Version 1.4.0" label next to the title. The last discard shows big in the middle next to the tiles-left box, with who threw it (not when it is already shown as Take; gone once claimed; back after undoing the claim). Side players' tiles shrink automatically (down to 35%) when they would need more columns than fit, so none are cut off on iPhones. | Kyle |
| 2026-11-09 | **1.5.0:** rearranging your hand: while you drag a tile over your hand, the other tiles slide apart to open a gap at the place nearest your finger; letting go drops it into that gap. Dragging to the middle still discards. | Kyle |
| 2026-11-09 | **1.6.0:** your hand is sorted only once, when dealt; afterwards it keeps your order (new tiles on the right) and the order is remembered on the device through locks and reloads. Flower / Soeng / Pung / Gong pop-ups last 3 seconds. No Wu pop-up any more; instead the win summary outlines the tile that completed the hand in gold. | Kyle |
| 2026-11-10 | **1.7.0:** dice roll animation before the deal: on every screen three dice are thrown from the dealer's side, bounce off the screen edges with flickering faces, then settle side by side in the middle on the real roll (Chinese style: red 1 and 4). About 2.6 s; the deal starts once they land. Drawn by code; each device plays it itself. | Kyle |
| 2026-11-08 | **Shàng sets are shown in order**, lowest number first. | Kyle |
| 2026-11-08 | **After the win summary:** seated players press Continue, then a popup like the seat picker shows who is ready, with Ready / Leave seat (and Back to summary). | Kyle |
| 2026-11-08 | **Chips appear once:** only at the top right; your top-left name tag has no chips. | Kyle |
| 2026-11-08 | **CPU names:** "CPU Easy", "CPU Medium", "CPU Hard" (names may repeat; each seat's CPU keeps its own chips). Shown as 電腦（易／中／難） in Chinese. | Kyle |
| 2026-11-08 | **Windows installer (no command window, no npm):** `LAN-Mahjong-Setup.exe` in the download installs the game for the current user (`%LOCALAPPDATA%\Programs\LAN Mahjong`), with its own copy of Node.js 22 (checked against the official checksum). Desktop + Start-menu icon "LAN Mahjong" opens a small window (keep open while playing; close to stop) and the host page in the browser. Uninstaller "Uninstall LAN Mahjong.exe" (also in Settings > Apps) asks whether to delete saved games. Saved games: `%LOCALAPPDATA%\LAN Mahjong\games.json`. Not code-signed, so Windows shows "Windows protected your PC" once (More info → Run anyway). Rebuild with `npm run build:windows`. Built on Linux; first real Windows test is Kyle's. | Kyle (approach: Claude) |
| 2026-11-08 | **Installer fix:** the first installer closed itself halfway (it stopped "LAN Mahjong*" windows, which matched its own "LAN Mahjong Setup" window). Now it only stops the game's own node.exe inside the install folder. Install, reinstall-while-running and uninstall were tested in Wine (32-bit). | Claude (fix for Kyle's report) |
| 2026-11-08 | **First dealer** of a new game is seat 0 (East). | Claude (Kyle may change) |
| 2026-11-08 | **Undo moves:** discard, 上, 碰, 槓, 胡. Draws are not separate moves. Undoing a discard puts the tile back in that player's hand and it is their turn again. | Kyle |
| 2026-11-08 | **Several games at once:** one server can run many separate games, each with its own name. | Kyle |
| 2026-11-08 | **Joining:** players open the server's address once; it is also shown as a **QR code** to scan. The game list shows every game on that server. Replaces the network scan in plan section 3. | Kyle |
| 2026-11-08 | **Saving:** the server saves the game to a file on its device, so a game survives a restart. Replaces "nothing is saved" in plan section 2. | Kyle |
| 2026-11-08 | **Dealer stays when the dealer wins** (standard HK). Repeated hands (dealer stays after a win or a draw) do NOT count toward the 16 rounds. | Kyle |
| 2026-11-08 | **Draw:** the round is a draw when the wall is completely empty. No tiles are kept back. | Kyle |
| 2026-11-08 | **Chicken win can be visible.** The win summary may show that it was a chicken win and that the winner paid 96. Replaces "no sign that it is not a real win" in the notes. | Kyle |

## Open questions for Kyle

- None right now.

## Top bar layout (updated)

Left: undo. Centre: wind and player positions. Right: chip total + lock, then **help**, then settings (far right).

## Fan to chips table (approved)

"Half-spicy" (半辣) HK table. Base = what each non-discarder pays.
Discarder pays double the base.

| Fan | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 (cap) |
|-----|---|---|---|---|---|---|---|---|---|---|----------|
| Base chips | 1 | 2 | 4 | 8 | 16 | 24 | 32 | 48 | 64 | 96 | 128 |

## Fan list (confirmed)

| Fan | Hand | 中文 |
|-----|------|------|
| 1 | Self-draw | 自摸 |
| 1 | Concealed hand (no chow/pong/gong called) | 門前清 |
| 1 | No flowers (only when flowers are on) | 無花 |
| 1 each | Own-seat flower | 正花 |
| 2 | Full set of 4 flowers of one kind | 一台花 |
| 1 | All chows | 平胡 |
| 1 each | Pong of a dragon (中 / 發 / 白) | 番子 |
| 1 | Pong of seat wind | 門風 |
| 1 | Pong of round wind | 圈風 |
| 1 | Mixed terminals and honours | 混么九 |
| 1 | Win on the last tile | 海底撈月 |
| 1 | Robbing a gong | 搶槓 |
| 2 | Win on a gong replacement tile | 槓上開花 |
| 3 | All pongs | 對對胡 |
| 3 | One suit plus honours | 混一色 |
| 5 | Small three dragons | 小三元 |
| 6 | Small four winds | 小四喜 |
| 7 | One suit only | 清一色 |
| 8 | Big three dragons | 大三元 |
| Cap | Thirteen orphans | 十三么 |
| Cap | Big four winds | 大四喜 |
| Cap | All honours | 字一色 |
| Cap | All terminals | 清么九 |
| Cap | Nine gates | 九子連環 |
| Cap | All concealed pongs | 坑坑胡 |
| Cap | Four gongs | 十八羅漢 |
| Cap | Heavenly hand (dealer wins on deal) | 天胡 |
| Cap | Earthly hand (win on dealer's first discard) | 地胡 |
| Cap | All 8 flowers | 八仙過海 |
| — | Seven pairs: **not allowed** (not standard HK) | 七對子 |
