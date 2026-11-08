/**
 * Version number and the automatic updater.
 *
 * The installed Windows app checks GitHub for a newer release each time it
 * starts (before anyone can join). If there is one, it downloads the new
 * installer, checks its fingerprint (SHA-256), runs it quietly and exits; the
 * installer replaces the files and starts LAN Mahjong again. If anything goes
 * wrong (no internet, a bad download), the game simply starts as it is.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

declare const __APP_VERSION__: string | undefined;

/** This copy's version, e.g. "1.1.0" (built in when packaged; read from package.json otherwise). */
export const APP_VERSION: string = (() => {
  if (typeof __APP_VERSION__ === 'string') return __APP_VERSION__;
  try {
    const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '../../package.json');
    return (JSON.parse(readFileSync(pkg, 'utf8')) as { version: string }).version;
  } catch {
    return '0.0.0';
  }
})();

export const RELEASES_API = 'https://api.github.com/repos/kylejtam/LAN-Mahjong/releases/latest';
export const INSTALLER_NAME = 'LAN-Mahjong-Setup.exe';

/** Is version a newer than version b? ("1.10.0" > "1.9.2"; a leading "v" is ignored.) */
export function isNewer(a: string, b: string): boolean {
  const parts = (v: string): number[] => v.replace(/^v/i, '').split(/[.-]/).slice(0, 3).map((n) => Number.parseInt(n, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  }
  return false;
}

export interface ReleaseInfo {
  version: string;
  installerUrl: string;
  /** Where the installer's SHA-256 fingerprint can be downloaded. */
  checksumUrl: string;
}

/** Pick the installer and its fingerprint out of GitHub's "latest release" answer. */
export function readRelease(json: unknown): ReleaseInfo | null {
  if (!json || typeof json !== 'object') return null;
  const r = json as { tag_name?: unknown; draft?: unknown; prerelease?: unknown; assets?: unknown };
  if (typeof r.tag_name !== 'string' || r.draft || r.prerelease || !Array.isArray(r.assets)) return null;
  const url = (name: string): string | null => {
    const a = (r.assets as { name?: unknown; browser_download_url?: unknown }[]).find((x) => x.name === name);
    return a && typeof a.browser_download_url === 'string' ? a.browser_download_url : null;
  };
  const installerUrl = url(INSTALLER_NAME);
  const checksumUrl = url(`${INSTALLER_NAME}.sha256`);
  if (!installerUrl || !checksumUrl) return null;
  return { version: r.tag_name.replace(/^v/i, ''), installerUrl, checksumUrl };
}

interface Attempt {
  version: string;
  at: number;
}

/** Don't retry the same version within this time (stops a failed update looping). */
export const RETRY_AFTER_MS = 6 * 60 * 60 * 1000;

/** Should we install this release now? */
export function shouldUpdate(current: string, release: ReleaseInfo | null, lastAttempt: Attempt | null, now: number): boolean {
  if (!release || !isNewer(release.version, current)) return false;
  if (lastAttempt && lastAttempt.version === release.version && now - lastAttempt.at < RETRY_AFTER_MS) return false;
  return true;
}

const HEADERS = { 'user-agent': 'LAN-Mahjong-updater', accept: 'application/vnd.github+json' };

/**
 * Check for a newer version and, if there is one, start installing it.
 * Returns true when the installer has been started (the caller should exit
 * straight away so the installer can replace the files).
 */
export async function updateIfAvailable(opts: { stateDir: string; log: (line: string) => void }): Promise<boolean> {
  const { stateDir, log } = opts;
  const attemptFile = join(stateDir, 'update-attempt.json');
  try {
    // LAN_MAHJONG_RELEASES_URL is only for testing the updater against a pretend GitHub.
    const res = await fetch(process.env.LAN_MAHJONG_RELEASES_URL ?? RELEASES_API, { headers: HEADERS, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return false; // no releases yet, or GitHub unreachable
    const release = readRelease(await res.json());
    let last: Attempt | null = null;
    try {
      last = existsSync(attemptFile) ? (JSON.parse(readFileSync(attemptFile, 'utf8')) as Attempt) : null;
    } catch {
      last = null;
    }
    if (!release || !shouldUpdate(APP_VERSION, release, last, Date.now())) return false;

    log(`  A new version of LAN Mahjong is available: ${release.version} (you have ${APP_VERSION}).`);
    log('  Downloading it now. LAN Mahjong will restart by itself in a moment...');
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(attemptFile, JSON.stringify({ version: release.version, at: Date.now() }));

    const sumText = await (await fetch(release.checksumUrl, { headers: HEADERS, signal: AbortSignal.timeout(15000) })).text();
    const expected = /[0-9a-f]{64}/i.exec(sumText)?.[0]?.toLowerCase();
    const download = await fetch(release.installerUrl, { headers: HEADERS, signal: AbortSignal.timeout(5 * 60 * 1000) });
    if (!expected || !download.ok) throw new Error('the download did not work');
    const body = Buffer.from(await download.arrayBuffer());
    const actual = createHash('sha256').update(body).digest('hex');
    if (actual !== expected) throw new Error('the download was damaged (fingerprint did not match)');

    const file = join(tmpdir(), `LAN-Mahjong-Setup-${release.version}.exe`);
    writeFileSync(file, body);
    // /S = install quietly; /RELAUNCH = start LAN Mahjong again afterwards.
    const started = await new Promise<boolean>((done) => {
      const child = spawn(file, ['/S', '/RELAUNCH'], { detached: true, stdio: 'ignore', windowsHide: true });
      child.once('error', () => done(false)); // could not start the installer
      child.once('spawn', () => done(true));
      child.unref();
    });
    if (!started) throw new Error('the installer would not start');
    log(`  Installing version ${release.version}...`);
    return true;
  } catch (err) {
    log(`  Could not update right now (${(err as Error).message}). Starting the current version.`);
    return false;
  }
}
