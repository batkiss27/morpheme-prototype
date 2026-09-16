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
import { BossStubScreen, EndScreen, RoundScreen, ScoreScreen, ShopScreen, StartScreen } from '../src/ui/screens';
import { setDictionary, startRun, getState } from '../src/ui/store';
import { balanceWith } from './helpers';
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
  s = reduce(s, { type: 'END_BOSS' }, easy);
  const bossEnd = s;
  s = reduce(s, { type: 'CONTINUE' }, easy);
  const bossReward = s;
  const forfeited = reduce(reduce(extendWithStep, { type: 'FORFEIT' }, easy), { type: 'CONTINUE' }, easy);
  const won = { ...bossReward, phase: 'WIN' as const };
  return { extendEmpty, extendWithStep, rejected, scored, shop, bossIntro, bossPlay, bossEnd, bossReward, forfeited, won };
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
  });
  it('ScoreScreen', () => {
    const html = renderToString(<ScoreScreen run={st.scored!} />);
    expect(html).toContain('Morpheme multiplier');
    expect(html).toContain('To the shop');
  });
  it('ShopScreen', () => {
    expect(renderToString(<ShopScreen run={st.shop!} />)).toContain('Leave');
  });
  it('BossStubScreen for every boss phase', () => {
    expect(renderToString(<BossStubScreen run={st.bossIntro!} />)).toContain('Start boss');
    expect(renderToString(<BossStubScreen run={st.bossPlay!} />)).toContain('Auto-pass');
    expect(renderToString(<BossStubScreen run={st.bossEnd!} />)).toContain('Choose reward');
    expect(renderToString(<BossStubScreen run={st.bossReward!} />)).toContain('Skip reward');
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
