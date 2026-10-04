// F20: a user-space stand-in for run.sh's netem relay, for hosts whose
// kernel has no `sch_netem` (the F20 cloud sandbox: "Specified qdisc kind is
// unknown"). Same job as proxy.mjs + `tc netem`: a TCP relay in front of the
// API and object storage whose bytes all cross one shaped link, like a
// school lab sharing one uplink. No dependencies.
//
//   PROFILE=ng-congested ROUTES=13001:127.0.0.1:3001,19000:127.0.0.1:9000 node shaper.mjs
//
// Model (per direction, applied to every relayed byte, as netem on the
// relay's egress is):
// - one link shared by every connection in both directions, serialising
//   segments at `rate` (the 2 Mbit lab uplink);
// - one-way delay drawn from a normal distribution (netem `delay d j
//   distribution normal`), never reordering a connection's bytes;
// - loss: a lost 1460-byte segment is retransmitted after an RTO — it
//   crosses the link twice and everything behind it on that connection
//   waits (head-of-line), which is what loss costs a TCP stream.
//
// It is an approximation, and an optimistic one: TCP congestion control
// (the sender halving its window after a loss) is not modelled, so on a
// saturated link real throughput is somewhat lower than here. Reports made
// through it say so (LOAD_NETWORK_PROFILE).
import net from 'node:net';

/** @typedef {{ delayMs: number, jitterMs: number, loss: number, rateBps: number }} Profile */
/** @type {Record<string, Profile>} */
const PROFILES = {
  // ≈150 ms RTT ±40, ~1 % round-trip loss, no rate cap
  'ng-typical': { delayMs: 75, jitterMs: 20, loss: 0.005, rateBps: 0 },
  // ≈300 ms RTT ±100, ~3 % round-trip loss, 2 Mbit shared
  'ng-congested': { delayMs: 150, jitterMs: 50, loss: 0.015, rateBps: 2_000_000 },
};
const found = PROFILES[process.env.PROFILE ?? ''];
if (!found) {
  console.error(`PROFILE must be one of: ${Object.keys(PROFILES).join(', ')}`);
  process.exit(2);
}
/** @type {Profile} */
const profile = found;
const SEGMENT = 1460;
const MIN_RTO_MS = 200;
/** Pause a source socket while this much of its data is in flight. */
const HIGH_WATER = 256 * 1024;

/** @param {number} mean @param {number} sd @returns {number} */
function normal(mean, sd) {
  const u = 1 - Math.random();
  const v = Math.random();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** The shared link: when it next has capacity, in ms (performance clock). */
let linkFreeAt = 0;
/** @param {number} bytes @param {number} now @returns {number} */
function transmit(bytes, now) {
  if (!profile.rateBps) return now;
  const start = Math.max(now, linkFreeAt);
  linkFreeAt = start + (bytes * 8 * 1000) / profile.rateBps;
  return linkFreeAt;
}

/**
 * One direction of one connection: ordered, delayed, rate-shared. Segments
 * wait in a FIFO drained by a single timer — one timer per segment could
 * fire out of order when delivery times tie (Node groups timers by
 * duration), which reordered bytes inside a TCP stream.
 */
/**
 * @param {import('node:net').Socket} from
 * @param {import('node:net').Socket} to
 */
function pipeShaped(from, to) {
  /** @type {{ at: number, segment: Buffer }[]} */
  const queue = [];
  let lastDelivery = 0;
  let inFlight = 0;
  let paused = false;
  /** @type {NodeJS.Timeout | null} */
  let timer = null;
  let ended = false;

  const drain = () => {
    timer = null;
    const now = performance.now();
    while (queue.length > 0 && queue[0].at <= now) {
      const { segment } = /** @type {{ at: number, segment: Buffer }} */ (queue.shift());
      inFlight -= segment.length;
      if (!to.destroyed) to.write(segment);
    }
    if (paused && inFlight < HIGH_WATER / 2) {
      paused = false;
      from.resume();
    }
    if (queue.length > 0) schedule();
    else if (ended && !to.destroyed) to.end();
  };
  const schedule = () => {
    if (timer || queue.length === 0) return;
    timer = setTimeout(drain, Math.max(0, (queue[0]?.at ?? 0) - performance.now()));
  };

  from.on('data', (/** @type {Buffer} */ chunk) => {
    for (let offset = 0; offset < chunk.length; offset += SEGMENT) {
      const segment = chunk.subarray(offset, offset + SEGMENT);
      const now = performance.now();
      let departed = transmit(segment.length, now);
      if (Math.random() < profile.loss) {
        // Lost once: the sender notices after an RTO and sends it again.
        // The resend costs link capacity (charged now, so the link is not
        // reserved idle through the RTO) and arrives an RTO later.
        const rto = Math.max(MIN_RTO_MS, 2 * 2 * profile.delayMs);
        departed = Math.max(departed + rto, transmit(segment.length, now));
      }
      const delay = Math.max(1, normal(profile.delayMs, profile.jitterMs));
      const at = Math.max(departed + delay, lastDelivery);
      lastDelivery = at;
      inFlight += segment.length;
      queue.push({ at, segment });
    }
    schedule();
    if (inFlight > HIGH_WATER && !paused) {
      paused = true;
      from.pause();
    }
  });
  // Close only after the last delayed segment has been written.
  from.on('end', () => {
    ended = true;
    if (queue.length === 0 && !to.destroyed) to.end();
  });
}

const routes = (process.env.ROUTES ?? '').split(',').filter(Boolean);
for (const route of routes) {
  const [listen = '', host = '', port = ''] = route.split(':');
  // Half-open: each direction closes only once its own delayed bytes are
  // delivered, not when the other side finishes first.
  net
    .createServer({ allowHalfOpen: true }, (client) => {
      const upstream = net.connect({ port: Number(port), host, allowHalfOpen: true });
      pipeShaped(client, upstream);
      pipeShaped(upstream, client);
      const close = () => {
        client.destroy();
        upstream.destroy();
      };
      client.on('error', close);
      upstream.on('error', close);
    })
    .listen(Number(listen), '127.0.0.1', () =>
      console.log(`shaped relay :${listen} -> ${host}:${port} (${process.env.PROFILE})`),
    );
}
