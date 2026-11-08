/** Find this computer's addresses on the local network (e.g. 192.168.1.20). */
import { networkInterfaces } from 'node:os';

export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === 'IPv4' && !a.internal) out.push(a.address);
    }
  }
  // Home networks first (192.168.x.x, then 10.x.x.x, then 172.16-31.x.x).
  const rank = (ip: string): number => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : 2);
  return out.sort((a, b) => rank(a) - rank(b));
}
