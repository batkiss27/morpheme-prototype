/** P1-07: export → replay reproduces the identical final state. */
import { describe, expect, it } from 'vitest';
import { exportRun, exportRunJson, parseRunExport, reduce, replay } from '../src/engine';
import { balanceWith } from './helpers';
import { anyDict, makeContent, newRun, playBossRound, playRegularRound } from './run-driver';

const content = makeContent(anyDict, balanceWith({ scoring: { round1Threshold: 1, thresholdGrowthByBlock: [1] } }));

function sampleRun() {
  let s = newRun(content, 2024);
  s = reduce(s, { type: 'SUBMIT' }, content); // a rejected action is part of the record too
  for (let i = 0; i < 3; i++) s = playRegularRound(s, content, 2);
  s = playBossRound(s, content, 40);
  s = playRegularRound(s, content);
  return s;
}

describe('export / replay', () => {
  it('serializes seed, loadout and actions', () => {
    const s = sampleRun();
    const exp = exportRun(s);
    expect(exp.seed).toBe(2024);
    expect(exp.loadout).toEqual(s.preRun);
    expect(exp.actions).toHaveLength(s.log.length);
    expect(exp.actions[0]).toEqual({ type: 'SUBMIT' });
  });

  it('replay reproduces the identical final state', () => {
    const s = sampleRun();
    expect(replay(exportRun(s), content)).toEqual(s);
  });

  it('survives a JSON round trip', () => {
    const s = sampleRun();
    const json = exportRunJson(s);
    expect(replay(parseRunExport(json), content)).toEqual(s);
  });

  it('two replays are identical (determinism)', () => {
    const exp = exportRun(sampleRun());
    expect(replay(exp, content)).toEqual(replay(exp, content));
  });

  it('a different seed gives a different run', () => {
    const exp = exportRun(sampleRun());
    const other = replay({ ...exp, seed: 1 }, content);
    expect(other.chain?.tiles.map((t) => t.id)).not.toEqual(replay(exp, content).chain?.tiles.map((t) => t.id));
  });

  it('rejects unknown versions and malformed JSON', () => {
    const exp = exportRun(sampleRun());
    expect(() => replay({ ...exp, version: 99 }, content)).toThrow(/version/);
    expect(() => parseRunExport('{"nope":true}')).toThrow(/not a run export/);
  });
});
