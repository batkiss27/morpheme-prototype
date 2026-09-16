/**
 * The only UI test the prototype needs (spec §9): every screen renders without
 * crashing, for each run phase. Server-rendered — no DOM environment.
 */
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { defaultBalance } from '../src/content';
import { reduce } from '../src/engine';
import type { RunState } from '../src/engine';
import { App } from '../src/ui/App';
import { BossIntroScreen, BossScreen, EndScreen, RewardScreen, RoundScreen, ScoreScreen, ShopScreen, StartScreen } from '../src/ui/screens';
import { setDictionary, startRun, getState } from '../src/ui/store';
import { balanceWith, withCards } from './helpers';
import { anyDict, makeContent, newRun, playFromHand, playRegularRound } from './run-driver';

const easy = makeContent(anyDict, balanceWith({ scoring: { round1Threshold: 1 } }));

function states(): Record<string, RunState> {
  let s = newRun(easy, 3);
  s = reduce(s, { type: 'START_ROUND' }, easy);
  const extendEmpty = s;
  s = playFromHand(s, easy, 3, 'start');
  const extendWithStep = s;
  const rejected = reduce(s, { type: 'PLAY_STEP', side: 'back', tileIds: ['nope'] }, easy);
  s = reduce(s, { type: 'SUBMIT' }, easy);
  const scored = s;
  s = reduce(s, { type: 'CONTINUE' }, easy);
  const shop = s;
  s = reduce(s, { type: 'LEAVE' }, easy);
  for (let i = 0; i < 2; i++) s = playRegularRound(s, easy);
  s = reduce(s, { type: 'START_ROUND' }, easy);
  const bossIntro = s;
  s = reduce(s, { type: 'START_BOSS' }, easy);
  const bossPlay = s;
  s = reduce(s, { type: 'END_BOSS', wordPoints: 1000 }, easy);
  const bossEnd = s;
  s = reduce(s, { type: 'CONTINUE' }, easy);
  const bossReward = s;
  s = reduce(s, { type: 'PICK_MODIFIER', id: s.boss!.reward!.offers[0]! }, easy);
  const forfeited = reduce(reduce(extendWithStep, { type: 'FORFEIT' }, easy), { type: 'CONTINUE' }, easy);
  const won = { ...bossReward, phase: 'WIN' as const };
  const carded = withCards(extendWithStep, 'before_and_after', 'glide', 'loanword', 'bank', 'amendment');
  const shopWithCards = withCards({ ...shop, currency: 20 }, 'hyphen');
  return { extendEmpty, extendWithStep, rejected, scored, shop, bossIntro, bossPlay, bossEnd, bossReward, forfeited, won, carded, shopWithCards };
}

describe('screens render', () => {
  setDictionary(anyDict);
  const st = states();

  it('StartScreen', () => {
    expect(renderToString(<StartScreen />)).toContain('Quick Start');
  });
  it('RoundScreen (empty, with a step, after a rejected step)', () => {
    expect(renderToString(<RoundScreen run={st.extendEmpty!} />)).toContain('Play first word');
    const withStep = renderToString(<RoundScreen run={st.extendWithStep!} />);
    expect(withStep).toContain('Add to back');
    expect(withStep).toContain('Submit round');
    expect(renderToString(<RoundScreen run={st.rejected!} />)).toContain('Rejected');
    const carded = renderToString(<RoundScreen run={st.carded!} />);
    expect(carded).toContain('Before &amp; After');
    expect(carded).toContain('card--blocked'); // Amendment is not usable in EXTEND
  });
  it('ScoreScreen', () => {
    const html = renderToString(<ScoreScreen run={st.scored!} />);
    expect(html).toContain('Morpheme multiplier');
    expect(html).toContain('To the shop');
    expect(html).toContain('Round clear');
    const withMods = renderToString(<ScoreScreen run={{ ...st.scored!, inRun: ['suffix_bias'], lastResult: { ...st.scored!.lastResult!, notes: ['"ab" scores ×2 (4 pts)'] } }} />);
    expect(withMods).toContain('scores ×2');
    expect(renderToString(<ShopScreen run={{ ...st.shop!, shop: { ...st.shop!.shop!, inRunOffer: { modifierId: 'coinage', price: 10, sold: false, criterion: 'Front + back' } } }} />)).toContain('Coinage');
  });
  it('ShopScreen', () => {
    const html = renderToString(<ShopScreen run={st.shop!} />);
    expect(html).toContain('Leave');
    expect(html).toContain('Reroll cards for');
    expect(html).toContain('Tile action');
    expect(renderToString(<ShopScreen run={st.shopWithCards!} />)).toContain('Sell for');
  });
  it('boss screens for every boss phase', () => {
    const intro = renderToString(<BossIntroScreen run={st.bossIntro!} />);
    expect(intro).toContain('Start boss round');
    expect(intro).toContain('Modifier');
    const play = renderToString(<BossScreen run={st.bossPlay!} />);
    expect(play).toContain('class="board"');
    expect(play).toContain('Rack');
    expect(play).toContain('timer-bar');
    const end = renderToString(<ScoreScreen run={st.bossEnd!} />);
    expect(end).toContain('Choose reward');
    expect(end).toContain('Boss clear');
    const rewardHtml = renderToString(<RewardScreen run={st.bossReward!} />);
    expect(rewardHtml).toContain('Choose');
    expect((rewardHtml.match(/class="offer offer--/g) ?? []).length).toBe(3);
  });
  it('EndScreen for a loss and a win', () => {
    expect(renderToString(<EndScreen run={st.forfeited!} />)).toContain('Run over');
    expect(renderToString(<EndScreen run={st.won!} />)).toContain('You win');
  });
  it('App routes by phase through the store', () => {
    expect(renderToString(<App />)).toContain('Quick Start');
    startRun(5);
    expect(getState().run?.phase).toBe('EXTEND');
    expect(renderToString(<App />)).toContain('Play first word');
    expect(getState().balance).toBe(defaultBalance);
  });
});
