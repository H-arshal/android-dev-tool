import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CmdlineToolsAdapter } from '../../src/core/sdk/package-manager-adapter';
import { GOOGLE_KNOWN_LICENSES } from '../../src/shared/constants';

describe('CmdlineToolsAdapter', () => {
  let tempSdkDir: string;

  beforeEach(() => {
    tempSdkDir = path.join(os.tmpdir(), `sdk_test_${Date.now()}`);
    fs.mkdirSync(tempSdkDir, { recursive: true });
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempSdkDir)) {
        fs.rmSync(tempSdkDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it('should accept licenses by writing standard Google license hashes to disk', async () => {
    const adapter = new CmdlineToolsAdapter(tempSdkDir);
    const result = await adapter.acceptLicenses();

    expect(result.success).toBe(true);

    const licenseFile = path.join(tempSdkDir, 'licenses', GOOGLE_KNOWN_LICENSES.SDK_LICENSE);
    expect(fs.existsSync(licenseFile)).toBe(true);

    const content = fs.readFileSync(licenseFile, 'utf-8');
    expect(content).toContain('24333f8a63b6825ea9c5514f83c2829b004d1fee');
    expect(content).toContain('d56f5187479451eabf01fb78af6dfcb131a6481e');
  });

  it('should parse packages from standard sdkmanager output text', () => {
    const adapter = new CmdlineToolsAdapter(tempSdkDir);
    const mockOutput = `
Installed packages:
--------------------------------------
  Path                    | Version | Description
  build-tools;34.0.0      | 34.0.0  | Android SDK Build-Tools 34.0.0
  platform-tools          | 35.0.1  | Android SDK Platform-Tools
  platforms;android-34    | 3       | Android SDK Platform 34
`;

    const parsed = (adapter as any).parsePackagesFromOutput(mockOutput, true);
    expect(parsed.length).toBe(3);
    expect(parsed[0].id).toBe('build-tools;34.0.0');
    expect(parsed[0].category).toBe('build-tools');
    expect(parsed[0].isInstalled).toBe(true);

    expect(parsed[1].id).toBe('platform-tools');
    expect(parsed[1].category).toBe('platform-tools');

    expect(parsed[2].id).toBe('platforms;android-34');
    expect(parsed[2].category).toBe('platforms');
  });

  it('should detect installed packages from disk and return accurate catalog', async () => {
    const isWindows = process.platform === 'win32';
    // Create mock installed directories on disk
    fs.mkdirSync(path.join(tempSdkDir, 'cmdline-tools', 'latest', 'bin'), { recursive: true });
    fs.mkdirSync(path.join(tempSdkDir, 'platform-tools'), { recursive: true });
    fs.writeFileSync(path.join(tempSdkDir, 'platform-tools', isWindows ? 'adb.exe' : 'adb'), 'fake');
    fs.mkdirSync(path.join(tempSdkDir, 'build-tools', '34.0.0'), { recursive: true });
    fs.mkdirSync(path.join(tempSdkDir, 'platforms', 'android-34'), { recursive: true });

    const adapter = new CmdlineToolsAdapter(tempSdkDir);
    const catalog = await adapter.getPackageCatalog();

    const cmdline = catalog.find(p => p.id === 'cmdline-tools;latest');
    expect(cmdline?.isInstalled).toBe(true);

    const platformTools = catalog.find(p => p.id === 'platform-tools');
    expect(platformTools?.isInstalled).toBe(true);

    const bt34 = catalog.find(p => p.id === 'build-tools;34.0.0');
    expect(bt34?.isInstalled).toBe(true);

    const plat34 = catalog.find(p => p.id === 'platforms;android-34');
    expect(plat34?.isInstalled).toBe(true);

    const plat35 = catalog.find(p => p.id === 'platforms;android-35');
    expect(plat35?.isInstalled).toBe(false);
  });
});

