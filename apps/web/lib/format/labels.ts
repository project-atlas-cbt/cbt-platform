/**
 * Display labels for enum values the API returns in capitals. Screens show
 * these words, never the raw value (`STANDARD`, `EASY`).
 */

const SESSION_TYPE_LABELS: Record<string, string> = {
  STANDARD: 'Standard',
  MAKEUP: 'Makeup',
  SPECIAL: 'Exceptional reattempt',
};

export function sessionTypeLabel(type: string): string {
  return SESSION_TYPE_LABELS[type] ?? sentenceCase(type);
}

export function difficultyLabel(difficulty: string | undefined | null): string {
  return difficulty ? sentenceCase(difficulty) : '';
}

/** `HARD` → `Hard`, `NOT_STARTED` → `Not started`. */
export function sentenceCase(value: string): string {
  const words = value.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
