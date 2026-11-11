/**
 * The tutorial's guide: a small note in the corner of the table saying what to do next.
 * Whatever you need to press glows gold, and the rest of the screen is dimmed except a
 * clear circle around it (taps outside the circles are blocked). Nothing moves on by
 * itself: every step waits for you to do what it asks, or to press Next.
 *
 * The steps before the hand are followed here on the device; the steps during the hand
 * come from the server, which only allows the move each one asks for.
 */
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { RoomView } from '../../server/src/game/view';
import type { Lang } from './i18n';
import { t } from './i18n';

type Text = { en: [string, string]; zh: [string, string] };

/** What each step says ([instruction, a little more]), what to press, and whether it has a Next button. */
const STEPS: Record<string, { text: Text; target?: string; next?: boolean }> = {
  sit: { text: { en: ['Tap Sit here to take the empty seat.', 'Until you sit down you are only watching.'], zh: ['撳「坐呢度」坐低。', '未坐低之前你只係喺度睇。'] }, target: '.sit-here' },
  help: { text: { en: ['Press ? to see the scoring.', 'It lists every fan and how many chips each fan is worth.'], zh: ['撳 ? 睇計分。', '入面有齊所有番種，同每番值幾多籌碼。'] }, target: '.help-btn' },
  helpClose: { text: { en: ['Press Close when you are done.', ''], zh: ['睇完撳「關閉」。', ''] }, target: '.help-close' },
  full: { text: { en: ['Press the fullscreen button for more room, then press it again to go back.', 'It hides the browser bar.'], zh: ['撳全螢幕掣，畫面會大啲；再撳一次就返返轉頭。', '會收埋瀏覽器嘅網址列。'] }, target: '.fullscreen-btn' },
  gear: { text: { en: ['Press the settings button.', 'A quick look at what each setting does.'], zh: ['撳設定掣。', '睇吓每個設定係做咩嘅。'] }, target: '.settings-btn' },
  name: { text: { en: ['Your name', 'The name everyone sees on your name tag.'], zh: ['你嘅名', '大家喺你名牌上見到嘅名。'] }, target: '[data-tut="name"]', next: true },
  lang: { text: { en: ['Language', 'Switch the whole game between English and 中文.'], zh: ['語言', '成個遊戲轉做英文或者中文。'] }, target: '[data-tut="lang"]', next: true },
  cele: { text: { en: ['Win celebration', 'The confetti you see when someone wins. It only changes your own screen.'], zh: ['食糊慶祝', '有人食糊時你見到嘅彩紙。只會改你自己嘅畫面。'] }, target: '[data-tut="cele"]', next: true },
  callInfo: { text: { en: ['Call all possible claims', 'Holds any tile you could claim for you automatically. You will try it later in this game.'], zh: ['自動叫所有可以食嘅牌', '凡係你可以食嘅牌都會自動幫你留住。稍後你會試吓。'] }, target: '[data-tut="callAll"]', next: true },
  leave: { text: { en: ['Leave seat and Leave game', 'Leave seat lets you watch instead of play. Leave game takes you back to the game list. Not now: they would end the tutorial.'], zh: ['離座同離開遊戲', '離座即係唔打改為睇；離開遊戲會返去遊戲列表。而家唔好撳，會完咗個教學。'] }, target: '[data-tut="leave"]', next: true },
  closeSettings: { text: { en: ['Close the settings with ×.', ''], zh: ['撳 × 閂咗設定。', ''] }, target: '.settings .panel-close' },
  pass: { text: { en: ['One button you will not need today: Pass.', 'It only appears for the very last tile of the wall. Press it if you do not want that tile, so nobody waits for you.'], zh: ['今日用唔着嘅一個掣：「過」。', '只會喺牌牆最後一隻牌出現。唔要嗰隻牌就撳，大家就唔使等你。'] }, next: true },
  shuffle: { text: { en: ['Move your mouse, or drag your finger, over the tiles to shuffle them.', 'The computer players shuffle too. Everyone sees the same pile.'], zh: ['用滑鼠或者手指喺啲牌上面郁，洗牌。', '電腦玩家都會一齊洗。大家見到嘅都係同一堆牌。'] } },
  ready: { text: { en: ['Press Ready. Now press Unready, then Ready again.', 'Unready is for when you change your mind. The hand starts when all four are ready.'], zh: ['撳「準備好」，再撳「取消準備」，然後再撳「準備好」。', '改變主意就撳「取消準備」。四個人都準備好就開始。'] }, target: '.ready-btn, .unready-btn' },
  allReady: { text: { en: ['Everyone is ready!', 'The tiles get a few last shoves, then the wall is built by itself. Press Next when you have read this.'], zh: ['大家都準備好喇！', '啲牌會再推幾下，然後自動砌好牌牆。睇完撳「下一步」。'] }, next: true },
  roll: { text: { en: ["You're the dealer: roll the dice.", 'Press Roll the dice, or swipe the dice with your finger.'], zh: ['你係莊家：擲骰。', '撳「擲骰」，或者用手指掃一下啲骰仔。'] }, target: '.roll-btn' },
  deal: { text: { en: ['Watch the tiles being dealt.', 'Your tiles appear in your hand as they arrive. Press Next when the deal is over.'], zh: ['睇住派牌。', '你啲牌一到就會出現喺你手度。派完撳「下一步」。'] }, next: true },
  flowers: { text: { en: ['You got two flowers in your starting tiles.', 'Green ring: it matches your seat (East is 1), so it scores. Red ring: it does not.'], zh: ['你開頭有兩隻花。', '綠圈：同你個位啱（東係 1），有番。紅圈：冇番。'] }, next: true },
  rearrange: { text: { en: ['Drag a tile to a new place in your hand.', 'Put your tiles in any order you like.'], zh: ['將一隻牌拖去手牌另一個位。', '你鍾意點排都得。'] }, target: '.me .hand' },
  discard1: { text: { en: ['Push the 1 character up out of your hand until it glows red, then let go to discard it.', 'Push a tile up and bring it back down to change your mind.'], zh: ['將一萬向上推出手牌，直到佢變紅，放手就打出。', '推上去再拉返落嚟就可以改變主意。'] }, target: '[data-type="m1"]' },
  undo: { text: { en: ['Press Undo to take your discard back.', 'Undo takes back your own last move, until someone else makes a move.'], zh: ['撳「還原」攞返隻牌。', '「還原」可以攞返你自己上一步，直到有人郁咗為止。'] }, target: '.btn.undo' },
  discard2: { text: { en: ['Now discard the 1 character again.', ''], zh: ['再打出一萬。', ''] }, target: '[data-type="m1"]' },
  mingDiscards: { text: { en: ["Ming drew and threw a 9 bamboo. Now it's Fong's turn: Fong's name tag glows.", 'The big tile in the middle is the latest discard.'], zh: ['明摸牌，打咗九索。而家到芳：芳個名牌會發光。', '中間大隻牌係最新打出嘅牌。'] } },
  fongFlower: { text: { en: ['Fong drew a flower, then threw a Red dragon.', 'The flower glows green because it matches Fong’s seat (West is 3), so it scores for Fong.'], zh: ['芳摸到花，然後打咗紅中。', '朵花發綠光，因為同芳個位啱（西係 3），有番。'] } },
  holdPung: { text: { en: ['Fong threw a Red dragon. Tap Pung.', 'Everyone sees your Pung bubble, and the next player has to wait.'], zh: ['芳打咗紅中。撳「碰」。', '大家會見到你個「碰」，下家要等你。'] }, target: '.actions .act-pong' },
  confirmPung: { text: { en: ['Your two Red dragons glow blue. Tap Confirm.', 'Or Cancel to let the tile go.'], zh: ['你兩隻紅中發藍光。撳「確認」。', '或者撳「取消」放棄。'] }, target: '.actions .act-confirm' },
  discardNorth: { text: { en: ['After a Pung you discard: throw the North wind.', ''], zh: ['碰完要打一隻：打北風。', ''] }, target: '[data-type="wN"]' },
  othersPlay: { text: { en: ['Ming, Fong and Kei take their turns. Kei threw a 6 bamboo.', ''], zh: ['明、芳同琪輪流打。琪打咗六索。', ''] } },
  holdSeung: { text: { en: ['Kei threw a 6 bamboo. Tap Seung.', 'There are two ways to Seung it: 4-5-6 or 5-6-7.'], zh: ['琪打咗六索。撳「上」。', '有兩種上法：四五六或者五六七。'] }, target: '.actions .act-chow' },
  confirmSeung: { text: { en: ['Tap the 4 and 5 bamboo, then Confirm.', 'All the possible tiles glow green until you choose.'], zh: ['撳四索同五索，然後撳「確認」。', '可以用嘅牌會發綠光，直到你揀好。'] }, target: '[data-type="s4"], [data-type="s5"], .actions .act-confirm' },
  discard7s: { text: { en: ['Discard the 7 bamboo.', ''], zh: ['打出七索。', ''] }, target: '[data-type="s7"]' },
  mingSeung: { text: { en: ['Ming took your 7 bamboo for a Seung.', 'Computer players claim too. Their claims pop up next to their name.'], zh: ['明上咗你隻七索。', '電腦玩家都會食牌，會喺佢哋名旁邊彈出嚟。'] } },
  fongPung: { text: { en: ['Ming threw a 3 character, and Fong took it for a Pung.', ''], zh: ['明打咗三萬，芳碰咗。', ''] } },
  holdPung9: { text: { en: ['Fong threw a 9 character. Tap Pung…', ''], zh: ['芳打咗九萬。撳「碰」……', ''] }, target: '.actions .act-pong' },
  cancel9: { text: { en: ['…but a Gong is better: tap Cancel.', 'Cancel lets the tile go, and you can choose again.'], zh: ['……但係槓更好：撳「取消」。', '撳「取消」會放咗隻牌，你可以再揀。'] }, target: '.actions .act-pass' },
  holdGong9: { text: { en: ['Now tap Gong.', ''], zh: ['而家撳「槓」。', ''] }, target: '.actions .act-gong' },
  confirmGong9: { text: { en: ['Your three 9 characters glow purple. Tap Confirm.', 'After a Gong you draw a replacement tile.'], zh: ['你三隻九萬發紫光。撳「確認」。', '槓完會補一隻牌。'] }, target: '.actions .act-confirm' },
  replace1: { text: { en: ['Press the tile in the middle for your replacement.', ''], zh: ['撳中間嗰隻牌補牌。', ''] }, target: '.draw-pile' },
  discard7p: { text: { en: ['Your replacement tile is a 7 dots. Discard it.', ''], zh: ['你補到七筒。打出佢。', ''] }, target: '[data-type="p7"]' },
  keiGong: { text: { en: ['Ming threw a White dragon, and Kei took it for a Gong.', 'Kei is just before you, so it is your turn next.'], zh: ['明打咗白板，琪槓咗。', '琪係你上家，跟住到你。'] } },
  draw: { text: { en: ["It's your turn: press the tile in the middle to draw.", 'Your name tag and the edge of the table glow when it is your turn.'], zh: ['到你：撳中間嗰隻牌摸牌。', '到你嘅時候，你個名牌同枱邊會發光。'] }, target: '.draw-pile' },
  replaceFlower: { text: { en: ['You drew a flower. Press the tile in the middle again for its replacement.', 'It glows red: it does not match your seat, so it does not score.'], zh: ['你摸到花。再撳中間嗰隻牌補牌。', '佢發紅光：同你個位唔啱，冇番。'] }, target: '.draw-pile' },
  hiddenGong: { text: { en: ['Your replacement is the 4th East wind: press Gong.', 'A hidden Gong of four tiles from your own hand.'], zh: ['你補到第四隻東風：撳「槓」。', '用自己手上四隻牌嘅暗槓。'] }, target: '.actions .act-gong' },
  replace2: { text: { en: ['Press the tile in the middle for another replacement.', ''], zh: ['再撳中間嗰隻牌補牌。', ''] }, target: '.draw-pile' },
  addedGong: { text: { en: ['Your replacement is the 4th Red dragon: press Gong.', 'It joins the Pung you already showed.'], zh: ['你補到第四隻紅中：撳「槓」。', '加入你之前碰咗嘅紅中。'] }, target: '.actions .act-gong' },
  replace3: { text: { en: ['Press the tile in the middle for another replacement.', ''], zh: ['再撳中間嗰隻牌補牌。', ''] }, target: '.draw-pile' },
  discard8m: { text: { en: ['Your replacement is an 8 character. Discard it.', 'You only need one more 2 dots to win.'], zh: ['你補到八萬。打出佢。', '你只差一隻二筒就食糊。'] }, target: '[data-type="m8"]' },
  callAll: { text: { en: ['Open Settings and turn on Call all possible claims.', 'From now on, any tile you could claim is held for you, so it can never slip past.'], zh: ['打開設定，開啟「自動叫所有可以食嘅牌」。', '之後凡係你可以食嘅牌都會幫你留住，唔會走甩。'] }, target: '.settings-btn, [data-tut="callAll"]' },
  fongTwoDots: { text: { en: ['Ming and Fong take their turns. Fong threw the 2 dots you need!', ''], zh: ['明同芳輪流打。芳打咗你要嘅二筒！', ''] } },
  closeSettings2: { text: { en: ['Close the settings with ×.', ''], zh: ['撳 × 閂咗設定。', ''] }, target: '.settings .panel-close' },
  holdWu: { text: { en: ['Fong threw the 2 dots you need. It was held for you straight away: tap Wu.', 'Everyone sees a bubble fading through the claim colours, so they know you could claim, but not what.'], zh: ['芳打咗你要嘅二筒，已經即刻幫你留住：撳「糊」。', '大家會見到一個轉色嘅泡泡，知道你可以食，但唔知食咩。'] }, target: '.actions .act-win' },
  confirmWu: { text: { en: ['Tap Confirm to win.', 'Everyone now sees your Wu bubble.'], zh: ['撳「確認」食糊。', '大家而家見到你個「糊」。'] }, target: '.actions .act-confirm' },
  wu: { text: { en: ['You won! Tap anywhere to go to the summary.', 'Your celebration plays, and your winning hand shows with the winning tile.'], zh: ['你食糊喇！撳任何地方睇結算。', '會播你揀嘅慶祝，同埋顯示你食糊嘅牌。'] } },
  summary: { text: { en: ['Press Remaining tiles to see what was left in the wall.', ''], zh: ['撳「剩餘牌」睇牌牆仲有咩。', ''] }, target: '.remaining-btn' },
  remainingClose: { text: { en: ['Close it with ×, then press Continue.', ''], zh: ['撳 × 閂咗佢，然後撳「繼續」。', ''] }, target: '.remaining-panel .panel-close' },
  continue: { text: { en: ['Press Continue.', ''], zh: ['撳「繼續」。', ''] }, target: '.continue-btn' },
};

