/**
 * B22 (08 §25 "application node crash: another stateless node serves the
 * next request"): process-wide shutdown state. On SIGTERM the process
 * reports itself not-ready (so the load balancer stops sending new
 * requests) while it finishes the ones in flight.
 */
let draining = false;

export function markDraining(): void {
  draining = true;
}

export function isDraining(): boolean {
  return draining;
}
