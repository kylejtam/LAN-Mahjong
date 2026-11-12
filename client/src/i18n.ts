/**
 * Words shown on screen, in English and Traditional Chinese (Hong Kong
 * wording). Each player chooses on their own device.
 *
 * Use t(lang, 'key', { name: 'Amy' }) – {name} in the text is replaced.
 */
import { createContext, useContext } from 'react';
import { CELEBRATION_STYLES } from './celebrate';
import type { CelebrationStyle } from './celebrate';

export type Lang = 'en' | 'zh';

/** The 4 action buttons: Cantonese romanization (Jyutping, without tone numbers) in English, characters in Chinese. */
export const ACTION_LABELS: Record<Lang, { chow: string; pong: string; gong: string; win: string }> = {
  en: { chow: 'Soeng', pong: 'Pung', gong: 'Gong', win: 'Wu' },
  zh: { chow: '上', pong: '碰', gong: '槓', win: '胡' },
};

export const WIND_NAMES: Record<Lang, string[]> = {
  en: ['East', 'South', 'West', 'North'],
  zh: ['東', '南', '西', '北'],
};
export const WIND_CHARS = ['東', '南', '西', '北'];
/** Short wind markers: letters in English, characters in Chinese. */
export const WIND_SHORT: Record<Lang, string[]> = { en: ['E', 'S', 'W', 'N'], zh: WIND_CHARS };

