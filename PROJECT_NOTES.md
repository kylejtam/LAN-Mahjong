# LAN Mahjong: Project Notes (decision log)

This file records decisions made while building. The "what" lives in
`mahjong-project-notes.md` and the "how" in `mahjong-plan.md`. If this file
disagrees with those, the newest dated entry here wins.

## Current status

- Phase 1 (rules engine): mostly done. Built and tested: tile set and checks,
  shuffle, wall and dice break, dealing with flower replacement, winning-hand
  check, legal chow/pong/gong/win, payments. Still to do: fan counting
  (waits for Q5 fan list) and two-winner rule (Q6).
- Tests: 56 passing (`npm test`).

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
| 2026-11-08 | **Minimum fan** is a host setting. Default 3 until Kyle says otherwise. | Kyle / Claude default |
| 2026-11-08 | **Fan to chips table** approved (half-spicy, cap 10 fan = 128). Anything above 10 fan pays as 10. | Kyle |
| 2026-11-08 | **Payout, default mode:** discarder pays 2 × base, the other two pay 1 × base each. | Kyle |
| 2026-11-08 | **Payout, self-draw:** each of the other 3 players pays 2 × base. | Kyle |
| 2026-11-08 | **Payout, "only discarder pays" mode:** discarder pays 4 × base (example: 3 fan → 4 × 8 = 32). Self-draw in this mode pays the same as normal self-draw (no discarder exists). | Kyle / Claude (self-draw part) |

## Open questions for Kyle

### Batch 1: scoring (needed for phase 1)

1. ~~Chicken win~~ answered. Still open (phase 6): what the win summary shows
   for a chicken win so it is not given away.
2. ~~Fan limits~~ answered (host setting, default 3, cap 10).
3. ~~Fan to chips table~~ answered.
4. ~~Payments~~ answered.
5. **Fan list** (proposal below).
6. **Two players win on the same discard:** both win, or only the next in turn?

### Batch 2: later phases (heads-up, no answer needed yet)

- A browser on a phone or tablet cannot run a server. See chat notes before phase 2.
- When the dealer wins, does the dealer stay? (Standard HK: yes.)
- Does the round end when the wall is fully empty, or are some tiles kept back?

## Fan to chips table (approved)

"Half-spicy" (半辣) HK table. Base = what each non-discarder pays.
Discarder pays double the base.

| Fan | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 (cap) |
|-----|---|---|---|---|---|---|---|---|---|---|----------|
| Base chips | 1 | 2 | 4 | 8 | 16 | 24 | 32 | 48 | 64 | 96 | 128 |

## Proposed fan list (awaiting Kyle)

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