/** The settings tour (counted as one step). */
const TOUR = ['gear', 'name', 'lang', 'cele', 'callInfo', 'leave', 'closeSettings'];
/** The steps before the hand, in order. */
const BEFORE = ['sit', 'help', 'helpClose', 'full', ...TOUR, 'pass', 'shuffle', 'ready'];
/** All steps, for the "Step 3 of 40" count. */
const ORDER = ['sit', 'help', 'full', 'gear', 'pass', 'shuffle', 'ready', 'allReady', 'roll', 'deal', 'flowers', 'rearrange', 'discard1', 'undo', 'discard2', 'mingDiscards', 'fongFlower', 'holdPung', 'confirmPung', 'discardNorth', 'othersPlay', 'holdSeung', 'confirmSeung', 'discard7s', 'mingSeung', 'fongPung', 'holdPung9', 'cancel9', 'holdGong9', 'confirmGong9', 'replace1', 'discard7p', 'keiGong', 'draw', 'replaceFlower', 'hiddenGong', 'replace2', 'addedGong', 'replace3', 'discard8m', 'callAll', 'fongTwoDots', 'holdWu', 'confirmWu', 'wu', 'summary'];
const COUNT_AS: Record<string, string> = { helpClose: 'help', closeSettings2: 'callAll', remainingClose: 'summary', continue: 'summary' };

