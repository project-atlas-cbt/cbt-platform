import { createConnection, createServer, type Server, type Socket } from 'node:net';

/**
 * B22 test support: a TCP relay in front of a real dependency (Redis,
 * object storage) that a test can cut and restore, so an outage is induced
 * in the running application — every existing connection is reset and new
 * ones are refused, exactly as when the dependency's process dies — rather
 * than simulated by mocking a client method.
 */
export class TcpToggleProxy {
  private server?: Server;
  private readonly sockets = new Set<Socket>();
  private up = true;
  port = 0;

  constructor(
    private readonly targetHost: string,
    private readonly targetPort: number,
  ) {}

  async start(): Promise<number> {
    this.server = createServer((client) => {
      if (!this.up) {
        client.destroy();
        return;
      }
      const upstream = createConnection({ host: this.targetHost, port: this.targetPort });
      this.track(client);
      this.track(upstream);
      client.pipe(upstream);
      upstream.pipe(client);
      const close = () => {
        client.destroy();
        upstream.destroy();
      };
      client.on('error', close);
      upstream.on('error', close);
      client.on('close', close);
      upstream.on('close', close);
    });
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));
    const address = this.server.address();
    if (!address || typeof address === 'string') throw new Error('proxy has no port');
    this.port = address.port;
    return this.port;
  }

  /** The dependency "dies": connections reset, new ones refused. */
  down(): void {
    this.up = false;
    for (const s of this.sockets) s.destroy();
    this.sockets.clear();
  }

  /** The dependency is back. Clients reconnect on their own. */
  restore(): void {
    this.up = true;
  }

  async stop(): Promise<void> {
    this.down();
    await new Promise<void>((resolve) =>
      this.server ? this.server.close(() => resolve()) : resolve(),
    );
  }

  private track(socket: Socket): void {
    this.sockets.add(socket);
    socket.on('close', () => this.sockets.delete(socket));
  }
}
