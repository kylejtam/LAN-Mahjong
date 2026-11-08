import { describe, expect, it } from 'vitest';
import { APP_VERSION, RETRY_AFTER_MS, isNewer, readRelease, shouldUpdate } from '../src/update.js';

const release = (tag: string, assets = ['LAN-Mahjong-Setup.exe', 'LAN-Mahjong-Setup.exe.sha256']) => ({
  tag_name: tag,
  draft: false,
  prerelease: false,
  assets: assets.map((name) => ({ name, browser_download_url: `https://example.test/${name}` })),
});

describe('version numbers and updates', () => {
  it('knows its own version', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('compares versions number by number', () => {
    expect(isNewer('1.1.0', '1.0.0')).toBe(true);
    expect(isNewer('v1.10.0', '1.9.2')).toBe(true);
    expect(isNewer('2.0.0', '1.99.99')).toBe(true);
    expect(isNewer('1.0.0', '1.0.0')).toBe(false);
    expect(isNewer('1.0.0', '1.1.0')).toBe(false);
  });

  it('reads the installer and its fingerprint from a GitHub release', () => {
    expect(readRelease(release('v1.2.0'))).toEqual({
      version: '1.2.0',
      installerUrl: 'https://example.test/LAN-Mahjong-Setup.exe',
      checksumUrl: 'https://example.test/LAN-Mahjong-Setup.exe.sha256',
    });
    expect(readRelease(release('v1.2.0', ['LAN-Mahjong-Setup.exe']))).toBeNull(); // no fingerprint: don't trust it
    expect(readRelease({ ...release('v1.2.0'), draft: true })).toBeNull();
    expect(readRelease({ message: 'Not Found' })).toBeNull();
    expect(readRelease(null)).toBeNull();
  });

  it('updates only to a newer version, and does not retry a failed one straight away', () => {
    const r = readRelease(release('v1.2.0'));
    expect(shouldUpdate('1.1.0', r, null, 0)).toBe(true);
    expect(shouldUpdate('1.2.0', r, null, 0)).toBe(false);
    expect(shouldUpdate('1.3.0', r, null, 0)).toBe(false);
    expect(shouldUpdate('1.1.0', null, null, 0)).toBe(false);
    const tried = { version: '1.2.0', at: 1000 };
    expect(shouldUpdate('1.1.0', r, tried, 1000 + 60_000)).toBe(false);
    expect(shouldUpdate('1.1.0', r, tried, 1000 + RETRY_AFTER_MS + 1)).toBe(true);
    expect(shouldUpdate('1.1.0', r, { version: '1.1.5', at: 1000 }, 2000)).toBe(true); // a different version
  });
});
