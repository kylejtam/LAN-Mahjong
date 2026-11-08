# LAN Mahjong: Project Notes (decision log)

This file records decisions made while building. The "what" lives in
`mahjong-project-notes.md` and the "how" in `mahjong-plan.md`. If this file
disagrees with those, the newest dated entry here wins.

## Current status

- Phase 1 (rules engine): **done**. Tile set and checks, shuffle, wall and dice
  break, dealing with flower replacement, winning-hand check, legal
  chow/pong/gong/win, two-winner rule, fan counting, payments.
- Tests: 93 passing (`npm test`).
- Phase 2 (game server): next. Hosting decided (option a).

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
| 2026-11-08 | **Hosting (option a):** a laptop runs the game server in the background. Any player on any device (phone, tablet, laptop) can create a game and hold host controls. The server's laptop does not have to be a player. No app install. Replaces plan section 1 option C. An iPhone/iPad host app may be added later. | Kyle |
| 2026-11-08 | **Host disconnects:** the game keeps going; host controls wait for the host to return. Replaces "game pauses for everyone" in the notes (that was only needed when the host's phone held the game). | Kyle |
| 2026-11-08 | **Drawing is manual:** a player drags a tile from the end of the wall into their hand. | Kyle |
| 2026-11-08 | **Claiming a discard:** no pass button. 上 碰 槓 胡 buttons stay available until the next player draws. They are big and flashing. A player can also claim by tapping the discarded tile. | Kyle |
| 2026-11-08 | **3-second grace period:** for 3 seconds after the next player draws, another player can still claim the discard. The draw is undone (tile goes back to the wall) and the claim happens. | Kyle |
| 2026-11-08 | **Undo moves:** discard, 上, 碰, 槓, 胡. Draws are not separate moves. Undoing a discard puts the tile back in that player's hand and it is their turn again. | Kyle |
| 2026-11-08 | **Several games at once:** one server can run many separate games, each with its own name. | Kyle |
| 2026-11-08 | **Joining:** players open the server's address once; it is also shown as a **QR code** to scan. The game list shows every game on that server. Replaces the network scan in plan section 3. | Kyle |
| 2026-11-08 | **Saving:** the server saves the game to a file on its device, so a game survives a restart. Replaces "nothing is saved" in plan section 2. | Kyle |
| 2026-11-08 | **Dealer stays when the dealer wins** (standard HK). Repeated hands (dealer stays after a win or a draw) do NOT count toward the 16 rounds. | Kyle |
| 2026-11-08 | **Draw:** the round is a draw when the wall is completely empty. No tiles are kept back. | Kyle |
| 2026-11-08 | **Chicken win can be visible.** The win summary may show that it was a chicken win and that the winner paid 96. Replaces "no sign that it is not a real win" in the notes. | Kyle |

## Open questions for Kyle

- **P2-A. Waiting for a stronger claim.** If someone taps 上 but another player
  could still 碰/槓/胡 that tile, how long does the game wait? (see chat)
- **P2-B. Discarding during the 3-second grace period.** (see chat)
- **P2-C. Replacement draws** after a flower or gong: manual drag or automatic? (see chat)

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
