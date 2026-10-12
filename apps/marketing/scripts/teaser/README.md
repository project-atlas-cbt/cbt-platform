# The tour video

`public/teaser/examkeep-tour.mp4` (and its poster) is recorded from the real app on the fictional
demo school, like the screenshots. The cursor, the click marks, the gentle zoom, the captions and
the sound are added afterwards from a timeline the recorder writes. There is no voice-over.

**Sound rule (product owner):** never music, musical instruments, melodies, chords, beats,
chimes or pitched notification tones, in this or any video. The sound (revised 2026-10-12) is a
very quiet recorded nature bed under every scene, and one recorded mouse click for every click-like
sound, at different loudness for ordinary and important actions; a page-turn rustle marks the file
drag and background work. Hover, zoom and state changes are silent. The samples are CC0 from
BigSoundBank (`sounds/`, sources in `sounds/README.md`). `SOUND_SET=synth` falls back to the older
filtered-noise sounds. Env for `compose.py`: `BED=<file>[:start-seconds]` and `BED_DB` (bed level,
RMS dBFS, use -47); `AUDIO_ONLY=1` remixes sound over the last video-only render. The first frame is
the blue title card, which is also the poster.

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
Seed with `DEMO_RESULT_DETAIL=FULL_REVIEW` so the result screens show every question (the exam
setting cannot change once the exam leaves draft). The `resultdetail` scene has a teacher open one
student's result; `myresult` then scrolls that student's question review. A second full run needs a fresh seed. Imported students
cannot be deleted either: to retake only the import, give it a new ID range with
`IMPORT_BASE` (default 201; each take uses 29 IDs). Work files go to the system temp folder (`examkeep-tour/`). Encode the web copy from
the master and take the poster from the title card (about 1.5 s):

```sh
ffmpeg -i examkeep-tour-master.mp4 -c:v libx264 -crf 24 -preset slow -c:a aac -b:a 96k \
  -movflags +faststart public/teaser/examkeep-tour.mp4
```

What the video shows must stay true of the product, and each caption describes only what is on
screen at the time.
