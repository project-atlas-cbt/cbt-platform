# Browser and hardware baseline

**Status:** declared in F20 (2026-10-03), closing audit finding `R-10` ("no document states a
minimum browser or hardware baseline"). Owner decision, F20 planning: Next.js 16's own browser
floor, plus Firefox ESR as the supported route for Windows 7/8.1 lab machines.

## Supported browsers

| Browser                | Minimum version | Notes                                                                                            |
| ---------------------- | --------------- | ------------------------------------------------------------------------------------------------ |
| Google Chrome          | 111             | Windows 10/11, macOS, ChromeOS, Linux.                                                           |
| Microsoft Edge         | 111             | Chromium-based Edge only.                                                                        |
| Mozilla Firefox        | 115             | **115 ESR is the route for Windows 7/8.1**, whose Chrome stops at 109.                           |
| Safari (macOS and iOS) | 16.4            | Supported, but not a lab target.                                                                 |
| Anything older         | —               | The app shows a plain "this browser cannot run the exam application" notice (`compat-probe.js`). |

The floor is Next.js 16's own (`node_modules/next/dist/docs/03-architecture/supported-browsers.md`)
and is declared in `apps/web/package.json` `browserslist`, which is what the build compiles against.
Chrome 109 on Windows 7 is **below** it — lowering the floor would need polyfills Next does not
support, which the project owner declined (F20).

## Lab hardware profile

| Item       | Baseline                                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------- |
| Screen     | 1366 × 768 (layouts are verified there; usable down to 1024 × 600)                                                  |
| Memory     | about 4 GB                                                                                                          |
| CPU        | dual-core (verified in the browser suite with a 4× CPU slowdown)                                                    |
| Storage    | a few hundred MB free for the browser profile (a media-heavy paper needs about twice its size while being prepared) |
| Connection | a shared lab uplink; B21 measured 2 Mbit/s with 300 ms RTT and 3 % loss as the congested case                       |

## What a student's machine is checked for

The assessment preview runs a **computer check** before Start (`components/student/compatibility-check.tsx`,
`lib/compat/compatibility.ts`):

| Check                                                     | Result if missing | Why                                                                       |
| --------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------- |
| Local answer storage (IndexedDB)                          | **blocks Start**  | Answers must survive a network drop (`01 §10`).                           |
| Network                                                   | **blocks Start**  | Starting needs the server; after Start the exam tolerates outages.        |
| Storage space for the paper                               | **blocks Start**  | Pre-cached media must fit (ciphertext plus the decrypted copy).           |
| Browser version                                           | warns             | Points old Chrome on Windows 7/8.1 to Firefox ESR.                        |
| One-tab lock (Web Locks)                                  | warns             | Without it, the student is told to keep one tab open.                     |
| Offline media (Cache Storage, service worker, Web Crypto) | warns             | Needs a secure (https) connection; without it, pictures need the network. |
| Screen size                                               | warns             | Asks to maximise the window or reduce zoom.                               |

## Verification

- **Automated (CI, `apps/web/e2e`)**: Playwright on current Chromium, Firefox and WebKit, at 1366 × 768,
  with a 4× CPU slowdown profile for the exam runtime; accessibility (axe) and keyboard-only runs.
- **Manual (before launch — B23 lab preparation)**: the oldest supported versions
  (Chrome/Edge 111, Firefox 115 ESR on Windows 7) and a real low-end lab PC. Playwright only ships
  current browser engines, so these cannot be automated here; record results in the B23 launch checklist.
