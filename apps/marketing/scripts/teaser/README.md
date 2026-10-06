# The one-minute tour video

`public/teaser/examkeep-tour.mp4` (and its poster) is recorded from the real app on the fictional
demo school, like the screenshots. The cursor, the click marks, the gentle zoom, the captions and
the interface sounds are added afterwards from a timeline the recorder writes. There is no music
and no voice-over; the only sounds are clicks, typing and short confirmation tones, synthesised by
`compose.py`.

Against a local stack (API on 3001, web on 3000, both with `PLATFORM_ROOT_DOMAIN=localhost` and
`PRODUCT_NAME=ExamKeep`), with the marketing app built (the cards use its fonts):

```sh
PLATFORM_ROOT_DOMAIN=localhost pnpm --filter @atlas/load demo-school seed --live   # leave running 2+ min
node scripts/teaser/cards.mjs       # title, end and caption cards
node scripts/teaser/record.mjs      # every scene; ONLY=review,control to redo some
python3 scripts/teaser/compose.py   # needs ffmpeg, numpy and Pillow
```

The recorder approves a pending question (`REVIEW_INDEX`), starts and submits one student's paper
(`STUDENT_INDEX`) and publishes the Continuous Assessment's results, so a second full run needs a
fresh seed. Work files go to the system temp folder (`examkeep-tour/`). Encode the web copy from
the master and take the poster from a scene frame:

```sh
ffmpeg -i examkeep-tour-master.mp4 -c:v libx264 -crf 24 -preset slow -c:a aac -b:a 96k \
  -movflags +faststart public/teaser/examkeep-tour.mp4
```

What the video shows must stay true of the product, and each caption describes only what is on
screen at the time.
