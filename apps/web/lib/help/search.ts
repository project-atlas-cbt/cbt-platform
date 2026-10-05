import type { Guide } from './types';

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/\*\*/g, '')
    .replace(/[^a-z0-9\s]/g, ' ');
}

function tokens(text: string): string[] {
  return normalise(text).split(/\s+/).filter(Boolean);
}

/**
 * ADR-0035 decision 4: search runs in the browser over the guides the user
 * can see. Every query word must appear somewhere in the guide (as a word
 * prefix, so "pass" finds "password"); matches in the title count most,
 * then keywords, then the summary, then the steps and notes.
 */
export function searchGuides(guides: readonly Guide[], query: string): Guide[] {
  const words = tokens(query);
  if (words.length === 0) return [...guides];

  const scored: { guide: Guide; score: number; index: number }[] = [];
  guides.forEach((guide, index) => {
    const fields: [string[], number][] = [
      [tokens(guide.title), 6],
      [tokens(guide.keywords.join(' ')), 4],
      [tokens(guide.summary), 2],
      [tokens([...guide.steps, ...(guide.notes ?? [])].join(' ')), 1],
    ];
    let score = 0;
    for (const word of words) {
      let best = 0;
      for (const [fieldTokens, weight] of fields) {
        if (weight > best && fieldTokens.some((t) => t.startsWith(word))) best = weight;
      }
      if (best === 0) return;
      score += best;
    }
    scored.push({ guide, score, index });
  });

  return scored.sort((a, b) => b.score - a.score || a.index - b.index).map((s) => s.guide);
}
