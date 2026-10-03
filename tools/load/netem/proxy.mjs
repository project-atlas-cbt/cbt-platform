// B21 network-profile proxy: a plain TCP relay. Run inside a Linux container
// whose eth0 is shaped with `tc netem` (see run.sh) — every byte between the
// harness and the API (and object storage) then crosses one shaped link,
// exactly like a school lab sharing one uplink. No dependencies.
import net from 'node:net';

const routes = (process.env.ROUTES ?? '').split(',').filter(Boolean);
for (const route of routes) {
  // "listenPort:targetHost:targetPort"
  const [listen, host, port] = route.split(':');
  net
    .createServer((client) => {
      const upstream = net.connect(Number(port), host);
      client.pipe(upstream).pipe(client);
      const close = () => {
        client.destroy();
        upstream.destroy();
      };
      client.on('error', close);
      upstream.on('error', close);
    })
    .listen(Number(listen), '0.0.0.0', () => console.log(`relay :${listen} -> ${host}:${port}`));
}
