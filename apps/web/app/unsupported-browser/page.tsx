import type { Metadata } from 'next';
import { StatusPage } from '@/components/system/status-page';

export const metadata: Metadata = { title: 'Browser not supported' };

/**
 * F21 (DoD 4): the unsupported-browser page. `public/compat-probe.js` links
 * here from its notice when the app bundle cannot run. The page is pure
 * server-rendered HTML, so it reads on the very browsers it describes.
 * Versions: docs/operations/browser-and-hardware-baseline.md.
 */
export default function UnsupportedBrowserPage() {
  return (
    <StatusPage code="Browser not supported" title="This browser cannot run the exam application">
      <p>Use one of these browsers, at this version or newer:</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>Google Chrome 111</li>
        <li>Microsoft Edge 111</li>
        <li>Mozilla Firefox 115</li>
        <li>Safari 16.4 (Mac and iPad, not a lab browser)</li>
      </ul>
      <p>
        On Windows 7 or 8.1, Chrome cannot be updated far enough. Install{' '}
        <strong>Firefox ESR</strong> (Extended Support Release) instead.
      </p>
      <p>Students: tell your teacher or invigilator. Do not try to take an exam on this browser.</p>
    </StatusPage>
  );
}
