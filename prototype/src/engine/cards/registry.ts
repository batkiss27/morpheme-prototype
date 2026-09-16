/**
 * Card registry: maps card content to implementations and validates that
 * every `effectId` in the content exists (a startup error otherwise).
 */

import type { CardInstance, CardSpec, CardType, EngineContent, Phase } from '../types';
import { isStepEffect, stepEffects } from './extension';
import { effectPhases, instantEffects, isInstantEffect } from './instant';

export { stepEffects, instantEffects, effectPhases };

/** Throws if any card names an unknown effect or duplicates an id. */
export function validateCards(cards: readonly CardSpec[]): void {
  const seen = new Set<string>();
  for (const card of cards) {
    if (seen.has(card.id)) throw new Error(`duplicate card id "${card.id}"`);
    seen.add(card.id);
    if (!isStepEffect(card.effectId) && !isInstantEffect(card.effectId)) {
      throw new Error(`card "${card.id}" uses unknown effect "${card.effectId}"`);
    }
  }
}

export function cardSpec(content: EngineContent, cardId: string): CardSpec | undefined {
  return content.cards.find((c) => c.id === cardId);
}

export function heldSpec(content: EngineContent, instance: CardInstance): CardSpec | undefined {
  return cardSpec(content, instance.cardId);
}

/** How a card is played: a step effect rides on PLAY_STEP, an instant one on USE_CARD. */
export function usage(card: CardSpec): 'step' | 'instant' {
  return isStepEffect(card.effectId) ? 'step' : 'instant';
}

/** Can this card be used in this phase? Step cards ride on PLAY_STEP (EXTEND). */
export function usableIn(card: CardSpec, phase: Phase): boolean {
  if (isStepEffect(card.effectId)) return phase === 'EXTEND';
  if (isInstantEffect(card.effectId)) return effectPhases[card.effectId].includes(phase);
  return false;
}

export function countByType(cards: readonly CardInstance[], content: EngineContent): Record<CardType, number> {
  const counts: Record<CardType, number> = { sound_shift: 0, extension: 0, loanword: 0, utility: 0 };
  for (const c of cards) {
    const spec = heldSpec(content, c);
    if (spec) counts[spec.type]++;
  }
  return counts;
}
