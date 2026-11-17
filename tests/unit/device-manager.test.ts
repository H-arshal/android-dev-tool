import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DeviceManager } from '../../src/core/device/device-manager';
import { ProcessManager } from '../../src/core/process/process-manager';

describe('DeviceManager', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('parseAdbDevicesOutput', () => {
    it('returns empty array when no devices are connected', () => {
      const output = 'List of devices attached\n\n';
      const devices = DeviceManager.parseAdbDevicesOutput(output);
      expect(devices).toEqual([]);
    });

    it('ignores adb daemon startup output', () => {
      const output = `* daemon not running; starting now at tcp:5037 *
* daemon started successfully *
List of devices attached

`;
      const devices = DeviceManager.parseAdbDevicesOutput(output);
      expect(devices).toEqual([]);
    });

    it('parses multiple connected devices with different connection types and states', () => {
      const output = `List of devices attached
emulator-5554          device product:sdk_gphone64_x86_64 model:sdk_gphone64_x86_64 device:emulator64_x86_64 transport_id:1
R5CT30ABCDE            device product:e1sxxx model:SM_S911B device:e1s transport_id:2
192.168.1.105:5555     device product:shiba model:Pixel_8 device:shiba transport_id:3
ZY227XXXXX             unauthorized transport_id:4
emulator-5556          offline transport_id:5
`;

      const devices = DeviceManager.parseAdbDevicesOutput(output);
      expect(devices).toHaveLength(5);

      // Emulator
      expect(devices[0]).toEqual({
        serial: 'emulator-5554',
        state: 'device',
        connectionType: 'emulator',
        product: 'sdk_gphone64_x86_64',
        model: 'sdk gphone64 x86 64',
        device: 'emulator64_x86_64',
        transportId: '1'
      });

      // USB Phone
      expect(devices[1]).toEqual({
        serial: 'R5CT30ABCDE',
        state: 'device',
        connectionType: 'usb',
        product: 'e1sxxx',
        model: 'SM S911B',
        device: 'e1s',
        transportId: '2'
      });

      // Wi-Fi Phone
      expect(devices[2]).toEqual({
        serial: '192.168.1.105:5555',
        state: 'device',
        connectionType: 'wifi',
        product: 'shiba',
        model: 'Pixel 8',
        device: 'shiba',
        transportId: '3'
      });

      // Unauthorized
      expect(devices[3]).toEqual({
        serial: 'ZY227XXXXX',
        state: 'unauthorized',
        connectionType: 'usb',
        transportId: '4',
        model: undefined,
        product: undefined,
        device: undefined
      });

      // Offline
      expect(devices[4]).toEqual({
        serial: 'emulator-5556',
        state: 'offline',
        connectionType: 'emulator',
        transportId: '5',
        model: undefined,
        product: undefined,
        device: undefined
      });
    });
  });

  describe('parseGetpropOutput', () => {
    it('parses system property brackets into key-value pairs', () => {
      const output = `
[ro.product.manufacturer]: [Google]
[ro.product.model]: [Pixel 8]
[ro.build.version.release]: [14]
[ro.build.version.sdk]: [34]
[ro.product.cpu.abi]: [arm64-v8a]
`;
      const props = DeviceManager.parseGetpropOutput(output);
      expect(props['ro.product.manufacturer']).toBe('Google');
      expect(props['ro.product.model']).toBe('Pixel 8');
      expect(props['ro.build.version.release']).toBe('14');
      expect(props['ro.build.version.sdk']).toBe('34');
      expect(props['ro.product.cpu.abi']).toBe('arm64-v8a');
    });
  });

  describe('parseBatteryOutput', () => {
    it('parses standard dumpsys battery output', () => {
      const output = `Current Battery Service state:
  AC powered: false
  USB powered: true
  Wireless powered: false
  Max charging current: 500000
  Max charging voltage: 5000000
  Charge counter: 3500000
  status: 2
  health: 2
  present: true
  level: 82
  scale: 100
  voltage: 4120
  temperature: 315
  technology: Li-ion`;

      const battery = DeviceManager.parseBatteryOutput(output);
      expect(battery.level).toBe(82);
      expect(battery.scale).toBe(100);
      expect(battery.isCharging).toBe(true);
      expect(battery.health).toBe('Good');
      expect(battery.temperature).toBe(31.5);
    });

    it('correctly handles discharging state', () => {
      const output = `Current Battery Service state:
  AC powered: false
  USB powered: false
  Wireless powered: false
  status: 3
  health: 2
  level: 45
  scale: 100
  temperature: 280`;

      const battery = DeviceManager.parseBatteryOutput(output);
      expect(battery.level).toBe(45);
      expect(battery.isCharging).toBe(false);
      expect(battery.temperature).toBe(28.0);
    });
  });

  describe('parseDisplaySize and parseDisplayDensity', () => {
    it('parses standard physical display size and density', () => {
      const sizeOutput = 'Physical size: 1080x2400\n';
      const densityOutput = 'Physical density: 440\n';

      expect(DeviceManager.parseDisplaySize(sizeOutput)).toBe('1080x2400');
      expect(DeviceManager.parseDisplayDensity(densityOutput)).toBe(440);
    });

    it('prefers override size and density when configured', () => {
      const sizeOutput = 'Physical size: 1080x2400\nOverride size: 720x1600\n';
      const densityOutput = 'Physical density: 440\nOverride density: 320\n';

      expect(DeviceManager.parseDisplaySize(sizeOutput)).toBe('720x1600');
      expect(DeviceManager.parseDisplayDensity(densityOutput)).toBe(320);
    });
  });

  describe('parseStorageOutput', () => {
    it('parses df -h /data output into storage structure', () => {
      const output = `Filesystem      Size  Used Avail Use% Mounted on
/dev/block/dm-5 110G   45G   65G  41% /data
`;
      const storage = DeviceManager.parseStorageOutput(output);
      expect(storage).toEqual({
        total: '110G',
        used: '45G',
        available: '65G',
        percentage: 41
      });
    });

    it('returns undefined when output is invalid', () => {
      const output = 'Permission denied\n';
      expect(DeviceManager.parseStorageOutput(output)).toBeUndefined();
    });
  });

  describe('getDeviceDetails execution flow', () => {
    it('queries system properties, battery, display, and storage for an authorized device', async () => {
      vi.spyOn(ProcessManager, 'execute').mockImplementation(async (_cmd, args) => {
        const subCmd = args.slice(2).join(' ');
        if (subCmd.startsWith('shell getprop')) {
          return {
            exitCode: 0,
            stdout: '[ro.product.manufacturer]: [Samsung]\n[ro.product.model]: [Galaxy S23]\n[ro.build.version.release]: [14]\n[ro.build.version.sdk]: [34]',
            stderr: ''
          };
        }
        if (subCmd === 'shell dumpsys battery') {
          return {
            exitCode: 0,
            stdout: 'level: 90\nscale: 100\nUSB powered: true\nhealth: 2\ntemperature: 300',
            stderr: ''
          };
        }
        if (subCmd === 'shell wm size') {
          return { exitCode: 0, stdout: 'Physical size: 1080x2340', stderr: '' };
        }
        if (subCmd === 'shell wm density') {
          return { exitCode: 0, stdout: 'Physical density: 425', stderr: '' };
        }
        if (subCmd === 'shell df -h /data') {
          return {
            exitCode: 0,
            stdout: 'Filesystem Size Used Avail Use% Mounted on\n/dev/block/dm-0 256G 80G 176G 31% /data',
            stderr: ''
          };
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      });

      const details = await DeviceManager.getDeviceDetails('R5CT30TEST');

      expect(details.serial).toBe('R5CT30TEST');
      expect(details.manufacturer).toBe('Samsung');
      expect(details.model).toBe('Galaxy S23');
      expect(details.androidVersion).toBe('14');
      expect(details.apiLevel).toBe(34);
      expect(details.battery?.level).toBe(90);
      expect(details.battery?.isCharging).toBe(true);
      expect(details.display?.size).toBe('1080x2340');
      expect(details.display?.density).toBe(425);
      expect(details.storage?.total).toBe('256G');
      expect(details.storage?.available).toBe('176G');
    });
  });

  describe('parseInstallError', () => {
    it('decodes known ADB install errors into helpful guidance', () => {
      const err1 = DeviceManager.parseInstallError('Failure [INSTALL_FAILED_ALREADY_EXISTS: Attempt to re-install]');
      expect(err1.code).toBe('INSTALL_FAILED_ALREADY_EXISTS');
      expect(err1.friendlyMessage).toContain('already installed');

      const err2 = DeviceManager.parseInstallError('Failure [INSTALL_FAILED_INSUFFICIENT_STORAGE]');
      expect(err2.code).toBe('INSTALL_FAILED_INSUFFICIENT_STORAGE');
      expect(err2.friendlyMessage).toContain('storage is full');

      const err3 = DeviceManager.parseInstallError('Failure [INSTALL_FAILED_VERSION_DOWNGRADE]');
      expect(err3.code).toBe('INSTALL_FAILED_VERSION_DOWNGRADE');
      expect(err3.friendlyMessage).toContain('Allow Downgrade');

      const err4 = DeviceManager.parseInstallError('Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE: signatures do not match]');
      expect(err4.code).toBe('INSTALL_FAILED_UPDATE_INCOMPATIBLE');
      expect(err4.friendlyMessage).toContain('Signature mismatch');

      const err5 = DeviceManager.parseInstallError('Failure [INSTALL_FAILED_TEST_ONLY]');
      expect(err5.code).toBe('INSTALL_FAILED_TEST_ONLY');
      expect(err5.friendlyMessage).toContain('Allow Test-Only');
    });

    it('falls back gracefully on unknown installation failure codes', () => {
      const fallback = DeviceManager.parseInstallError('Failure [INSTALL_FAILED_USER_RESTRICTED]');
      expect(fallback.code).toBe('INSTALL_FAILED_USER_RESTRICTED');
      expect(fallback.friendlyMessage).toBe('Installation failed: INSTALL_FAILED_USER_RESTRICTED');
    });
  });

  describe('installApk', () => {
    const tempDir = path.join(os.tmpdir(), 'adt-test-apk-dir');
    const fakeApk = path.join(tempDir, 'testapp.apk');

    beforeEach(() => {
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      fs.writeFileSync(fakeApk, 'fake-apk-binary-content');
    });

    it('returns error immediately when APK does not exist', async () => {
      const res = await DeviceManager.installApk('device-1', path.join(tempDir, 'non-existent.apk'));
      expect(res.success).toBe(false);
      expect(res.errorCode).toBe('FILE_NOT_FOUND');
      expect(res.message).toContain('APK file not found on disk');
    });

    it('executes adb install with specified flags when file exists', async () => {
      vi.spyOn(DeviceManager, 'resolveAdbPath').mockResolvedValue('adb');
      const execSpy = vi.spyOn(ProcessManager, 'execute').mockResolvedValue({
        exitCode: 0,
        stdout: 'Performing Streamed Install\nSuccess',
        stderr: ''
      });

      const res = await DeviceManager.installApk('device-1', fakeApk, {
        reinstall: true,
        allowDowngrade: true,
        grantPermissions: true,
        allowTestOnly: true
      });

      expect(res.success).toBe(true);
      expect(res.message).toBe('APK installed successfully.');
      expect(execSpy).toHaveBeenCalledWith(
        'adb',
        ['-s', 'device-1', 'install', '-r', '-d', '-g', '-t', fakeApk],
        { timeout: 120000 }
      );
    });

    it('returns parsed error message when adb install fails', async () => {
      vi.spyOn(DeviceManager, 'resolveAdbPath').mockResolvedValue('adb');
      vi.spyOn(ProcessManager, 'execute').mockResolvedValue({
        exitCode: 1,
        stdout: 'Performing Streamed Install\nFailure [INSTALL_FAILED_VERSION_DOWNGRADE]',
        stderr: ''
      });

      const res = await DeviceManager.installApk('device-1', fakeApk);
      expect(res.success).toBe(false);
      expect(res.errorCode).toBe('INSTALL_FAILED_VERSION_DOWNGRADE');
      expect(res.message).toContain('Allow Downgrade');
    });
  });

  describe('reboot', () => {
    it('executes adb reboot with proper target and arguments', async () => {
      vi.spyOn(DeviceManager, 'resolveAdbPath').mockResolvedValue('adb');
      const execSpy = vi.spyOn(ProcessManager, 'execute').mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: ''
      });

      // Normal reboot
      const res1 = await DeviceManager.reboot('device-1', 'system');
      expect(res1.success).toBe(true);
      expect(execSpy).toHaveBeenCalledWith('adb', ['-s', 'device-1', 'reboot'], { timeout: 15000 });

      // Bootloader reboot
      const res2 = await DeviceManager.reboot('device-1', 'bootloader');
      expect(res2.success).toBe(true);
      expect(execSpy).toHaveBeenCalledWith('adb', ['-s', 'device-1', 'reboot', 'bootloader'], { timeout: 15000 });

      // Recovery reboot
      const res3 = await DeviceManager.reboot('device-1', 'recovery');
      expect(res3.success).toBe(true);
      expect(execSpy).toHaveBeenCalledWith('adb', ['-s', 'device-1', 'reboot', 'recovery'], { timeout: 15000 });
    });
  });

  describe('captureScreenshot', () => {
    const screenshotDir = path.join(os.tmpdir(), 'adt-test-screenshots');

    it('captures screenshot on device and pulls to local path', async () => {
      vi.spyOn(DeviceManager, 'resolveAdbPath').mockResolvedValue('adb');
      const execSpy = vi.spyOn(ProcessManager, 'execute').mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: ''
      });

      const savedPath = await DeviceManager.captureScreenshot('device-1', screenshotDir);

      expect(savedPath).toContain(screenshotDir);
      expect(savedPath).toMatch(/screenshot_device-1_.*\.png/);
      expect(execSpy).toHaveBeenCalledWith(
        'adb',
        ['-s', 'device-1', 'shell', 'screencap', '-p', '/sdcard/adt_screen_temp.png'],
        { timeout: 10000 }
      );
      expect(execSpy).toHaveBeenCalledWith(
        'adb',
        ['-s', 'device-1', 'pull', '/sdcard/adt_screen_temp.png', savedPath],
        { timeout: 15000 }
      );
    });
  });

  describe('wireless debugging', () => {
    it('enables tcpip port on target device', async () => {
      vi.spyOn(DeviceManager, 'resolveAdbPath').mockResolvedValue('adb');
      const execSpy = vi.spyOn(ProcessManager, 'execute').mockResolvedValue({
        exitCode: 0,
        stdout: 'restarting in TCP mode port: 5555',
        stderr: ''
      });

      const res = await DeviceManager.enableWireless('device-1', 5555);
      expect(res.success).toBe(true);
      expect(execSpy).toHaveBeenCalledWith('adb', ['-s', 'device-1', 'tcpip', '5555'], { timeout: 10000 });
    });

    it('connects to wireless target successfully', async () => {
      vi.spyOn(DeviceManager, 'resolveAdbPath').mockResolvedValue('adb');
      const execSpy = vi.spyOn(ProcessManager, 'execute').mockResolvedValue({
        exitCode: 0,
        stdout: 'connected to 192.168.1.50:5555',
        stderr: ''
      });

      const res = await DeviceManager.connectWireless('192.168.1.50', 5555);
      expect(res.success).toBe(true);
      expect(res.message).toBe('Successfully connected to 192.168.1.50:5555');
      expect(execSpy).toHaveBeenCalledWith('adb', ['connect', '192.168.1.50:5555'], { timeout: 10000 });
    });

    it('disconnects wireless target', async () => {
      vi.spyOn(DeviceManager, 'resolveAdbPath').mockResolvedValue('adb');
      const execSpy = vi.spyOn(ProcessManager, 'execute').mockResolvedValue({
        exitCode: 0,
        stdout: 'disconnected 192.168.1.50:5555',
        stderr: ''
      });

      const res = await DeviceManager.disconnectWireless('192.168.1.50:5555');
      expect(res.success).toBe(true);
      expect(execSpy).toHaveBeenCalledWith('adb', ['disconnect', '192.168.1.50:5555'], { timeout: 8000 });
    });
  });
});