const en = {
  // top bar and general
  undo: 'Undo',
  minFanShort: 'Min {n} fan',
  drewFlower: '{name} drew a flower',
  lastDiscard: 'Last discard',
  you: 'You',
  playerClaimed: '{name}: {action}!',
  youClaimed: 'You: {action}!',
  celebration: 'Win celebration',
  liableNote: '包: {name} fed this one-suit hand, so {name} pays for everyone.',
  celebration_cannons: 'Confetti',
  celebration_lucky: 'Red & gold',
  celebration_chips: 'Gold chips',
  celebration_fireworks: 'Fireworks',
  handStopped: 'The host stopped this hand. It will be dealt again.',
  youDrewFlower: 'You drew a flower',
  minFanTitle: 'Minimum fan needed to win',
  undoAgreed: '({n} agreed)',
  spectating: 'Spectating',
  allHands: 'All hands',
  takeSeat: 'Take a seat',
  help: 'Help',
  settings: 'Settings',
  close: 'Close',
  choose: 'Choose',
  ok: 'OK',
  empty: 'Empty',
  cpu: 'CPU',
  offline: 'offline',
  tilesLeft: 'tiles left',
  showHand: 'Show this hand',
  hideHand: 'Hide this hand',
  backToTable: 'Back to the table',
  reconnecting: 'Reconnecting…',
  rotate: 'Please turn your device sideways.',
  gameEndedByHost: 'The game was ended by the host.',
  // hints
  hintDraw: 'Your turn: press the glowing tile in the middle to draw it.',
  hintReplace: 'Drag the glowing replacement tile in the middle into your hand.',
  drawHere: 'Draw',
  take: 'Take',
  continue: 'Continue',
  backToSummary: 'Back to summary',
  undoChickenWin: 'Undo chicken win',
  replacementHere: 'Replacement',
  hintDiscard: 'Push a tile up out of your hand and let go to discard it.',
  hintClaim: 'You can claim the last discard. Tap a button or the tile.',
  hintWaitingSeat: 'Waiting for the host to fill the empty seat.',
  hintLastTile: 'The last tile: take it, or tap Pass if you don\'t want it.',
  hintWaitLastTile: 'No tiles left. Waiting for the other players to decide on the last tile.',
  pass: 'Pass',
  tie: 'Tie',
  tapToContinue: 'Tap anywhere to continue',
  hintPickChow: 'Tap the glowing tiles you want to use for your Soeng.',
  hintWatching: "Watching. {name}'s turn.",
  hintTurn: "{name}'s turn.",
  swipeDiceHere: 'Swipe the dice here',
  swipeDice: 'Swipe the dice to the middle',
  waitingRoll: 'Waiting for {name} to roll',
  rollDice: 'Roll the dice',
  swipeDiceOut: 'Tap the button, or swipe the dice',
  // seats
  tapSeat: 'Tap an empty seat to sit down, or Spectate to just watch.',
  startRule: 'A round starts when all 4 seats are filled and everyone presses Start. The host can fill seats with CPUs.',
  start: 'Start',
  waitingOthers: 'Waiting for others…',
  leaveSeat: 'Leave seat',
  spectate: 'Spectate',
  justWatch: 'Just watch',
  ready: 'Ready',
  remainingTiles: 'Remaining tiles',
  remainingStart: 'Draw starts here',
  callAll: 'Call all possible claims',
  callAllNote: 'Any tile you could claim is held for you, so it never slips past.',
  hintWaitClaim: 'Waiting for {name} to decide on the tile',
  hintHolding: 'Tap Confirm to claim, or Cancel to let it go',
  no: 'No',
  yes: 'Yes',
  fullscreen: 'Fullscreen',
  // swaps
  swapInTitle: 'Swap in?',
  swapInText: '{name} would like you to take their seat.',
  swapIn: 'Swap in',
  noThanks: 'No thanks',
  swapWaiting: 'Waiting for {name} to answer your swap request…',
  swapDeclined: '{name} declined the swap.',
  swapAccepted: '{name} took your seat.',
  cancel: 'Cancel',
  sitHere: 'Sit here',
  // settings panel
  yourName: 'Your name',
  save: 'Save',
  language: 'Language',
  leaveMySeat: 'Leave my seat',
  swapWith: 'Swap with {name}',
  leaveGame: 'Leave game',
  playingIn: 'Game: {name}',
  // results
  drawWallEmpty: 'Draw – the wall is empty',
  winsSelfDraw: '{name} wins by self-draw',
  winsOnDiscard: "{name} wins on {from}'s discard",
  chickenWin: ' (chicken win)',
  fan: '{n} fan',
  maxFan: ' (max)',
  confirm: 'Confirm',
  returnToSummary: 'Return to Game Summary',
  tutorial: 'Tutorial',
  tutorialAbout: 'Learn the controls with 3 computer players',
  leaveTutorial: 'Leave tutorial',
  tutorialDone: 'Tutorial complete',
  tutorialDoneNote: "You know all the controls. Pick a real game when you're ready.",
  backToGames: 'Back to games',
  next: 'Next',
  stepOf: 'Step {n} of {total}',
  unready: 'Unready',
  hintSitHere: "You're watching. Press Sit here on an empty seat to play.",
  hintSeatsFull: 'Every seat is taken, so you can watch this game.',
  hintShuffle: 'Move your mouse (or drag your finger) over the tiles to shuffle them.',
  reconnectingBig: 'Reconnecting',
  reconnectingNote: "Check your Wi-Fi. The game is paused for everyone until you're back.",
  disconnectedTitle: '{name} disconnected',
  disconnectedTag: 'Disconnected',
  pausedUntil: 'Game paused until they reconnect',
  secondsAgo: '{n} seconds ago',
  minutesAgo: '{m} min {s} s ago',
  isBack: '{name} is back',
  waiting: 'Waiting…',
  undoWin: 'Undo win',
  nextHand: 'Next round',
  show: 'Show',
  hide: 'Hide',
  askedUndo: 'Asked to undo',
  waitingFor: 'Waiting for: {names}',
  gameFinished: 'Game finished',
  winningConditions: 'Winning conditions',
  noConditions: 'No scoring conditions',
  totalFan: 'Total',
  totalTransferred: 'Total chips transferred: {n}',
  chickenNote: 'Below the minimum of {min} fan. Chicken win: {name} pays 32 to each other player.',
  // help
  fanTable: 'Fan table',
  fanToChips: 'Fan → chips',
  each: ' each',
  max: 'Max',
  colFan: 'Fan',
  colEachPays: 'Each pays',
  colDiscarder: 'Discarder',
  colSelfDraw: 'Self-draw (each)',
  helpNote: 'Max = {n} fan. Below the minimum fan is a chicken win: the winner pays 32 to each other player.',
  // lobby
  appName: 'LAN Mahjong',
  displayName: 'Display name',
  games: 'Games',
  connecting: 'Connecting to the server…',
  noGames: 'No games yet. Create one on the host laptop.',
  join: 'Join',
  watchingCount: '{n} watching',
};

