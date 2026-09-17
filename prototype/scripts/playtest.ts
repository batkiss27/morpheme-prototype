/**
 * Seeded bot playtests (P8-01):  npx vite-node scripts/playtest.ts [--seeds 1,2,3,4,5] [--out ../playtests]
 * Writes a Markdown report with margins per round plus one JSON export per run.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { achievements, bossModifiers, cards, challenges, defaultBalance, inRunModifiers, letters, preRunCategories, risks, secretWords, tileModifiers } from '../src/content';
import { createRun, defaultLoadout, dictionary as dictFns, exportRun, replayWithHistory } from '../src/engine';
import type { EngineContent } from '../src/engine';
import { buildExtendIndex, defaultBotOptions, playRun, ratio, shortWordList } from './bot';

const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? fallback) : fallback;
};
const seeds = arg('seeds', '1,2,3,4,5').split(',').map(Number);
const outDir = arg('out', join(__dirname, '..', '..', 'playtests'));
const label = arg('label', 'baseline');
const think = Number(arg('think', '4000'));

const base = readFileSync(join(__dirname, '..', 'public', 'dict', 'enable1.txt'), 'utf8');
const custom = readFileSync(join(__dirname, '..', 'public', 'dict', 'custom.txt'), 'utf8');
const words = dictFns.wordsFromText(base + '\n' + custom).map((w) => w.trim().toLowerCase()).filter((w) => w.length >= 2 && !w.startsWith('#'));
const content: EngineContent = {
  balance: defaultBalance,
  dictionary: dictFns.createDictionary(words),
  letters,
  cards,
  bossModifiers,
  inRunModifiers,
  secretWords,
  preRun: { categories: preRunCategories, risks, challenges },
  achievements,
  tileModifiers,
};
const opts = { ...defaultBotOptions, bossThinkMs: think, words, shortWords: shortWordList(words), index: buildExtendIndex(words) };

mkdirSync(outDir, { recursive: true });
const date = new Date().toISOString().slice(0, 10);
const lines: string[] = [`# Playtest — ${label} (${date})`, '', `Bot: greedy natural extensions (≤ ${opts.maxSteps} steps), extension cards when stuck, ${opts.bossThinkMs / 1000}s per boss placement. No loadout. Balance: T1 ${defaultBalance.scoring.round1Threshold}, growth ${defaultBalance.scoring.thresholdGrowth}, base ${defaultBalance.scoring.multiplierBase}, hand ${defaultBalance.hand.size}.`, ''];
const summary: string[] = ['| Seed | Outcome | Reached | Rounds cleared | Bosses | Min ratio (round) | Final word | Modifiers |', '|---|---|---|---|---|---|---|---|'];

for (const seed of seeds) {
  const t0 = Date.now();
  const final = playRun(createRun(seed, defaultLoadout, content), content, opts);
  const { history } = replayWithHistory(exportRun(final, defaultBalance), content);
  const worst = history.reduce((w, h) => (ratio(h.score, h.threshold) < ratio(w.score, w.threshold) ? h : w), history[0]!);
  const chain = final.chain ? final.chain.tiles.map((t) => t.playedAs ?? t.letter).join('').toLowerCase() : '';
  summary.push(
    `| ${seed} | ${final.phase} | ${final.round} | ${history.filter((h) => h.kind === 'regular' && h.passed).length} | ${history.filter((h) => h.kind === 'boss' && h.passed).length} | ${ratio(worst.score, worst.threshold).toFixed(2)} (${worst.round}) | ${chain} (${final.chain?.morphemes.length ?? 0}m) | ${final.inRun.join(', ')} |`,
  );
  lines.push(`## Seed ${seed} — ${final.phase} at round ${final.round} (${((Date.now() - t0) / 1000).toFixed(1)}s)`, '');
  lines.push('| Round | Word / chain | m | Score | Threshold | Margin | Ratio | ¢ | Cards |', '|---|---|---|---|---|---|---|---|---|');
  for (const h of history) {
    lines.push(`| ${h.round}${h.kind === 'boss' ? ' B' : ''} | ${h.kind === 'boss' ? '—' : h.chain} | ${h.morphemes} | ${h.score} | ${h.threshold} | ${h.margin >= 0 ? '+' : ''}${h.margin} | ${ratio(h.score, h.threshold).toFixed(2)} | +${h.currencyEarned} | ${h.cardsUsed.join(', ')} |`);
  }
  lines.push('');
  writeFileSync(join(outDir, `${date}-${label}-seed${seed}.json`), JSON.stringify(exportRun(final, defaultBalance)));
}

const report = [lines[0], lines[1], lines[2], '', '## Summary', '', ...summary, '', ...lines.slice(3)].join('\n');
writeFileSync(join(outDir, `${date}-${label}.md`), report);
console.log(summary.join('\n'));
console.log(`\nwrote ${join(outDir, `${date}-${label}.md`)}`);
