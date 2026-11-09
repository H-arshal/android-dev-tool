import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';
import { Readable } from 'stream';
import { Downloader } from '../../src/core/installer/downloader';
import { SdkDiscovery } from '../../src/core/sdk/sdk-discovery';
import { DiagnosticsEngine } from '../../src/core/diagnostics/diagnostics';
import { WindowsEnvironment } from '../../src/core/environment/windows-environment';
import { ProcessManager } from '../../src/core/process/process-manager';

describe('Milestone 6 Integration: Migration, Recovery & Diagnostics Probes', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'android-dev-tool-int-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
    vi.restoreAllMocks();
  });

  describe('Brownfield SDK Detection & Migration', () => {
    it('detects a pre-existing custom SDK layout and inspects existing components without re-downloading', async () => {
      const brownfieldSdkRoot = path.join(tempDir, 'existing-android-sdk');
      const platformToolsDir = path.join(brownfieldSdkRoot, 'platform-tools');
      const buildToolsDir = path.join(brownfieldSdkRoot, 'build-tools', '34.0.0');
      const platformsDir = path.join(brownfieldSdkRoot, 'platforms', 'android-34');
      const licensesDir = path.join(brownfieldSdkRoot, 'licenses');

      fs.mkdirSync(platformToolsDir, { recursive: true });
      fs.mkdirSync(buildToolsDir, { recursive: true });
      fs.mkdirSync(platformsDir, { recursive: true });
      fs.mkdirSync(licensesDir, { recursive: true });

      // Create dummy source.properties
      fs.writeFileSync(
        path.join(platformToolsDir, 'source.properties'),
        'Pkg.Revision=35.0.1\nPkg.Desc=Android SDK Platform-Tools'
      );
      fs.writeFileSync(
        path.join(buildToolsDir, 'source.properties'),
        'Pkg.Revision=34.0.0\nPkg.Desc=Android SDK Build-Tools'
      );
      fs.writeFileSync(
        path.join(platformsDir, 'source.properties'),
        'Pkg.Revision=1\nPlatform.Version=14'
      );
      fs.writeFileSync(
        path.join(licensesDir, 'android-sdk-license'),
        '24333f8a63b6825ea9c5514f83c2829b004d1fee\n'
      );

      vi.spyOn(WindowsEnvironment, 'getUserEnvironmentVariable').mockImplementation(async (key) => {
        if (key === 'ANDROID_HOME') return brownfieldSdkRoot;
        if (key === 'JAVA_HOME') return 'C:\\Program Files\\Java\\jdk-17';
        return null;
      });

      vi.spyOn(WindowsEnvironment, 'getUserPath').mockResolvedValue(
        `${platformToolsDir};C:\\Windows\\system32`
      );

      vi.spyOn(ProcessManager, 'execute').mockImplementation(async (command) => {
        if (command.includes('adb')) {
          return { exitCode: 0, stdout: 'Android Debug Bridge version 1.0.41\nVersion 35.0.1-11580240', stderr: '' };
        }
        if (command.includes('java')) {
          return { exitCode: 0, stdout: '', stderr: 'openjdk version "17.0.10" 2024-01-16' };
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      });

      const status = await SdkDiscovery.scanEnvironment(brownfieldSdkRoot);

      expect(status.sdkRoot).toBe(brownfieldSdkRoot);
      expect(status.licensesAccepted).toBe(true);
      expect(status.adbAvailableInPath).toBe(true);
      expect(status.adbVersion).toBe('35.0.1');
      expect(status.javaDetected).toBe(true);
      expect(status.components).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'platform-tools', version: '35.0.1' }),
          expect.objectContaining({ id: 'build-tools', version: '34.0.0' }),
          expect.objectContaining({ id: 'platforms', version: 'android-34' })
        ])
      );
    });
  });

  describe('Interrupted Download & Fault Recovery', () => {
    it('aborts cleanly on request failure and removes leftover .download partial files', async () => {
      const destFile = path.join(tempDir, 'partial-download.zip');
      const tempDownloadFile = `${destFile}.download`;

      // Mock client that emits an error on the request
      const mockFailingClient = {
        get: (_url: string, _callback: (res: any) => void) => {
          const emitter = new EventEmitter() as any;
          emitter.setTimeout = vi.fn();
          emitter.destroy = vi.fn();

          process.nextTick(() => {
            emitter.emit('error', new Error('Network socket disconnected unexpectedly'));
          });

          return emitter;
        }
      };

      await expect(
        Downloader.downloadFile('https://example.com/test.zip', destFile, {
          requestClient: mockFailingClient
        })
      ).rejects.toThrow('Network socket disconnected unexpectedly');

      // Assert that partial temporary file was cleaned up
      expect(fs.existsSync(tempDownloadFile)).toBe(false);
      expect(fs.existsSync(destFile)).toBe(false);
    });

    it('resets any stale .download file remaining from a previous crash before starting a new download', async () => {
      const destFile = path.join(tempDir, 'restarted-download.zip');
      const staleTempDownloadFile = `${destFile}.download`;

      // Pre-seed a corrupt stale .download file
      fs.writeFileSync(staleTempDownloadFile, 'corrupt-stale-debris');
      expect(fs.existsSync(staleTempDownloadFile)).toBe(true);

      const testContent = 'clean-download-data-stream';
      const mockSuccessClient = {
        get: (_url: string, callback: (res: any) => void) => {
          const emitter = new EventEmitter() as any;
          emitter.setTimeout = vi.fn();
          emitter.destroy = vi.fn();

          const stream = new Readable({
            read() {
              this.push(Buffer.from(testContent));
              this.push(null);
            }
          });
          (stream as any).statusCode = 200;
          (stream as any).headers = { 'content-length': String(testContent.length) };

          process.nextTick(() => callback(stream));
          return emitter;
        }
      };

      const result = await Downloader.downloadFile('https://example.com/test.zip', destFile, {
        requestClient: mockSuccessClient
      });

      expect(result.destPath).toBe(destFile);
      expect(fs.existsSync(destFile)).toBe(true);
      expect(fs.readFileSync(destFile, 'utf-8')).toBe(testContent);
      expect(fs.existsSync(staleTempDownloadFile)).toBe(false);
    });

    it('rejects download when SHA-256 verification fails', async () => {
      const destFile = path.join(tempDir, 'corrupt-hash.zip');
      const testContent = 'invalid-payload-data';

      const mockClient = {
        get: (_url: string, callback: (res: any) => void) => {
          const emitter = new EventEmitter() as any;
          emitter.setTimeout = vi.fn();
          emitter.destroy = vi.fn();

          const stream = new Readable({
            read() {
              this.push(Buffer.from(testContent));
              this.push(null);
            }
          });
          (stream as any).statusCode = 200;
          (stream as any).headers = { 'content-length': String(testContent.length) };

          process.nextTick(() => callback(stream));
          return emitter;
        }
      };

      const result = await Downloader.downloadFile('https://example.com/corrupt.zip', destFile, {
        expectedSha256: 'expected-fake-sha256-hash',
        requestClient: mockClient
      });

      expect(result.verified).toBe(false);
    });
  });

  describe('End-to-End Diagnostics & One-Click Auto-Repair Workflow', () => {
    it('detects missing environment settings and executes auto-repair cleanly', async () => {
      const mockSdkRoot = path.join(tempDir, 'managed-sdk');
      const platformTools = path.join(mockSdkRoot, 'platform-tools');
      const cmdlineToolsBin = path.join(mockSdkRoot, 'cmdline-tools', 'latest', 'bin');
      const licensesDir = path.join(mockSdkRoot, 'licenses');
      fs.mkdirSync(platformTools, { recursive: true });
      fs.mkdirSync(cmdlineToolsBin, { recursive: true });

      // Run probes without ANDROID_HOME, with missing license and missing PATH
      const issuesBefore = await DiagnosticsEngine.runAllChecks({
        sdkRoot: mockSdkRoot,
        androidHome: null,
        androidSdkRoot: null,
        javaHome: 'C:\\Program Files\\Java\\jdk-17'
      });

      expect(issuesBefore.length).toBeGreaterThan(0);
      const androidHomeIssue = issuesBefore.find(i => i.id === 'missing-android-home');
      const licenseIssue = issuesBefore.find(i => i.id === 'unaccepted-licenses');

      expect(androidHomeIssue).toBeDefined();
      expect(licenseIssue).toBeDefined();

      // Execute auto-repair for licenses
      const licenseRepairResult = await DiagnosticsEngine.executeAutoRepair(licenseIssue!.id, {
        sdkRoot: mockSdkRoot,
        androidHome: mockSdkRoot
      });

      expect(licenseRepairResult.success).toBe(true);
      expect(fs.existsSync(path.join(licensesDir, 'android-sdk-license'))).toBe(true);
    });
  });
});