/** Discard steps: the only tile you may push out of your hand (others stay put). */
const DISCARD: Record<string, string> = { discard1: 'm1', discard2: 'm1', discardNorth: 'wN', discard7s: 's7', discard7p: 'p7', discard8m: 'm8' };

/**
 * In the tutorial: which tile may be discarded right now (null = none: tiles can only be
 * rearranged). Undefined when not in the tutorial.
 */
export function tutorialDiscardTile(view: RoomView): string | null | undefined {
  if (!view.tutorial) return undefined;
  return DISCARD[view.tutorial.stage] ?? null;
}

interface Props {
  view: RoomView;
  lang: Lang;
  /** Which panel is open on the table (help or settings). */
  panel: 'help' | 'settings' | null;
  dealing: boolean;
  winMoment: boolean;
  /** Back at the table after the summary: the tutorial is over. */
  finished: boolean;
  /** Tell the server Next was pressed (after the computer players' moves). */
  sendNext: () => void;
  onDone: () => void;
}

export function TutorialGuide({ view, lang, panel, dealing, winMoment, finished, sendNext, onDone }: Props): ReactElement | null {
  // Is the Remaining tiles pop-up open (it lives in the summary)? Checked a few times a second.
  const [remainingOpen, setRemainingOpen] = useState(false);
  useEffect(() => {
    if (view.tutorial?.stage !== 'won') return;
    const i = setInterval(() => {
      const open = !!document.querySelector('.remaining-panel');
      setRemainingOpen((was) => {
        if (was && !open) noteRemainingClosed();
        return open;
      });
    }, 250);
    return () => clearInterval(i);
  }, [view.tutorial?.stage]);
  const [local, setLocal] = useState(0); // the step reached before the hand
  const [inGame, setInGame] = useState<'allReady' | 'roll' | 'deal' | 'flowers' | 'server'>('allReady');
  const [dealSeen, setDealSeen] = useState(false);
  const [helpSeen, setHelpSeen] = useState(false);
  const [fullSeen, setFullSeen] = useState(false);
  const [moves, setMoves] = useState(0);
  const fullOk = !!(document.fullscreenEnabled || (document as Document & { webkitFullscreenEnabled?: boolean }).webkitFullscreenEnabled);
  const before = BEFORE[local];
  const advance = (): void => setLocal((n) => Math.min(BEFORE.length - 1, n + 1));

  // Steps before the hand move on when you do what they ask.
  useEffect(() => {
    if (before === 'sit' && view.you.seat !== null) advance();
    if (before === 'help' && panel === 'help') {
      setHelpSeen(true);
      advance();
    }
    if (before === 'helpClose' && helpSeen && panel !== 'help') advance();
    if (before === 'full' && !fullOk) advance(); // this browser can't go fullscreen (iPhone)
    if (before === 'gear' && panel === 'settings') advance();
    if (before === 'closeSettings' && panel !== 'settings') advance();
    if (before === 'shuffle' && moves > 60) advance();
  });
  useEffect(() => {
    if (before !== 'full') return;
    const on = (): void => {
      if (document.fullscreenElement || (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement) setFullSeen(true);
      else if (fullSeen) advance();
    };
    document.addEventListener('fullscreenchange', on);
    document.addEventListener('webkitfullscreenchange', on);
    return () => {
      document.removeEventListener('fullscreenchange', on);
      document.removeEventListener('webkitfullscreenchange', on);
    };
  }, [before, fullSeen]);
  useEffect(() => {
    if (before !== 'shuffle') return;
    const move = (e: PointerEvent): void => {
      if (e.pointerType !== 'mouse' && e.buttons === 0) return;
      setMoves((m) => m + 1);
    };
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, [before]);
  // The start of the hand.
  useEffect(() => {
    if (dealing) {
      setDealSeen(true);
      if (inGame === 'allReady' || inGame === 'roll') setInGame('deal');
    }
  }, [dealing]);

  // Which step it is now.
  const stage = view.tutorial?.stage ?? 'rearrange';
  let id: string;
  if (view.phase === 'betweenRounds') id = before ?? 'ready';
  else if (view.phase === 'rolling') id = inGame === 'allReady' ? 'allReady' : 'roll';
  else if (inGame !== 'server' && inGame !== 'allReady' && inGame !== 'roll' && stage === 'rearrange') id = inGame;
  else if (stage === 'won') id = winMoment ? 'wu' : remainingOpen ? 'remainingClose' : panelWasRemaining(view) ? 'continue' : 'summary';
  else if (panel === 'settings' && stage !== 'callAll') id = 'closeSettings2';
  else id = stage;
  const step = STEPS[id];

  // Next: for reading steps, and after the computer players' moves.
  const serverWaits = !!view.tutorial?.waitingNext && id === stage;
  const cpuMoving = !!view.tutorial && id === stage && !STEPS[id]?.target && !serverWaits && !['rearrange'].includes(id) && /^(mingDiscards|fongFlower|othersPlay|mingSeung|fongPung|keiGong|fongTwoDots)$/.test(id);
  const nextReady = (step?.next && (id !== 'deal' || (dealSeen && !dealing))) || serverWaits;
  const onNext = (): void => {
    if (serverWaits) return sendNext();
    if (id === 'allReady') return setInGame('roll');
    if (id === 'deal') return setInGame('flowers');
    if (id === 'flowers') return setInGame('server');
    advance();
  };

  // What to press: gold pulse, and a clear circle in the dimmed screen.
  const targets = finished ? '.tutorial-done .btn' : [step?.target, nextReady ? '.tut-next' : null].filter(Boolean).join(', ');
  useEffect(() => {
    document.querySelectorAll('.tut-target').forEach((el) => el.classList.remove('tut-target'));
    if (targets) document.querySelectorAll(targets).forEach((el) => el.classList.add('tut-target'));
  });
  useEffect(() => () => document.querySelectorAll('.tut-target').forEach((el) => el.classList.remove('tut-target')), []);
  // No dimming while you shuffle or when tapping anywhere is the step.
  const dim = !!view.tutorial && !['shuffle', 'wu'].includes(id) && !(id === stage && cpuMoving && !serverWaits);

  if (finished) {
    return (
      <>
        <Spotlight selector=".tutorial-done .btn" />
        <div className="overlay tutorial-done">
          <div className="panel">
            <h3>{t(lang, 'tutorialDone')}</h3>
            <p className="muted">{t(lang, 'tutorialDoneNote')}</p>
            <div className="row">
              <button className="btn primary big tut-target" onClick={onDone}>{t(lang, 'backToGames')}</button>
            </div>
          </div>
        </div>
      </>
    );
  }
  if (!step) return null;
  const [say, why] = step.text[lang];
  const numberOf = TOUR.includes(id) ? 'gear' : COUNT_AS[id] ?? id;
  const n = ORDER.indexOf(numberOf) + 1;
  const part = TOUR.includes(id) ? ` · ${TOUR.indexOf(id) + 1} / ${TOUR.length}` : '';
  return (
    <>
      {dim && <Spotlight selector={targets} />}
      <div className="tutorial-guide" role="status">
        <span className="count">{t(lang, 'stepOf', { n: Math.max(1, n), total: ORDER.length })}{part}</span>
        <span className="say">{say}</span>
        {why && <span className="why">{why}</span>}
        {nextReady && <button className="btn tut-next tut-target" onClick={onNext}>{t(lang, 'next')}</button>}
      </div>
    </>
  );
}

/** Has the player already looked at the remaining tiles (so Continue is next)? */
let remainingLooked = false;
function panelWasRemaining(view: RoomView): boolean {
  if (view.tutorial?.stage !== 'won') remainingLooked = false;
  return remainingLooked;
}
export function noteRemainingClosed(): void {
  remainingLooked = true;
}

/**
 * Dims the whole screen except a clear circle around each thing to press. Taps outside
 * the circles are blocked; taps inside them go through.
 */
function Spotlight({ selector }: { selector: string }): ReactElement {
  const [holes, setHoles] = useState<{ x: number; y: number; r: number }[]>([]);
  useEffect(() => {
    let raf = 0;
    const measure = (): void => {
      const els = selector ? [...document.querySelectorAll<HTMLElement>(selector)] : [];
      // Targets close together share one circle (circles never overlap).
      let boxes = els
        .map((el) => el.getBoundingClientRect())
        .filter((b) => b.width > 0 && b.height > 0)
        .map((b) => ({ l: b.left, t: b.top, r: b.right, b: b.bottom }));
      const circle = (b: { l: number; t: number; r: number; b: number }): { x: number; y: number; r: number } => ({ x: (b.l + b.r) / 2, y: (b.t + b.b) / 2, r: Math.hypot(b.r - b.l, b.b - b.t) / 2 + 10 });
      for (let merged = true; merged; ) {
        merged = false;
        outer: for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            const A = circle(boxes[i]!);
            const B = circle(boxes[j]!);
            if (Math.hypot(A.x - B.x, A.y - B.y) < A.r + B.r) {
              const u = { l: Math.min(boxes[i]!.l, boxes[j]!.l), t: Math.min(boxes[i]!.t, boxes[j]!.t), r: Math.max(boxes[i]!.r, boxes[j]!.r), b: Math.max(boxes[i]!.b, boxes[j]!.b) };
              boxes = boxes.filter((_, k) => k !== i && k !== j).concat([u]);
              merged = true;
              break outer;
            }
          }
        }
      }
      const next = boxes.map(circle);
      setHoles((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next));
      raf = window.setTimeout(measure, 150) as unknown as number;
    };
    measure();
    return () => clearTimeout(raf);
  }, [selector]);
  const W = window.innerWidth;
  const H = window.innerHeight;
  // One shape: the whole screen, with a round hole for each target (holes aren't painted,
  // so taps there reach the button underneath).
  const d = `M0 0H${W}V${H}H0Z ` + holes.map((h) => `M${h.x - h.r} ${h.y}a${h.r} ${h.r} 0 1 0 ${2 * h.r} 0a${h.r} ${h.r} 0 1 0 ${-2 * h.r} 0Z`).join(' ');
  return (
    <svg className="tut-dim" width={W} height={H} aria-hidden="true">
      <path d={d} fillRule="evenodd" />
      {holes.map((h, i) => <circle key={i} cx={h.x} cy={h.y} r={h.r} className="tut-ring" />)}
    </svg>
  );
}