type Strings = typeof en;

const zh: Strings = {
  undo: '還原',
  minFanShort: '{n}番起糊',
  drewFlower: '{name} 補花',
  lastDiscard: '最後打出嘅牌',
  you: '你',
  playerClaimed: '{name}：{action}！',
  youClaimed: '你：{action}！',
  celebration: '食糊慶祝',
  liableNote: '包：{name} 餵咗呢副清一色，一個人包晒。',
  celebration_cannons: '彩紙',
  celebration_lucky: '紅金彩紙',
  celebration_chips: '金籌碼',
  celebration_fireworks: '煙花',
  handStopped: '主機停咗呢鋪牌，會重新派過。',
  youDrewFlower: '你補花',
  minFanTitle: '最少要幾多番先可以食糊',
  undoAgreed: '（{n} 人同意）',
  spectating: '旁觀中',
  allHands: '睇晒全部手牌',
  takeSeat: '入座',
  help: '說明',
  settings: '設定',
  close: '關閉',
  choose: '揀',
  ok: '好',
  empty: '空位',
  cpu: '電腦',
  offline: '斷咗線',
  tilesLeft: '剩餘牌數',
  showHand: '睇呢副牌',
  hideHand: '收埋呢副牌',
  backToTable: '返去張枱',
  reconnecting: '重新連接緊…',
  rotate: '請將部機打橫。',
  gameEndedByHost: '主機已經完咗呢局。',
  hintDraw: '到你：撳一下枱中間發光嗰隻牌摸牌。',
  hintReplace: '將枱中間發光嘅補牌拖入手。',
  drawHere: '摸牌',
  take: '要',
  continue: '繼續',
  backToSummary: '返去結算',
  undoChickenWin: '還原雞糊',
  replacementHere: '補牌',
  hintDiscard: '將一隻牌向上推出手牌區，放手就打出。',
  hintClaim: '你可以要上家打出嘅牌。撳掣或者撳嗰隻牌。',
  hintWaitingSeat: '等緊主機補空位。',
  hintLastTile: '最後一隻牌：要就撳掣，唔要就撳「過」。',
  hintWaitLastTile: '冇牌摸喇，等其他人決定要唔要最後一隻牌。',
  pass: '過',
  tie: '和',
  tapToContinue: '輕觸任何地方繼續',
  hintPickChow: '撳發光嘅牌，揀用邊幾隻上。',
  hintWatching: '旁觀中。到 {name}。',
  hintTurn: '到 {name}。',
  swipeDiceHere: '將骰仔掃過嚟',
  swipeDice: '將骰仔掃去枱中間',
  waitingRoll: '等緊 {name} 擲骰',
  rollDice: '擲骰',
  swipeDiceOut: '撳掣，或者掃一下骰仔',
  tapSeat: '撳空位入座，或者撳「旁觀」淨係睇。',
  startRule: '四個位坐滿、個個撳咗「開始」就開局。主機可以用電腦補位。',
  start: '開始',
  waitingOthers: '等緊其他人…',
  leaveSeat: '離座',
  spectate: '旁觀',
  justWatch: '淨係睇',
  ready: '準備好',
  remainingTiles: '剩餘牌',
  remainingStart: '由呢度開始摸牌',
  callAll: '自動叫所有可以食嘅牌',
  callAllNote: '凡係你可以食嘅牌，都會自動幫你留住，唔會走甩。',
  hintWaitClaim: '等緊{name}決定要唔要呢隻牌',
  hintHolding: '撳確定食牌，或者撳取消放棄',
  no: '唔要',
  yes: '要',
  fullscreen: '全螢幕',
  swapInTitle: '換入嚟？',
  swapInText: '{name} 想你頂佢個位。',
  swapIn: '換入',
  noThanks: '唔使喇',
  swapWaiting: '等緊 {name} 回覆換位…',
  swapDeclined: '{name} 拒絕咗換位。',
  swapAccepted: '{name} 頂咗你個位。',
  cancel: '取消',
  returnToSummary: '返回結算',
  tutorial: '教學',
  tutorialAbout: '同 3 個電腦玩家一齊，學識所有操作',
  leaveTutorial: '離開教學',
  tutorialDone: '教學完成',
  tutorialDoneNote: '你已經識晒所有操作。準備好就揀一局真嘅遊戲啦。',
  backToGames: '返去遊戲列表',
  next: '下一步',
  stepOf: '第 {n} 步，共 {total} 步',
  unready: '取消準備',
  hintSitHere: '你喺度睇緊。撳空位嘅「坐呢度」就可以打。',
  hintSeatsFull: '所有位都有人坐，你可以睇住呢局。',
  hintShuffle: '用滑鼠（或者手指）喺啲牌上面郁嚟郁去，就可以洗牌。',
  reconnectingBig: '重新連接緊',
  reconnectingNote: '請檢查 Wi-Fi。你返嚟之前，所有人嘅遊戲都會暫停。',
  disconnectedTitle: '{name} 斷咗線',
  disconnectedTag: '斷咗線',
  pausedUntil: '佢重新連接之前，遊戲暫停',
  secondsAgo: '{n} 秒前',
  minutesAgo: '{m} 分 {s} 秒前',
  isBack: '{name} 返嚟喇',
  sitHere: '坐呢度',
  yourName: '你個名',
  save: '儲存',
  language: '語言',
  leaveMySeat: '離開座位',
  swapWith: '同 {name} 換位',
  leaveGame: '離開遊戲',
  playingIn: '遊戲：{name}',
  drawWallEmpty: '流局 — 摸晒牌',
  winsSelfDraw: '{name} 自摸',
  winsOnDiscard: '{name} 食糊（{from} 出銃）',
  chickenWin: '（雞糊）',
  fan: '{n} 番',
  maxFan: '（爆棚）',
  confirm: '確認',
  waiting: '等緊…',
  undoWin: '還原食糊',
  nextHand: '下一鋪',
  show: '顯示',
  hide: '隱藏',
  askedUndo: '已要求還原',
  waitingFor: '等緊：{names}',
  gameFinished: '全局完',
  winningConditions: '番種',
  noConditions: '冇番',
  totalFan: '合共',
  totalTransferred: '總共轉手籌碼：{n}',
  chickenNote: '唔夠 {min} 番起糊。雞糊：{name} 要俾每家 32。',
  fanTable: '番數表',
  fanToChips: '番數 → 籌碼',
  each: '（每隻）',
  max: '爆棚',
  colFan: '番',
  colEachPays: '每家俾',
  colDiscarder: '出銃',
  colSelfDraw: '自摸（每家）',
  helpNote: '爆棚 = {n} 番。唔夠起糊番數係雞糊：食糊嗰個要俾每家 32。',
  appName: 'LAN 麻雀',
  displayName: '顯示名稱',
  games: '遊戲',
  connecting: '連接緊伺服器…',
  noGames: '未有遊戲。請喺主機手提電腦開一局。',
  join: '加入',
  watchingCount: '{n} 人旁觀',
};

