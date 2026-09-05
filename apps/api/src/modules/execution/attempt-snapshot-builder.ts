import {
  CURRENT_ATTEMPT_SNAPSHOT_DOCUMENT_VERSION,
  type AttemptSnapshotDocumentV1,
  type SnapshotSourceQuestion,
} from './attempt-snapshot.types.js';

/**
 * A deterministic, seedable PRNG (mulberry32, seeded via a 32-bit FNV-1a
 * hash of the attempt's own seed string) — Node's `Math.random()` cannot be
 * seeded, and ADR-0008 requires the materialised order to be reproducible
 * from the stored seed alone (forensic reproducibility, A-08). Not a
 * cryptographic requirement (this is fairness/anti-cheating shuffling, not
 * a security boundary), so a small non-cryptographic generator is the
 * correct, dependency-free choice (`AGENTS.md §9`) rather than pulling in a
 * seeded-random library for this one function.
 */
function hashSeedToUint32(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates, driven by the shared `rng` stream — deliberately not
 * reset per question when shuffling each question's own options, so every
 * question's option order draws from a different point in the same
 * deterministic sequence rather than every question producing the
 * identical permutation. */
function shuffleDeterministic<T>(items: readonly T[], rng: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j] as T, result[i] as T];
  }
  return result;
}

export interface BuildSnapshotDocumentOptions {
  randomizeQuestions: boolean;
  randomizeOptions: boolean;
  seed: string;
}

/**
 * The core of ADR-0008: materialises question order and option order into
 * one document, deterministically from `options.seed`. Pure — no I/O, no
 * DB, no clock — so a refresh (a second call with the identical stored
 * seed and source rows) is byte-identical by construction (DoD item 5),
 * and this function is fully unit-testable without a database. Question
 * pools stay deferred (ADR-0002): this always iterates the full,
 * fixed `questions` array, never draws a subset.
 */
export function buildSnapshotDocument(
  questions: readonly SnapshotSourceQuestion[],
  options: BuildSnapshotDocumentOptions,
): AttemptSnapshotDocumentV1 {
  const rng = mulberry32(hashSeedToUint32(options.seed));

  const baseOrderedQuestions = [...questions].sort((a, b) => a.sequence - b.sequence);
  const orderedQuestions = options.randomizeQuestions
    ? shuffleDeterministic(baseOrderedQuestions, rng)
    : baseOrderedQuestions;

  return {
    version: CURRENT_ATTEMPT_SNAPSHOT_DOCUMENT_VERSION,
    seed: options.seed,
    questions: orderedQuestions.map((question, questionIndex) => {
      const baseOrderedOptions = [...question.options].sort(
        (a, b) => a.originalOrder - b.originalOrder,
      );
      const orderedOptions = options.randomizeOptions
        ? shuffleDeterministic(baseOrderedOptions, rng)
        : baseOrderedOptions;

      return {
        examQuestionId: question.examQuestionId,
        questionRevisionId: question.questionRevisionId,
        displaySequence: questionIndex + 1,
        marks: question.marks,
        questionType: question.questionType,
        content: question.content,
        explanation: question.explanation,
        options: orderedOptions.map((option, optionIndex) => ({
          optionId: option.optionId,
          content: option.content,
          originalOrder: option.originalOrder,
          displayPosition: optionIndex + 1,
          correctFlag: option.correctFlag,
        })),
        media: [...question.media].sort((a, b) => a.displayOrder - b.displayOrder),
      };
    }),
  };
}
