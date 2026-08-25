import { API_VERSION_PREFIX } from '@atlas/contracts';

// Deliberately minimal — proves apps/web can import and use
// @atlas/contracts (B0 Definition of Done #9). The real landing/login
// screen is F0/F1 scope (docs/04-module-screen-map.md §2).
export default function Home() {
  return (
    <main>
      <h1>CBT Platform — engineering foundation</h1>
      <p>API version prefix from @atlas/contracts: {API_VERSION_PREFIX}</p>
    </main>
  );
}
