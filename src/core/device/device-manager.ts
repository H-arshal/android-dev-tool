import * as path from 'path';
import * as fs from 'fs';
import { ProcessManager } from '../process/process-manager';
import { WindowsEnvironment } from '../environment/windows-environment';
import {
  DeviceInfo,
  DeviceDetails,
  DeviceState,
  DeviceConnectionType,
  BatteryInfo,
  DisplayInfo,
  StorageInfo,
  InstallApkOptions,
  InstallApkResult
} from '../../shared/types';

export class DeviceManager {
  /**
   * Resolves the best candidate path for the adb binary.
   */
  public static async resolveAdbPath(sdkRoot?: string | null): Promise<string> {
    const isWindows = process.platform === 'win32';
    const binaryName = isWindows ? 'adb.exe' : 'adb';

    if (sdkRoot) {
      const candidate = path.join(sdkRoot, 'platform-tools', binaryName);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
      const nestedCandidate = path.join(sdkRoot, 'sdk', 'platform-tools', binaryName);
      if (fs.existsSync(nestedCandidate)) {
        return nestedCandidate;
      }
    }

    const envAndroidHome = process.env['ANDROID_HOME'] ||
      (await WindowsEnvironment.getUserEnvironmentVariable('ANDROID_HOME'));

    if (envAndroidHome) {
      const candidate = path.join(envAndroidHome, 'platform-tools', binaryName);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    // System PATH lookup
    const pathDirs = (process.env.PATH || '').split(path.delimiter);
    for (const dir of pathDirs) {
      const candidate = path.join(dir.trim(), binaryName);
      if (fs.existsSync(candidate)) return candidate;
    }

    return binaryName;
  }

  /**
   * Retrieves all connected physical Android devices and running emulators.
   */
  public static async listDevices(sdkRoot?: string | null): Promise<DeviceInfo[]> {
    const adbPath = await this.resolveAdbPath(sdkRoot);
    let result = await ProcessManager.execute(adbPath, ['devices', '-l'], { timeout: 8000 });

    // Self-healing: if adb daemon was not running or failed during first launch, start server and retry
    if (result.exitCode !== 0) {
      const combinedOutput = `${result.stderr} ${result.stdout}`;
      if (
        combinedOutput.includes('cannot connect to daemon') ||
        combinedOutput.includes('failed to start daemon') ||
        combinedOutput.includes('could not read ok') ||
        combinedOutput.includes('starting now at tcp:5037')
      ) {
        try {
          await ProcessManager.execute(adbPath, ['start-server'], { timeout: 8000 });
          result = await ProcessManager.execute(adbPath, ['devices', '-l'], { timeout: 8000 });
        } catch {
          // ignore retry failure
        }
      }
    }

    if (result.exitCode !== 0) {
      console.warn('[DeviceManager] adb devices -l failed:', result.stderr || result.stdout);
      return [];
    }

    return this.parseAdbDevicesOutput(result.stdout);
  }

  /**
   * Parses the raw stdout from `adb devices -l`.
   */
  public static parseAdbDevicesOutput(output: string): DeviceInfo[] {
    const devices: DeviceInfo[] = [];
    const lines = output.split(/\r?\n/);

    for (const rawLine of lines) {
      const line = rawLine.trim();

      // Skip headers, empty lines, and adb server daemon messages
      if (
        !line ||
        line.startsWith('List of devices attached') ||
        line.startsWith('* daemon')
      ) {
        continue;
      }

      // Format: <serial> <state> [key:value ...]
      // Example: "emulator-5554 device product:sdk_gphone64_x86_64 model:sdk_gphone64_x86_64 device:emulator64_x86_64 transport_id:1"
      const tokens = line.split(/\s+/);
      if (tokens.length < 2) continue;

      const serial = tokens[0];
      const stateToken = tokens[1].toLowerCase();

      let state: DeviceState = 'unknown';
      if (stateToken === 'device') state = 'device';
      else if (stateToken === 'unauthorized') state = 'unauthorized';
      else if (stateToken === 'offline') state = 'offline';
      else if (stateToken === 'bootloader') state = 'bootloader';
      else if (stateToken === 'recovery') state = 'recovery';
      else if (stateToken === 'sideload') state = 'sideload';

      // Determine connection type
      let connectionType: DeviceConnectionType = 'usb';
      if (serial.startsWith('emulator-')) {
        connectionType = 'emulator';
      } else if (serial.includes(':') || /^\d+\.\d+\.\d+\.\d+/.test(serial)) {
        connectionType = 'wifi';
      }

      let model: string | undefined;
      let product: string | undefined;
      let device: string | undefined;
      let transportId: string | undefined;

      for (let i = 2; i < tokens.length; i++) {
        const token = tokens[i];
        const [key, val] = token.split(':');
        if (!key || !val) continue;

        if (key === 'model') model = val.replace(/_/g, ' ');
        else if (key === 'product') product = val;
        else if (key === 'device') device = val;
        else if (key === 'transport_id') transportId = val;
      }

      devices.push({
        serial,
        state,
        connectionType,
        model,
        product,
        device,
        transportId
      });
    }

    return devices;
  }

  /**
   * Retrieves comprehensive hardware, battery, and display information for an authorized device.
   */
  public static async getDeviceDetails(
    serial: string,
    sdkRoot?: string | null
  ): Promise<DeviceDetails> {
    const adbPath = await this.resolveAdbPath(sdkRoot);

    // Initial base details
    const baseInfo: DeviceInfo = {
      serial,
      state: 'device',
      connectionType: serial.startsWith('emulator-') ? 'emulator' : (serial.includes(':') ? 'wifi' : 'usb')
    };

    // If device is not authorized or offline, shell commands will fail or hang
    const details: DeviceDetails = { ...baseInfo };

    try {
      // 1. Query System Properties via getprop
      const propsRes = await ProcessManager.execute(
        adbPath,
        ['-s', serial, 'shell', 'getprop'],
        { timeout: 5000 }
      );

      if (propsRes.exitCode === 0) {
        const props = this.parseGetpropOutput(propsRes.stdout);
        details.manufacturer = props['ro.product.manufacturer'];
        details.model = props['ro.product.model'] || details.model;
        details.marketName = props['ro.product.marketname'] || props['ro.product.display'];
        details.androidVersion = props['ro.build.version.release'];
        details.apiLevel = props['ro.build.version.sdk']
          ? parseInt(props['ro.build.version.sdk'], 10)
          : undefined;
        details.buildNumber = props['ro.build.id'] || props['ro.build.display.id'];
        details.abi = props['ro.product.cpu.abi'];
      }

      // 2. Query Battery Status
      const batteryRes = await ProcessManager.execute(
        adbPath,
        ['-s', serial, 'shell', 'dumpsys', 'battery'],
        { timeout: 4000 }
      );
      if (batteryRes.exitCode === 0) {
        details.battery = this.parseBatteryOutput(batteryRes.stdout);
      }

      // 3. Query Screen Size & Density
      const [wmSizeRes, wmDensityRes] = await Promise.all([
        ProcessManager.execute(adbPath, ['-s', serial, 'shell', 'wm', 'size'], { timeout: 3000 }),
        ProcessManager.execute(adbPath, ['-s', serial, 'shell', 'wm', 'density'], { timeout: 3000 })
      ]);

      const displaySize = wmSizeRes.exitCode === 0 ? this.parseDisplaySize(wmSizeRes.stdout) : undefined;
      const displayDensity = wmDensityRes.exitCode === 0 ? this.parseDisplayDensity(wmDensityRes.stdout) : undefined;

      if (displaySize) {
        details.display = {
          size: displaySize,
          density: displayDensity
        };
      }

      // 4. Query Storage Metrics
      const dfRes = await ProcessManager.execute(
        adbPath,
        ['-s', serial, 'shell', 'df', '-h', '/data'],
        { timeout: 3000 }
      );
      if (dfRes.exitCode === 0) {
        details.storage = this.parseStorageOutput(dfRes.stdout);
      }

      // 5. Query Wi-Fi IP address if connected
      const ipRes = await ProcessManager.execute(
        adbPath,
        ['-s', serial, 'shell', 'ip', '-f', 'inet', 'addr', 'show', 'wlan0'],
        { timeout: 3000 }
      );
      if (ipRes.exitCode === 0) {
        const ipMatch = ipRes.stdout.match(/inet\s+([\d.]+)/);
        if (ipMatch && ipMatch[1]) {
          details.ipAddress = ipMatch[1];
        }
      }
    } catch (err) {
      console.warn(`[DeviceManager] Failed to fetch full details for ${serial}:`, err);
    }

    return details;
  }

  /**
   * Parses `getprop` output into a key-value record.
   * Format: [key]: [value]
   */
  public static parseGetpropOutput(output: string): Record<string, string> {
    const props: Record<string, string> = {};
    const regex = /\[([^\]]+)\]:\s*\[([^\]]*)\]/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(output)) !== null) {
      props[match[1]] = match[2];
    }

    return props;
  }

  /**
   * Parses `dumpsys battery` output into a BatteryInfo structure.
   */
  public static parseBatteryOutput(output: string): BatteryInfo {
    let level = 0;
    let scale = 100;
    let isCharging = false;
    let health: string | undefined;
    let temperature: number | undefined;

    const levelMatch = output.match(/level:\s*(\d+)/i);
    if (levelMatch) level = parseInt(levelMatch[1], 10);

    const scaleMatch = output.match(/scale:\s*(\d+)/i);
    if (scaleMatch) scale = parseInt(scaleMatch[1], 10);

    // AC, USB, or Wireless powered indicates active charging
    const acMatch = output.match(/AC powered:\s*true/i);
    const usbMatch = output.match(/USB powered:\s*true/i);
    const wirelessMatch = output.match(/Wireless powered:\s*true/i);
    const statusMatch = output.match(/status:\s*(\d+)/i);

    // Android BatteryManager: 2 = BATTERY_STATUS_CHARGING, 5 = BATTERY_STATUS_FULL
    const statusVal = statusMatch ? parseInt(statusMatch[1], 10) : 0;
    isCharging = !!(acMatch || usbMatch || wirelessMatch || statusVal === 2 || statusVal === 5);

    // Temperature is typically reported in tenths of a degree Celsius (e.g. 310 -> 31.0 C)
    const tempMatch = output.match(/temperature:\s*(\d+)/i);
    if (tempMatch) {
      temperature = parseFloat((parseInt(tempMatch[1], 10) / 10).toFixed(1));
    }

    // Health: 2 = GOOD, 3 = OVERHEAT, 4 = DEAD, 5 = OVER_VOLTAGE
    const healthMatch = output.match(/health:\s*(\d+)/i);
    if (healthMatch) {
      const hVal = parseInt(healthMatch[1], 10);
      switch (hVal) {
        case 2: health = 'Good'; break;
        case 3: health = 'Overheat'; break;
        case 4: health = 'Dead'; break;
        case 5: health = 'Over Voltage'; break;
        default: health = 'Normal'; break;
      }
    }

    // Calculate percentage normalized by scale
    const percentage = scale > 0 ? Math.round((level / scale) * 100) : level;

    return {
      level: percentage,
      scale,
      isCharging,
      health,
      temperature
    };
  }

  /**
   * Parses `wm size` output (e.g. "Physical size: 1080x2400").
   */
  public static parseDisplaySize(output: string): string | undefined {
    // Check for override size first, then physical size
    const overrideMatch = output.match(/Override size:\s*(\d+x\d+)/i);
    if (overrideMatch) return overrideMatch[1];

    const physicalMatch = output.match(/Physical size:\s*(\d+x\d+)/i);
    if (physicalMatch) return physicalMatch[1];

    const fallbackMatch = output.match(/(\d+x\d+)/);
    return fallbackMatch ? fallbackMatch[1] : undefined;
  }

  /**
   * Parses `wm density` output (e.g. "Physical density: 440").
   */
  public static parseDisplayDensity(output: string): number | undefined {
    const overrideMatch = output.match(/Override density:\s*(\d+)/i);
    if (overrideMatch) return parseInt(overrideMatch[1], 10);

    const physicalMatch = output.match(/Physical density:\s*(\d+)/i);
    if (physicalMatch) return parseInt(physicalMatch[1], 10);

    const fallbackMatch = output.match(/density:\s*(\d+)/i);
    return fallbackMatch ? parseInt(fallbackMatch[1], 10) : undefined;
  }

  /**
   * Parses `df -h /data` output for storage stats.
   */
  public static parseStorageOutput(output: string): StorageInfo | undefined {
    const lines = output.trim().split(/\r?\n/);
    if (lines.length < 2) return undefined;

    // Line 1 is header (Filesystem Size Used Avail Use% Mounted on)
    // Line 2 is data
    const dataLine = lines[lines.length - 1].trim();
    const parts = dataLine.split(/\s+/);

    if (parts.length >= 5) {
      const total = parts[1];
      const used = parts[2];
      const available = parts[3];
      const usePercentStr = parts[4].replace('%', '');
      const percentage = parseInt(usePercentStr, 10) || 0;

      return {
        total,
        used,
        available,
        percentage
      };
    }

    return undefined;
  }

  /**
   * Installs an APK package onto the designated device.
   */
  public static async installApk(
    serial: string,
    apkPath: string,
    options: InstallApkOptions = {},
    sdkRoot?: string | null
  ): Promise<InstallApkResult> {
    if (!fs.existsSync(apkPath)) {
      return {
        success: false,
        message: `APK file not found on disk: ${apkPath}`,
        errorCode: 'FILE_NOT_FOUND'
      };
    }

    const adbPath = await this.resolveAdbPath(sdkRoot);
    const args = ['-s', serial, 'install'];

    if (options.reinstall !== false) args.push('-r');
    if (options.allowDowngrade) args.push('-d');
    if (options.grantPermissions) args.push('-g');
    if (options.allowTestOnly) args.push('-t');

    args.push(apkPath);

    const result = await ProcessManager.execute(adbPath, args, { timeout: 120000 });
    const combinedOutput = `${result.stdout}\n${result.stderr}`.trim();

    if (result.exitCode === 0 && combinedOutput.toLowerCase().includes('success')) {
      return {
        success: true,
        message: 'APK installed successfully.',
        rawOutput: combinedOutput
      };
    }

    const parsedError = this.parseInstallError(combinedOutput);
    return {
      success: false,
      message: parsedError.friendlyMessage,
      errorCode: parsedError.code,
      rawOutput: combinedOutput
    };
  }

  /**
   * Translates raw ADB installation failure codes into actionable, user-friendly messages.
   */
  public static parseInstallError(output: string): { code: string; friendlyMessage: string } {
    const match = output.match(/Failure\s*\[([^\]]+)\]/i);
    let code = match ? match[1].trim() : 'INSTALL_FAILED';
    if (code.includes(':')) {
      code = code.split(':')[0].trim();
    }

    switch (code) {
      case 'INSTALL_FAILED_ALREADY_EXISTS':
        return { code, friendlyMessage: 'The app is already installed. Use reinstall (-r) or uninstall the previous version.' };
      case 'INSTALL_FAILED_INSUFFICIENT_STORAGE':
        return { code, friendlyMessage: 'Device storage is full. Free up space on the device and try again.' };
      case 'INSTALL_FAILED_VERSION_DOWNGRADE':
        return { code, friendlyMessage: 'An equal or newer version is already installed. Enable "Allow Downgrade" or uninstall first.' };
      case 'INSTALL_FAILED_UPDATE_INCOMPATIBLE':
        return { code, friendlyMessage: 'Signature mismatch. The existing version was signed with a different key. Uninstall first.' };
      case 'INSTALL_FAILED_OLDER_SDK':
        return { code, friendlyMessage: 'The APK requires a newer Android version than this device supports.' };
      case 'INSTALL_FAILED_TEST_ONLY':
        return { code, friendlyMessage: 'The APK was built as a test package. Enable "Allow Test-Only" (-t).' };
      case 'INSTALL_PARSE_FAILED_NOT_APK':
        return { code, friendlyMessage: 'The selected file is not a valid Android APK archive.' };
      default:
        return { code, friendlyMessage: `Installation failed: ${code}` };
    }
  }

  /**
   * Reboots the designated device into normal, bootloader, or recovery mode.
   */
  public static async reboot(
    serial: string,
    mode: 'system' | 'bootloader' | 'recovery' = 'system',
    sdkRoot?: string | null
  ): Promise<{ success: boolean; message: string }> {
    const adbPath = await this.resolveAdbPath(sdkRoot);
    const args = ['-s', serial, 'reboot'];
    if (mode === 'bootloader') args.push('bootloader');
    else if (mode === 'recovery') args.push('recovery');

    const result = await ProcessManager.execute(adbPath, args, { timeout: 15000 });
    if (result.exitCode === 0) {
      return { success: true, message: `Device rebooting to ${mode}...` };
    }
    return { success: false, message: `Reboot failed: ${result.stderr || result.stdout}` };
  }

  /**
   * Captures a high-resolution screenshot from the device and saves it to local disk.
   */
  public static async captureScreenshot(
    serial: string,
    destinationDir: string,
    sdkRoot?: string | null
  ): Promise<string> {
    if (!fs.existsSync(destinationDir)) {
      fs.mkdirSync(destinationDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeSerial = serial.replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `screenshot_${safeSerial}_${timestamp}.png`;
    const localFilePath = path.join(destinationDir, fileName);
    const remotePath = '/sdcard/adt_screen_temp.png';

    const adbPath = await this.resolveAdbPath(sdkRoot);

    // 1. Take screenshot on device
    const captureRes = await ProcessManager.execute(
      adbPath,
      ['-s', serial, 'shell', 'screencap', '-p', remotePath],
      { timeout: 10000 }
    );
    if (captureRes.exitCode !== 0) {
      throw new Error(`Failed to capture screenshot on device: ${captureRes.stderr || captureRes.stdout}`);
    }

    try {
      // 2. Pull screenshot to local machine
      const pullRes = await ProcessManager.execute(
        adbPath,
        ['-s', serial, 'pull', remotePath, localFilePath],
        { timeout: 15000 }
      );
      if (pullRes.exitCode !== 0) {
        throw new Error(`Failed to pull screenshot file: ${pullRes.stderr || pullRes.stdout}`);
      }
    } finally {
      // 3. Clean up remote temp file
      ProcessManager.execute(adbPath, ['-s', serial, 'shell', 'rm', '-f', remotePath], { timeout: 5000 }).catch(() => {});
    }

    return localFilePath;
  }

  /**
   * Enables wireless TCP/IP debugging on a connected device.
   */
  public static async enableWireless(
    serial: string,
    port = 5555,
    sdkRoot?: string | null
  ): Promise<{ success: boolean; message: string }> {
    const adbPath = await this.resolveAdbPath(sdkRoot);
    const result = await ProcessManager.execute(adbPath, ['-s', serial, 'tcpip', String(port)], { timeout: 10000 });

    if (result.exitCode === 0) {
      return { success: true, message: `Wireless debugging enabled on port ${port}. You may now disconnect USB.` };
    }
    return { success: false, message: `Failed to enable wireless mode: ${result.stderr || result.stdout}` };
  }

  /**
   * Connects to a device over Wi-Fi TCP/IP.
   */
  public static async connectWireless(
    ip: string,
    port = 5555,
    sdkRoot?: string | null
  ): Promise<{ success: boolean; message: string }> {
    const adbPath = await this.resolveAdbPath(sdkRoot);
    const target = `${ip.trim()}:${port}`;
    const result = await ProcessManager.execute(adbPath, ['connect', target], { timeout: 10000 });

    const output = `${result.stdout}\n${result.stderr}`.trim();
    if (result.exitCode === 0 && output.toLowerCase().includes('connected to')) {
      return { success: true, message: `Successfully connected to ${target}` };
    }
    return { success: false, message: output || `Failed to connect to ${target}` };
  }

  /**
   * Disconnects a wireless device.
   */
  public static async disconnectWireless(
    address: string,
    sdkRoot?: string | null
  ): Promise<{ success: boolean; message: string }> {
    const adbPath = await this.resolveAdbPath(sdkRoot);
    const result = await ProcessManager.execute(adbPath, ['disconnect', address.trim()], { timeout: 8000 });

    return {
      success: result.exitCode === 0,
      message: result.stdout || result.stderr || `Disconnected ${address}`
    };
  }
}

