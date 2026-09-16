/**
 * P0-02: nothing under src/engine/ or src/content/ may import from src/ui/,
 * React, the DOM, or Node. The engine must stay portable (spec §3).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', 'src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') || p.endsWith('.tsx') ? [p] : [];
  });
}

const FORBIDDEN = [/^react(-dom)?(\/|$)/, /\/ui\//, /^\.\.?\/.*ui(\/|$)/, /^node:/, /^fs$/, /^path$/];

describe('engine isolation', () => {
  const files = [...walk(join(ROOT, 'engine')), ...walk(join(ROOT, 'content'))];

  it('finds engine and content files', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  for (const file of files) {
    it(`${relative(ROOT, file)} imports only engine/content`, () => {
      const src = readFileSync(file, 'utf8');
      const specifiers = [...src.matchAll(/(?:from|import)\s*['"]([^'"]+)['"]/g)].map((m) => m[1] as string);
      const bad = specifiers.filter((s) => FORBIDDEN.some((re) => re.test(s)));
      expect(bad, `forbidden imports in ${file}`).toEqual([]);
      expect(src).not.toMatch(/\b(fetch|setTimeout|setInterval|document|window|localStorage)\s*\(/);
    });
  }
});
