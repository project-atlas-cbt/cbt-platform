import { ResultsListScreen } from '@/components/results/results-list-screen';

// F14 — `04 §60` "My Results" (`ST-08`). Supersedes the `[...slug]`
// catch-all automatically (Next prefers the more specific route), matching
// this codebase's established pattern (F2/F3/F6/F13/…).
export default function StudentResultsPage() {
  return <ResultsListScreen />;
}
