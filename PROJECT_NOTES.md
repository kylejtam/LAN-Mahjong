# LAN Mahjong: Project Notes (decision log)

This file records decisions made while building. The "what" lives in
`mahjong-project-notes.md` and the "how" in `mahjong-plan.md`. If this file
disagrees with those, the newest dated entry here wins.

## Current status

- Phase 1 (rules engine): not started. Waiting on the questions below.

## Decisions

| Date | Decision | Who |
|------|----------|-----|
| 2026-11-08 | Project layout: one repository with three parts: `shared/` (rules engine, used by both sides), `server/` (Node.js game server), `client/` (browser screens). | Claude (Kyle may change) |
| 2026-11-08 | Automated tests use **Vitest**, a common TypeScript testing tool. Run them with `npm test`. | Claude (Kyle may change) |

## Open questions for Kyle

### Batch 1: scoring (needed for phase 1)

1. **Chicken win:** confirm the *winner pays* 32 to each other player (a hidden
   penalty), and what the win summary should show so it does not give it away.
2. **Minimum fan default** and the **maximum fan** (the cap, also the value of
   "limit" hands).
3. **Fan to chips table** (proposal below).
4. **Self-draw payment** and the **"only discarder pays"** amount.
5. **Fan list** (proposal below).
6. **Two players win on the same discard:** both win, or only the next in turn?

### Batch 2: later phases (heads-up, no answer needed yet)

- A browser on a phone or tablet cannot run a server. See chat notes before phase 2.
- When the dealer wins, does the dealer stay? (Standard HK: yes.)
- Does the round end when the wall is fully empty, or are some tiles kept back?

## Proposed fan to chips table (awaiting Kyle)

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
