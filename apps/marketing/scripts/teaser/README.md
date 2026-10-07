# The tour video

`public/teaser/examkeep-tour.mp4` (and its poster) is recorded from the real app on the fictional
demo school, like the screenshots. The cursor, the click marks, the gentle zoom, the captions and
the sound are added afterwards from a timeline the recorder writes. There is no voice-over.

**Sound rule (product owner):** never music, musical instruments, melodies, chords, beats,
chimes or pitched notification tones, in this or any video. `sound.py` makes every sound from
filtered noise, with no oscillator ("quiet digital realism", approved 2026-10-07): a near-silent
computer-room bed that changes a little per scene and drops back while the network is out; a
dry "tik" for ordinary clicks, a deeper "tuk" for the actions that matter, a breath of air on
each zoom, small grains for state changes and background work, and a firm, unmusical "final"
for publishing. Cursor movement is silent. The recorder places sounds on actions
(`click(…, { sound })`, `cue(name)`, `data(on)`), so they follow what happens on screen. Keep new
sounds non-tonal; the mix sits near -40 dBFS for the room and -20 to -16 for the interface.

Against a local stack (API on 3001, web on 3000, both with `PLATFORM_ROOT_DOMAIN=localhost` and
`PRODUCT_NAME=ExamKeep`), with the marketing app built (the cards use its fonts):

```sh
PLATFORM_ROOT_DOMAIN=localhost pnpm --filter @atlas/load demo-school seed --live   # leave running 2+ min
node scripts/teaser/cards.mjs       # title, end and caption cards
node scripts/teaser/record.mjs      # every scene; ONLY=review,control to redo some
python3 scripts/teaser/compose.py   # needs ffmpeg, numpy and Pillow
```

The recorder imports a class list as the Moderator, imports ten questions as a teacher and sends
them for review, has the HOD approve one of them, starts and submits one student's paper
(`STUDENT_INDEX`), publishes the Continuous Assessment's results, and signs in as a student who did
well to open their result (picked from the results table; `RESULT_STUDENT` names one instead).
A second full run needs a fresh seed. Imported students
cannot be deleted either: to retake only the import, give it a new ID range with
`IMPORT_BASE` (default 201; each take uses 29 IDs). Work files go to the system temp folder (`examkeep-tour/`). Encode the web copy from
the master and take the poster from a scene frame:

```sh
ffmpeg -i examkeep-tour-master.mp4 -c:v libx264 -crf 24 -preset slow -c:a aac -b:a 96k \
  -movflags +faststart public/teaser/examkeep-tour.mp4
```

What the video shows must stay true of the product, and each caption describes only what is on
screen at the time.
