/**
 * Words shown on screen, in English and Traditional Chinese (Hong Kong
 * wording). Each player chooses on their own device.
 *
 * Use t(lang, 'key', { name: 'Amy' }) – {name} in the text is replaced.
 */
import { createContext, useContext } from 'react';

export type Lang = 'en' | 'zh';

/** The 4 action buttons: pinyin in English, characters in Chinese. */
export const ACTION_LABELS: Record<Lang, { chow: string; pong: string; gong: string; win: string }> = {
  en: { chow: 'Shàng', pong: 'Pèng', gong: 'Gàng', win: 'Hú' },
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
  hintDraw: 'Your turn: drag the glowing tile in the middle into your hand.',
  hintReplace: 'Drag the glowing replacement tile in the middle into your hand.',
  drawHere: 'Draw',
  take: 'Take',
  continue: 'Continue',
  backToSummary: 'Back to summary',
  undoChickenWin: 'Undo chicken win',
  replacementHere: 'Replacement',
  hintDiscard: 'Drag a tile to the middle of the table to discard it.',
  hintClaim: 'You can claim the last discard. Tap a button or the tile.',
  hintWaitingSeat: 'Waiting for the host to fill the empty seat.',
  hintWatching: "Watching. {name}'s turn.",
  hintTurn: "{name}'s turn.",
  swipeDiceHere: 'Swipe the dice here',
  swipeDice: 'Swipe the dice to the middle',
  waitingRoll: 'Waiting for {name} to roll',
  // seats
  tapSeat: 'Tap an empty seat to sit down, or Spectate to just watch.',
  startRule: 'A round starts when all 4 seats are filled and everyone presses Start. The host can fill seats with CPUs.',
  start: 'Start',
  waitingOthers: 'Waiting for others…',
  leaveSeat: 'Leave seat',
  spectate: 'Spectate',
  justWatch: 'Just watch',
  ready: 'Ready',
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
  // Controls tutorial
  tutorial: 'Controls tutorial',
  tutStep: '{n} of {of}',
  tutSkip: 'Skip',
  tutBack: 'Back',
  tutNext: 'Next',
  tutDone: 'Done',
  tut_draw_title: 'Draw a tile',
  tut_draw_text: 'On your turn, tap the glowing tile in the middle (or drag it into your hand). The new tile sits on the right, apart from the rest.',
  tut_discard_title: 'Discard',
  tut_discard_text: 'Drag a tile from your hand to the middle of the table.',
  tut_reorder_title: 'Arrange your tiles',
  tut_reorder_text: 'Drag a tile left or right in your hand to move it. Your hand is sorted for you at the start.',
  tut_claim_title: 'Take a discard',
  tut_claim_text: 'When you can use a discard, it shows big in the middle as Take and the buttons flash. Tap the tile or a button: {chow} (a run), {pong} (three the same), {gong} (four the same). The buttons go away once the next player draws.',
  tut_win_title: 'Win',
  tut_win_text: 'When you can win, the red {win} button flashes. Tap it, whether you drew the tile yourself or someone discarded it.',
  tut_undo_title: 'Undo',
  tut_undo_text: 'Made a mistake? Tap ↶ Undo at the top left to take back the last move.',
  tut_help_title: 'Help and settings',
  tut_help_text: '? shows the fan tables and this tutorial. ⚙ lets you change your name or language, or leave your seat.',
  // Add to home screen
  addHome: 'Add to home screen',
  homeIntro: 'Then the game opens full screen, like an app, from the Mahjong icon.',
  homeKindIos: 'iPhone / iPad',
  homeKindAndroid: 'Android (Chrome)',
  homeKindSamsung: 'Samsung Internet',
  homeIos1: 'In Safari, tap the Share button (a square with an arrow ↑). If you can\'t see it, tap ··· first.',
  homeIos2: 'Scroll down and tap Add to Home Screen.',
  homeIos3: 'Tap Add.',
  homeAndroid1: 'In Chrome, tap ⋮ at the top right.',
  homeAndroid2: 'Tap Add to Home screen (or Install app), then Add.',
  homeSamsung1: 'Tap the menu ≡ at the bottom.',
  homeSamsung2: 'Tap Add page to, then Home screen.',
  homeAfter: 'Close this tab and open the game from the new Mahjong icon. Type the same name to get your seat back.',
  homeAndroidNote: 'On Android the address bar may still show at the top. That is normal on a home network.',
};

type Strings = typeof en;

