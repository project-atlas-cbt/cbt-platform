# Locking down exam computers (Chrome and Edge on Windows)

For the school's IT person. Plain truth first: **a web page cannot stop a browser from opening a new tab.** ExamKeep notices when a student leaves the exam page, warns them and records it for the invigilator, but real prevention has to come from how the lab computers are set up. This guide gives three layers. Use layer 1 at minimum; add 2 and 3 where you can.

Test every setting on **one computer first**, with a throwaway student account, before rolling it out. Browser behaviour changes between versions and we have not been able to test on your hardware.

Replace `examkeep.com` below if the school uses a different domain. Exams use the school address (for example `ola.examkeep.com`), its API (`ola.api.examkeep.com`) and `media.examkeep.com` for images. All three end in `examkeep.com`.

## Layer 1: only allow ExamKeep (most useful, do this one)

Even if a student opens a new tab, it can only load ExamKeep. Search engines and other sites show a "blocked by your administrator" page.

Chrome policy path: `HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Google\Chrome`
Edge policy path: `HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Microsoft\Edge`

Under each path create these subkeys, each with string values named `1`, `2`, `3`...:

| Subkey         | Values               |
| -------------- | -------------------- |
| `URLBlocklist` | `1` = `*`            |
| `URLAllowlist` | `1` = `examkeep.com` |

Then add these DWORD values directly under the same path:

| Value                                                                     | Data | Effect                                         |
| ------------------------------------------------------------------------- | ---- | ---------------------------------------------- |
| `IncognitoModeAvailability` (Chrome) / `InPrivateModeAvailability` (Edge) | `1`  | No private windows (they would skip the rules) |
| `BrowserGuestModeEnabled`                                                 | `0`  | No guest profile                               |
| `BrowserAddProfileEnabled`                                                | `0`  | Cannot add another profile                     |
| `DeveloperToolsAvailability`                                              | `2`  | No developer tools                             |

Also add a subkey `ExtensionInstallBlocklist` with `1` = `*`, so students cannot install extensions.

Check it worked: open `chrome://policy` (or `edge://policy`), press "Reload policies" and look for the settings. Then try opening a new tab and searching; it should be blocked.

If you manage computers centrally (Group Policy, Intune), use the Chrome and Edge administrative templates and set the same policies there instead of the registry.

## Layer 2: kiosk mode (no tabs, no address bar)

Kiosk mode starts the browser full screen on the exam address with the tab strip and address bar hidden.

- Chrome: `chrome.exe --kiosk https://SCHOOL.examkeep.com`
- Edge: `msedge.exe --kiosk https://SCHOOL.examkeep.com --edge-kiosk-type=fullscreen`

Make a desktop shortcut with this command and use that for exam day. Run exams from a normal student Windows account, not an administrator account. Kiosk mode on its own does not always block keyboard shortcuts such as Ctrl+N (new window), so keep Layer 1 on as well. Staff can leave kiosk mode with Alt+F4.

For Edge, Windows also has an "assigned access" single-app kiosk setup that locks a Windows account to one Edge window. It is the strictest option on Windows; follow Microsoft's "Set up a single-app kiosk" instructions and test with a student account.

## Layer 3: people and the room

No computer setting can stop a phone, a neighbour's screen, or a second computer. Keep invigilators walking the room and ask students to leave phones away. In ExamKeep, the Control Center shows how many times each student left the exam window (Tab hidden, Window blur, Full screen exit). These are counts, not proof of cheating: a notification or a mis-click can cause one. Use them to know who to watch, then decide as a person.

## What ExamKeep does by itself

- Records when the exam window loses focus, the tab is hidden, or full screen is left. The invigilator sees the counts live.
- Shows the student a notice when they return, saying it was recorded.
- Offers a "Full screen" button at the top of the exam page. A web page can only enter full screen when the student presses a button, so it cannot force it.
- Allows only one open exam tab per student; a second tab cannot sign in or take over silently.

## Checklist before an exam

1. Policies applied and confirmed in `chrome://policy` / `edge://policy`.
2. Kiosk shortcut on the desktop (Layer 2).
3. A student account signs in, starts a practice exam, and a new tab cannot load a search page.
4. Images in questions still show (confirms `media.examkeep.com` is allowed).
5. Invigilators know where to find the signal counts.
