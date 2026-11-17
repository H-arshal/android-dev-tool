import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as child_process from 'child_process';
import { EmulatorManager } from '../../src/core/device/emulator-manager';
import { ProcessManager } from '../../src/core/process/process-manager';
import { DeviceManager } from '../../src/core/device/device-manager';

describe('EmulatorManager', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('resolveEmulatorPath', () => {
    it('finds emulator inside explicit sdkRoot', async () => {
      const isWindows = process.platform === 'win32';
      const binary = isWindows ? 'emulator.exe' : 'emulator';
      const fakeSdk = path.join(os.tmpdir(), 'adt-test-sdk-root');
      const emulatorDir = path.join(fakeSdk, 'emulator');
      const expectedPath = path.join(emulatorDir, binary);

      if (!fs.existsSync(emulatorDir)) {
        fs.mkdirSync(emulatorDir, { recursive: true });
      }
      fs.writeFileSync(expectedPath, 'binary');

      const resolved = await EmulatorManager.resolveEmulatorPath(fakeSdk);
      expect(resolved).toBe(expectedPath);
    });

    it('falls back to binary name if not found in custom path', async () => {
      const isWindows = process.platform === 'win32';
      const binary = isWindows ? 'emulator.exe' : 'emulator';
      const nonExistent = path.join(os.tmpdir(), 'non-existent-sdk');

      const resolved = await EmulatorManager.resolveEmulatorPath(nonExistent);
      expect(resolved).toContain(binary);
    });
  });

  describe('parseAvdConfig', () => {
    it('parses config.ini correctly to extract hardware details', () => {
      const tempAvdDir = path.join(os.tmpdir(), 'adt-test-avds');
      const avdName = 'Pixel_7_API_34';
      const avdFolder = path.join(tempAvdDir, `${avdName}.avd`);
      const iniFile = path.join(tempAvdDir, `${avdName}.ini`);

      if (!fs.existsSync(avdFolder)) {
        fs.mkdirSync(avdFolder, { recursive: true });
      }

      fs.writeFileSync(iniFile, `path=${avdFolder}\ntarget=android-34\n`);
      fs.writeFileSync(
        path.join(avdFolder, 'config.ini'),
        `hw.device.displayName=Pixel 7
hw.device.name=pixel_7
image.sysdir.1=system-images/android-34/google_apis/x86_64/
tag.display=Google APIs
abi.type=x86_64
disk.dataPartition.size=6G
PlayStore.enabled=true
`
      );

      const parsed = EmulatorManager.parseAvdConfig(avdName, tempAvdDir);
      expect(parsed.displayName).toBe('Pixel 7');
      expect(parsed.deviceProfile).toBe('pixel_7');
      expect(parsed.apiLevel).toBe(34);
      expect(parsed.target).toBe('Android API 34 (Google APIs)');
      expect(parsed.abi).toBe('x86_64');
      expect(parsed.diskSize).toBe('6G');
      expect(parsed.hasPlayStore).toBe(true);
    });
  });

  describe('listAvds', () => {
    it('lists AVDs and marks running status matching ADB emu serial', async () => {
      vi.spyOn(EmulatorManager, 'resolveEmulatorPath').mockResolvedValue('emulator');
      vi.spyOn(DeviceManager, 'resolveAdbPath').mockResolvedValue('adb');

      // Mock emulator -list-avds
      vi.spyOn(ProcessManager, 'execute').mockImplementation(async (_cmd, args) => {
        if (args.includes('-list-avds')) {
          return { exitCode: 0, stdout: 'Pixel_7_API_34\nMedium_Phone_API_33', stderr: '' };
        }
        if (args.includes('emu') && args.includes('name')) {
          return { exitCode: 0, stdout: 'Pixel_7_API_34\r\nOK', stderr: '' };
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      });

      // Mock connected devices
      vi.spyOn(DeviceManager, 'listDevices').mockResolvedValue([
        {
          serial: 'emulator-5554',
          state: 'device',
          connectionType: 'emulator'
        }
      ]);

      const avds = await EmulatorManager.listAvds(null);
      expect(avds).toHaveLength(2);

      const runningAvd = avds.find(a => a.name === 'Pixel_7_API_34');
      expect(runningAvd).toBeDefined();
      expect(runningAvd?.isRunning).toBe(true);
      expect(runningAvd?.runningSerial).toBe('emulator-5554');

      const stoppedAvd = avds.find(a => a.name === 'Medium_Phone_API_33');
      expect(stoppedAvd).toBeDefined();
      expect(stoppedAvd?.isRunning).toBe(false);
      expect(stoppedAvd?.runningSerial).toBeUndefined();
    });
  });

  describe('launchAvd', () => {
    beforeEach(() => {
      vi.spyOn(EmulatorManager, 'listAvds').mockResolvedValue([]);
    });

    it('spawns emulator child process detached with correct flags and GPU mode', async () => {
      vi.spyOn(EmulatorManager, 'resolveEmulatorPath').mockResolvedValue('emulator');
      const unrefMock = vi.fn();
      const spawnSpy = vi.spyOn(EmulatorManager, 'spawnProcess').mockReturnValue({
        unref: unrefMock
      } as unknown as child_process.ChildProcess);

      const result = await EmulatorManager.launchAvd('Pixel_7_API_34', {
        coldBoot: true,
        noWindow: true,
        wipeData: true,
        gpuMode: 'swiftshader'
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('is launching');
      if (process.platform === 'win32') {
        expect(spawnSpy).toHaveBeenCalledWith(
          'emulator',
          ['-avd', 'Pixel_7_API_34', '-no-snapshot-load', '-no-window', '-wipe-data', '-gpu', 'swiftshader', '-feature', '-Vulkan', '-no-boot-anim', '-no-audio']
        );
      } else {
        expect(spawnSpy).toHaveBeenCalledWith(
          'emulator',
          ['-avd', 'Pixel_7_API_34', '-no-snapshot-load', '-no-window', '-wipe-data', '-gpu', 'swiftshader']
        );
      }
      expect(unrefMock).toHaveBeenCalled();
    });

    it('defaults to swiftshader on Windows to prevent graphics driver crashes', async () => {
      vi.spyOn(EmulatorManager, 'resolveEmulatorPath').mockResolvedValue('emulator');
      const unrefMock = vi.fn();
      const spawnSpy = vi.spyOn(EmulatorManager, 'spawnProcess').mockReturnValue({
        unref: unrefMock
      } as unknown as child_process.ChildProcess);

      const result = await EmulatorManager.launchAvd('Pixel_7_API_34');
      expect(result.success).toBe(true);

      if (process.platform === 'win32') {
        expect(spawnSpy).toHaveBeenCalledWith(
          'emulator',
          ['-avd', 'Pixel_7_API_34', '-gpu', 'swiftshader', '-feature', '-Vulkan', '-no-boot-anim', '-no-audio']
        );
      }
    });
  });

  describe('optimizeAvdConfig', () => {
    it('updates config.ini to enable hw.gpu with swiftshader', () => {
      const tempAvdDir = path.join(os.tmpdir(), 'adt-test-optimize-avd');
      const avdFolder = path.join(tempAvdDir, 'Test_AVD.avd');
      if (!fs.existsSync(avdFolder)) {
        fs.mkdirSync(avdFolder, { recursive: true });
      }

      const configIniPath = path.join(avdFolder, 'config.ini');
      fs.writeFileSync(configIniPath, 'hw.gpu.enabled=no\nhw.gpu.mode=auto\n');

      const optimized = EmulatorManager.optimizeAvdConfig('Test_AVD', tempAvdDir);
      expect(optimized).toBe(true);

      const updated = fs.readFileSync(configIniPath, 'utf-8');
      expect(updated).toContain('hw.gpu.enabled = yes');
      expect(updated).toContain('hw.gpu.mode = swiftshader');
    });

    it('preserves hw.ramSize when valid snapshot exists', () => {
      const tempAvdDir = path.join(os.tmpdir(), 'adt-test-optimize-snapshot');
      const avdFolder = path.join(tempAvdDir, 'Nexus_5.avd');
      const snapFolder = path.join(avdFolder, 'snapshots', 'default_boot');
      fs.mkdirSync(snapFolder, { recursive: true });
      fs.writeFileSync(path.join(snapFolder, 'snapshot.pb'), 'dummy snapshot data');

      const configIniPath = path.join(avdFolder, 'config.ini');
      fs.writeFileSync(configIniPath, 'hw.ramSize = 2560M\nvm.heapSize = 384M\n');

      const optimized = EmulatorManager.optimizeAvdConfig('Nexus_5', tempAvdDir);
      expect(optimized).toBe(true);

      const updated = fs.readFileSync(configIniPath, 'utf-8');
      expect(updated).toContain('hw.ramSize = 2560M');
      expect(updated).toContain('vm.heapSize = 384M');
    });

    it('boosts hw.ramSize when under 2048M and no snapshot exists', () => {
      const tempAvdDir = path.join(os.tmpdir(), 'adt-test-optimize-nosnapshot');
      const avdFolder = path.join(tempAvdDir, 'Low_Ram.avd');
      fs.mkdirSync(avdFolder, { recursive: true });

      const configIniPath = path.join(avdFolder, 'config.ini');
      fs.writeFileSync(configIniPath, 'hw.ramSize = 1024M\nvm.heapSize = 128M\n');

      const optimized = EmulatorManager.optimizeAvdConfig('Low_Ram', tempAvdDir);
      expect(optimized).toBe(true);

      const updated = fs.readFileSync(configIniPath, 'utf-8');
      expect(updated).toContain('hw.ramSize = 2560M');
      expect(updated).toContain('vm.heapSize = 384M');
    });
  });

  describe('stopAvd', () => {
    it('kills running emulator via ADB emu kill', async () => {
      vi.spyOn(DeviceManager, 'resolveAdbPath').mockResolvedValue('adb');
      const execSpy = vi.spyOn(ProcessManager, 'execute').mockResolvedValue({
        exitCode: 0,
        stdout: 'OK',
        stderr: ''
      });

      const res = await EmulatorManager.stopAvd('Pixel_7_API_34', 'emulator-5554');
      expect(res.success).toBe(true);
      expect(res.message).toContain('stopped');
      expect(execSpy).toHaveBeenCalledWith('adb', ['-s', 'emulator-5554', 'emu', 'kill'], { timeout: 8000 });
    });

    it('falls back to process kill when TCP port 5554 is refused and purges lock', async () => {
      vi.spyOn(DeviceManager, 'resolveAdbPath').mockResolvedValue('adb');
      vi.spyOn(ProcessManager, 'execute').mockImplementation(async (_cmd, args) => {
        if (args.includes('emu') && args.includes('kill')) {
          return {
            exitCode: 1,
            stdout: '',
            stderr: 'error: could not connect to TCP port 5554: cannot connect to 127.0.0.1:5554: No connection could be made because the target machine actively refused it. (10061)'
          };
        }
        if (args.includes('shell') && args.includes('reboot')) {
          return { exitCode: 1, stdout: '', stderr: 'error: closed' };
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      });

      const tempAvdDir = path.join(os.tmpdir(), 'adt-test-stop-avd');
      const avdFolder = path.join(tempAvdDir, 'Pixel_7_API_34.avd');
      const lockFolder = path.join(avdFolder, 'hardware-qemu.ini.lock');
      fs.mkdirSync(lockFolder, { recursive: true });
      fs.writeFileSync(path.join(lockFolder, 'pid'), '99999999');

      vi.spyOn(EmulatorManager, 'getAvdDirectory').mockReturnValue(tempAvdDir);
      const killSpy = vi.spyOn(EmulatorManager, 'killProcess').mockResolvedValue(true);
      vi.spyOn(EmulatorManager, 'isProcessAlive').mockReturnValue(false);

      const res = await EmulatorManager.stopAvd('Pixel_7_API_34', 'emulator-5554');
      expect(res.success).toBe(true);
      expect(res.message).toContain('stopped');
      expect(killSpy).toHaveBeenCalledWith(99999999);
      expect(fs.existsSync(lockFolder)).toBe(false);
    });

    it('returns success and clears stale lock when emulator is already stopped', async () => {
      vi.spyOn(DeviceManager, 'resolveAdbPath').mockResolvedValue('adb');
      vi.spyOn(ProcessManager, 'execute').mockRejectedValue(new Error('Device offline'));

      const tempAvdDir = path.join(os.tmpdir(), 'adt-test-stale-avd');
      const avdFolder = path.join(tempAvdDir, 'Test_AVD.avd');
      const lockFolder = path.join(avdFolder, 'hardware-qemu.ini.lock');
      fs.mkdirSync(lockFolder, { recursive: true });

      vi.spyOn(EmulatorManager, 'getAvdDirectory').mockReturnValue(tempAvdDir);
      vi.spyOn(EmulatorManager, 'isProcessAlive').mockReturnValue(false);

      const res = await EmulatorManager.stopAvd('Test_AVD');
      expect(res.success).toBe(true);
      expect(res.message).toContain('stopped');
      expect(fs.existsSync(lockFolder)).toBe(false);
    });
  });

  describe('isProcessAlive and killProcess', () => {
    it('detects current node process as alive', () => {
      expect(EmulatorManager.isProcessAlive(process.pid)).toBe(true);
      expect(EmulatorManager.isProcessAlive(0)).toBe(false);
      expect(EmulatorManager.isProcessAlive(-1)).toBe(false);
    });

    it('kills process using taskkill on Windows or SIGKILL fallback', async () => {
      const execSpy = vi.spyOn(ProcessManager, 'execute').mockResolvedValue({
        exitCode: 0,
        stdout: 'SUCCESS',
        stderr: ''
      });
      vi.spyOn(EmulatorManager, 'isProcessAlive')
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

      const killed = await EmulatorManager.killProcess(12345);
      expect(killed).toBe(true);
      if (process.platform === 'win32') {
        expect(execSpy).toHaveBeenCalledWith('taskkill', ['/F', '/T', '/PID', '12345'], { timeout: 5000 });
      }
    });
  });

  describe('deleteAvd', () => {
    it('deletes AVD using avdmanager', async () => {
      vi.spyOn(EmulatorManager, 'resolveAvdManagerPath').mockResolvedValue('avdmanager');
      const execSpy = vi.spyOn(ProcessManager, 'execute').mockResolvedValue({
        exitCode: 0,
        stdout: 'AVD Pixel_7 deleted',
        stderr: ''
      });

      const res = await EmulatorManager.deleteAvd('Pixel_7');
      expect(res.success).toBe(true);
      expect(res.message).toContain('successfully deleted');
      expect(execSpy).toHaveBeenCalledWith('avdmanager', ['delete', 'avd', '-n', 'Pixel_7'], { timeout: 15000 });
    });
  });

  describe('createAvd', () => {
    it('invokes avdmanager create avd with force and device profile', async () => {
      vi.spyOn(EmulatorManager, 'resolveAvdManagerPath').mockResolvedValue('avdmanager');
      const execSpy = vi.spyOn(ProcessManager, 'execute').mockResolvedValue({
        exitCode: 0,
        stdout: 'Auto-selecting single ABI x86_64\nAVD Pixel_7 created',
        stderr: ''
      });

      const res = await EmulatorManager.createAvd({
        name: 'Pixel_7_API_34',
        packagePath: 'system-images;android-34;google_apis;x86_64',
        deviceProfile: 'pixel_7',
        force: true
      });

      expect(res.success).toBe(true);
      expect(res.message).toContain('created successfully');
      expect(execSpy).toHaveBeenCalledWith(
        'avdmanager',
        ['create', 'avd', '-n', 'Pixel_7_API_34', '-k', 'system-images;android-34;google_apis;x86_64', '--device', 'pixel_7', '--force'],
        { timeout: 30000, stdin: 'no\n' }
      );
    });
  });

  describe('listInstalledSystemImages', () => {
    it('discovers installed system images in system-images directory structure', async () => {
      const tempSdk = path.join(os.tmpdir(), 'adt-test-sysimg-sdk');
      const imgPath = path.join(tempSdk, 'system-images', 'android-34', 'google_apis', 'x86_64');

      if (!fs.existsSync(imgPath)) {
        fs.mkdirSync(imgPath, { recursive: true });
      }

      const images = await EmulatorManager.listInstalledSystemImages(tempSdk);
      expect(images).toHaveLength(1);
      expect(images[0]).toEqual({
        id: 'system-images;android-34;google_apis;x86_64',
        apiLevel: 34,
        tag: 'google_apis',
        abi: 'x86_64',
        description: 'Android 34 (google apis) - x86_64'
      });
    });
  });
});