const zh: Strings = {
  undo: '還原',
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
  hintDraw: '到你：將枱中間發光嗰隻牌拖入手。',
  hintReplace: '將枱中間發光嘅補牌拖入手。',
  drawHere: '摸牌',
  take: '要',
  continue: '繼續',
  backToSummary: '返去結算',
  undoChickenWin: '還原雞糊',
  replacementHere: '補牌',
  hintDiscard: '將一隻牌拖去枱中間打出。',
  hintClaim: '你可以要上家打出嘅牌。撳掣或者撳嗰隻牌。',
  hintWaitingSeat: '等緊主機補空位。',
  hintWatching: '旁觀中。到 {name}。',
  hintTurn: '到 {name}。',
  swipeDiceHere: '將骰仔掃過嚟',
  swipeDice: '將骰仔掃去枱中間',
  waitingRoll: '等緊 {name} 擲骰',
  tapSeat: '撳空位入座，或者撳「旁觀」淨係睇。',
  startRule: '四個位坐滿、個個撳咗「開始」就開局。主機可以用電腦補位。',
  start: '開始',
  waitingOthers: '等緊其他人…',
  leaveSeat: '離座',
  spectate: '旁觀',
  justWatch: '淨係睇',
  ready: '準備好',
  swapInTitle: '換入嚟？',
  swapInText: '{name} 想你頂佢個位。',
  swapIn: '換入',
  noThanks: '唔使喇',
  swapWaiting: '等緊 {name} 回覆換位…',
  swapDeclined: '{name} 拒絕咗換位。',
  swapAccepted: '{name} 頂咗你個位。',
  cancel: '取消',
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
  // 操作教學
  tutorial: '操作教學',
  tutStep: '第 {n} / {of} 頁',
  tutSkip: '跳過',
  tutBack: '上一頁',
  tutNext: '下一頁',
  tutDone: '完成',
  tut_draw_title: '摸牌',
  tut_draw_text: '到你嘅時候，撳枱中間發光嗰隻牌（或者拖入手）。新摸嘅牌會放喺最右邊，同其他牌分開。',
  tut_discard_title: '打牌',
  tut_discard_text: '將手上一隻牌拖去枱中間。',
  tut_reorder_title: '排牌',
  tut_reorder_text: '喺手牌入面將一隻牌左右拖，就可以搬位。開局會自動幫你排好。',
  tut_claim_title: '要牌',
  tut_claim_text: '如果你用得着人哋打出嘅牌，佢會喺中間放大顯示「要」，啲掣會閃。撳隻牌或者撳掣：{chow}（順子）、{pong}（三隻一樣）、{gong}（四隻一樣）。下一個人摸牌之後啲掣就會消失。',
  tut_win_title: '食糊',
  tut_win_text: '可以食糊嘅時候，紅色「{win}」掣會閃。自己摸到定係人哋打出，都係撳佢。',
  tut_undo_title: '還原',
  tut_undo_text: '撳錯咗？撳左上角「↶ 還原」就可以收返上一步。',
  tut_help_title: '幫助同設定',
  tut_help_text: '「?」睇番數表同呢個教學。「⚙」可以改名、轉語言或者離座。',
  // 加到主畫面
  addHome: '加到主畫面',
  homeIntro: '之後撳「Mahjong」圖示，遊戲就會好似 app 咁全螢幕打開。',
  homeKindIos: 'iPhone / iPad',
  homeKindAndroid: 'Android (Chrome)',
  homeKindSamsung: 'Samsung Internet',
  homeIos1: '喺 Safari 撳「分享」掣（一個有向上箭咀嘅方格 ↑）。睇唔到嘅話，先撳「···」。',
  homeIos2: '向下碌，撳「加至主畫面」。',
  homeIos3: '撳「加入」。',
  homeAndroid1: '喺 Chrome 撳右上角嘅「⋮」。',
  homeAndroid2: '撳「新增至主畫面」（或者「安裝應用程式」），再撳「新增」。',
  homeSamsung1: '撳底部嘅選單「≡」。',
  homeSamsung2: '撳「新增頁面至」，再撳「主畫面」。',
  homeAfter: '關咗呢個分頁，然後撳新嘅「Mahjong」圖示開遊戲。打返同一個名，就會返到你個位。',
  homeAndroidNote: '喺 Android 頂部可能仲會見到網址列，喺屋企網絡係正常嘅。',
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
}
export const DEFAULT_PREFS: Prefs = { lang: 'en' };
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
