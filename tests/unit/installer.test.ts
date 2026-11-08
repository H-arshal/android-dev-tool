import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Installer } from '../../src/core/installer/installer';

describe('Installer', () => {
  let tempTestDir: string;

  beforeEach(() => {
    tempTestDir = path.join(os.tmpdir(), `installer_test_${Date.now()}`);
    fs.mkdirSync(tempTestDir, { recursive: true });
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempTestDir)) {
        fs.rmSync(tempTestDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it('should successfully pass pre-flight validation on writable directory with space', async () => {
    const installer = new Installer();
    // Validate preflight via private method cast
    await expect(
      (installer as any).validatePreflight(tempTestDir, 'physical-device')
    ).resolves.not.toThrow();
  });
});