const STRINGS: Record<Lang, Strings> = { en, zh };
export type StringKey = keyof Strings;

export function t(lang: Lang, key: StringKey, vars: Record<string, string | number> = {}): string {
  return STRINGS[lang][key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}

/** Server messages (sent in English) shown in Chinese when Chinese is chosen. */
const SERVER_MESSAGES_ZH: Record<string, string> = {
  'It is not your turn.': '未到你。',
  'You must draw a tile first.': '你要先摸牌。',
  'You must draw a replacement tile first.': '你要先補牌。',
  'You must discard a tile first.': '你要先打一隻牌。',
  'The round has ended.': '呢鋪已經完咗。',
  'That seat is taken.': '呢個位有人坐咗。',
  'You can only change seats between rounds.': '要等呢鋪完先可以換位。',
  'You can only leave your seat between rounds.': '要等呢鋪完先可以離座。',
  'That name is already in use in this game. Please choose another name.': '呢個名有人用緊，請揀另一個名。',
  'That name is already in use in this game.': '呢個名有人用緊。',
  'That name is used by a CPU player. Please choose another name.': '電腦玩家用緊呢個名，請揀另一個。',
  'Please enter a name.': '請輸入名稱。',
  'Too late to claim that tile.': '太遲喇，要唔到嗰隻牌。',
  'Someone else has claimed that tile.': '已經有人要咗嗰隻牌。',
  'That tile does not complete your hand.': '嗰隻牌唔夠你食糊。',
  'Only the player whose turn it is can undo.': '只有輪到嘅玩家先可以還原。',
  'There is nothing to undo.': '冇嘢可以還原。',
  'That game no longer exists.': '呢局已經冇咗。',
  'This game has ended.': '呢局已經完咗。',
  'Something went wrong. Please try again.': '出咗問題，請再試。',
};

export function translateServerMessage(lang: Lang, message: string): string {
  if (lang === 'zh') {
    if (SERVER_MESSAGES_ZH[message]) return SERVER_MESSAGES_ZH[message]!;
    if (message.startsWith('Names can be at most')) return '名稱太長。';
  }
  return message;
}

// ---------- the player's own choices (language) ----------

/** Each player's own choices (the app is always dark). */
export interface Prefs {
  lang: Lang;
  /** Confetti style when someone wins (only changes this player's screen). */
  celebration: CelebrationStyle;
  /** "Call all possible claims": hold every tile you could claim automatically. */
  callAll: boolean;
}
export const DEFAULT_PREFS: Prefs = { lang: 'en', celebration: 'cannons', callAll: false };
const PREFS_KEY = 'lan-mahjong-prefs';

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULT_PREFS, ...cleanPrefs(JSON.parse(raw)) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}
export function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* storage may be blocked */
  }
}
/** Keep only valid language values (e.g. from the server). */
export function cleanPrefs(raw: unknown): Partial<Prefs> {
  const out: Partial<Prefs> = {};
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    if (r.lang === 'en' || r.lang === 'zh') out.lang = r.lang;
    if (CELEBRATION_STYLES.includes(r.celebration as CelebrationStyle)) out.celebration = r.celebration as CelebrationStyle;
    if (typeof r.callAll === 'boolean') out.callAll = r.callAll;
  }
  return out;
}

/** CPU players are named "CPU East" etc. on the server; show them in the player's language. */
export function personName(name: string | null | undefined, lang: Lang): string {
  if (!name) return '';
  const level = /^CPU (Easy|Medium|Hard)$/.exec(name);
  if (level && lang === 'zh') return `電腦（${{ Easy: '易', Medium: '中', Hard: '難' }[level[1] as 'Easy' | 'Medium' | 'Hard']}）`;
  const m = /^CPU (East|South|West|North)( \d+)?$/.exec(name);
  if (!m || lang === 'en') return name;
  return `電腦${WIND_NAMES.zh[WIND_NAMES.en.indexOf(m[1]!)]}${m[2] ?? ''}`;
}

export const LangContext = createContext<Lang>('en');
export const useLang = (): Lang => useContext(LangContext);
