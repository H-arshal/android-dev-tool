import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as child_process from 'child_process';
import { AvdInfo, LaunchAvdOptions, CreateAvdPayload, SystemImageInfo } from '../../shared/types';
import { ProcessManager } from '../process/process-manager';
import { DeviceManager } from './device-manager';
import { CmdlineToolsAdapter } from '../sdk/package-manager-adapter';

export class EmulatorManager {
  /**
   * Resolves the absolute path to emulator executable (emulator.exe on Windows).
   */
  public static async resolveEmulatorPath(sdkRoot?: string | null): Promise<string> {
    const isWindows = process.platform === 'win32';
    const binaryName = isWindows ? 'emulator.exe' : 'emulator';

    const rootsToCheck = [
      sdkRoot,
      sdkRoot ? path.join(sdkRoot, 'sdk') : null,
      CmdlineToolsAdapter.resolveSdkRoot(sdkRoot),
      process.env.ANDROID_HOME,
      process.env.ANDROID_SDK_ROOT
    ];

    for (const r of rootsToCheck) {
      if (!r) continue;
      const candidate = path.join(r, 'emulator', binaryName);
      if (fs.existsSync(candidate)) return candidate;
    }

    // System PATH lookup
    const pathDirs = (process.env.PATH || '').split(path.delimiter);
    for (const dir of pathDirs) {
      const trimmed = dir.trim();
      if (!trimmed) continue;
      const candidate = path.join(trimmed, binaryName);
      if (fs.existsSync(candidate)) return candidate;
    }

    return binaryName;
  }

  /**
   * Resolves the absolute path to avdmanager (avdmanager.bat on Windows).
   */
  public static async resolveAvdManagerPath(sdkRoot?: string | null): Promise<string> {
    const isWindows = process.platform === 'win32';
    const binaryName = isWindows ? 'avdmanager.bat' : 'avdmanager';

    const rootsToCheck = [
      sdkRoot,
      sdkRoot ? path.join(sdkRoot, 'sdk') : null,
      CmdlineToolsAdapter.resolveSdkRoot(sdkRoot),
      process.env.ANDROID_HOME,
      process.env.ANDROID_SDK_ROOT
    ];

    for (const r of rootsToCheck) {
      if (!r) continue;
      // Check cmdline-tools/latest/bin
      const latest = path.join(r, 'cmdline-tools', 'latest', 'bin', binaryName);
      if (fs.existsSync(latest)) return latest;

      // Check cmdline-tools/*/bin
      const cmdlineRoot = path.join(r, 'cmdline-tools');
      if (fs.existsSync(cmdlineRoot)) {
        try {
          const versions = fs.readdirSync(cmdlineRoot);
          for (const ver of versions) {
            const verCandidate = path.join(cmdlineRoot, ver, 'bin', binaryName);
            if (fs.existsSync(verCandidate)) return verCandidate;
          }
        } catch {
          // ignore
        }
      }
    }

    // System PATH lookup
    const pathDirs = (process.env.PATH || '').split(path.delimiter);
    for (const dir of pathDirs) {
      const trimmed = dir.trim();
      if (!trimmed) continue;
      const candidate = path.join(trimmed, binaryName);
      if (fs.existsSync(candidate)) return candidate;
    }

    return binaryName;
  }

  /**
   * Returns the directory where Android Virtual Devices (AVDs) are stored on disk.
   */
  public static getAvdDirectory(): string {
    const androidAvdHome = process.env.ANDROID_AVD_HOME;
    if (androidAvdHome && fs.existsSync(androidAvdHome)) {
      return androidAvdHome;
    }

    const userHome = os.homedir();
    return path.join(userHome, '.android', 'avd');
  }

  /**
   * Lists all configured AVDs with rich hardware and configuration details.
   */
  public static async listAvds(sdkRoot?: string | null): Promise<AvdInfo[]> {
    const avds: AvdInfo[] = [];
    const avdDir = this.getAvdDirectory();

    // 1. Try listing AVD names via emulator -list-avds
    let avdNames: string[] = [];
    try {
      const emulatorPath = await this.resolveEmulatorPath(sdkRoot);
      const res = await ProcessManager.execute(emulatorPath, ['-list-avds'], { timeout: 8000 });
      if (res.exitCode === 0 && res.stdout.trim()) {
        avdNames = res.stdout
          .split(/\r?\n/)
          .map(l => l.trim())
          .filter(l => l.length > 0);
      }
    } catch {
      // CLI listing failed, fallback to scanning ~/.android/avd
    }

    // Fallback or union with directory scan
    if (fs.existsSync(avdDir)) {
      try {
        const files = fs.readdirSync(avdDir);
        for (const file of files) {
          if (file.endsWith('.ini')) {
            const avdName = path.basename(file, '.ini');
            if (!avdNames.includes(avdName)) {
              avdNames.push(avdName);
            }
          }
        }
      } catch {
        // ignore
      }
    }

    // 2. Discover running emulators via ADB and live OS process checks
    interface RunningStatus {
      serial?: string;
      status: 'booting' | 'running';
    }
    const runningEmulatorsMap = new Map<string, RunningStatus>();

    try {
      const adbPath = await DeviceManager.resolveAdbPath(sdkRoot);
      const connectedDevices = await DeviceManager.listDevices(sdkRoot);
      const emulatorDevices = connectedDevices.filter(d => d.connectionType === 'emulator');

      for (const emu of emulatorDevices) {
        let matchedName: string | null = null;
        try {
          const nameRes = await ProcessManager.execute(adbPath, ['-s', emu.serial, 'emu', 'avd', 'name'], { timeout: 3000 });
          if (nameRes.exitCode === 0) {
            const lines = nameRes.stdout.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0 && l !== 'OK');
            if (lines.length > 0) {
              matchedName = lines[0];
            }
          }
        } catch {
          // ignore
        }

        if (!matchedName && emu.state === 'device') {
          try {
            const propRes = await ProcessManager.execute(adbPath, ['-s', emu.serial, 'shell', 'getprop', 'ro.boot.qemu.avd_name'], { timeout: 2000 });
            if (propRes.exitCode === 0 && propRes.stdout.trim()) {
              matchedName = propRes.stdout.trim();
            }
          } catch {
            // ignore
          }
        }

        // If single AVD and single emulator connected, associate them directly
        if (!matchedName && avdNames.length === 1) {
          matchedName = avdNames[0];
        }

        if (matchedName) {
          runningEmulatorsMap.set(matchedName, {
            serial: emu.serial,
            status: emu.state === 'device' ? 'running' : 'booting'
          });
        }
      }
    } catch {
      // ADB device query failed
    }

    // Check live OS process for each AVD via hardware-qemu.ini.lock/pid
    for (const name of avdNames) {
      if (runningEmulatorsMap.has(name)) continue;

      try {
        const avdFolder = path.join(avdDir, `${name}.avd`);
        const pidPath = path.join(avdFolder, 'hardware-qemu.ini.lock', 'pid');
        if (fs.existsSync(pidPath)) {
          const pidStr = fs.readFileSync(pidPath, 'utf-8').trim();
          const pid = parseInt(pidStr, 10);
          if (!isNaN(pid) && pid > 0) {
            if (this.isProcessAlive(pid)) {
              runningEmulatorsMap.set(name, {
                status: 'booting'
              });
            } else {
              // Stale lock left behind, cleanly purge
              try {
                fs.rmSync(path.join(avdFolder, 'hardware-qemu.ini.lock'), { recursive: true, force: true });
              } catch {
                // ignore
              }
            }
          }
        }
      } catch {
        // ignore
      }
    }

    // 3. Parse config details for each AVD
    for (const name of avdNames) {
      const avdConfig = this.parseAvdConfig(name, avdDir);
      const runningInfo = runningEmulatorsMap.get(name);
      const isRunning = !!runningInfo;
      const status: 'stopped' | 'booting' | 'running' = runningInfo ? runningInfo.status : 'stopped';

      avds.push({
        name,
        displayName: avdConfig.displayName || name.replace(/_/g, ' '),
        target: avdConfig.target,
        apiLevel: avdConfig.apiLevel,
        abi: avdConfig.abi,
        deviceProfile: avdConfig.deviceProfile,
        path: avdConfig.path,
        diskSize: avdConfig.diskSize,
        hasPlayStore: avdConfig.hasPlayStore,
        isRunning,
        runningSerial: runningInfo?.serial,
        status
      });
    }

    return avds;
  }

  /**
   * Reads and parses `<avdName>.ini` and `<avdName>.avd/config.ini`.
   */
  public static parseAvdConfig(name: string, avdBaseDir: string): {
    displayName?: string;
    target?: string;
    apiLevel?: number;
    abi?: string;
    deviceProfile?: string;
    path?: string;
    diskSize?: string;
    hasPlayStore?: boolean;
  } {
    const iniFilePath = path.join(avdBaseDir, `${name}.ini`);
    let avdFolderPath = path.join(avdBaseDir, `${name}.avd`);

    if (fs.existsSync(iniFilePath)) {
      try {
        const iniContent = fs.readFileSync(iniFilePath, 'utf-8');
        const lines = iniContent.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('path=')) {
            avdFolderPath = trimmed.substring(5).trim();
          } else if (trimmed.startsWith('path.rel=')) {
            const rel = trimmed.substring(9).trim();
            avdFolderPath = path.join(avdBaseDir, '..', rel);
          }
        }
      } catch {
        // ignore
      }
    }

    const configIniPath = path.join(avdFolderPath, 'config.ini');
    if (!fs.existsSync(configIniPath)) {
      return { path: avdFolderPath };
    }

    try {
      const content = fs.readFileSync(configIniPath, 'utf-8');
      const lines = content.split(/\r?\n/);
      const props: Record<string, string> = {};

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.substring(0, eqIdx).trim();
          const val = trimmed.substring(eqIdx + 1).trim();
          props[key] = val;
        }
      }

      const displayName = props['hw.device.displayName'] || props['AvdId'] || name;
      const deviceProfile = props['hw.device.name'] || props['hw.device.displayName'];
      const abi = props['abi.type'];
      const diskSize = props['disk.dataPartition.size'];
      const hasPlayStore = props['PlayStore.enabled'] === 'true';

      // Parse API level from image.sysdir.1 e.g. "system-images/android-34/google_apis/x86_64/"
      let apiLevel: number | undefined;
      let target: string | undefined;

      const sysdir = props['image.sysdir.1'] || '';
      const apiMatch = sysdir.match(/android-(\d+)/i);
      if (apiMatch) {
        apiLevel = parseInt(apiMatch[1], 10);
        const tagDisplay = props['tag.display'] || (props['tag.id'] ? props['tag.id'].replace(/_/g, ' ') : '');
        target = `Android API ${apiLevel}${tagDisplay ? ` (${tagDisplay})` : ''}`;
      } else if (props['target']) {
        target = props['target'];
        const targetMatch = target.match(/android-(\d+)/i);
        if (targetMatch) {
          apiLevel = parseInt(targetMatch[1], 10);
        }
      }

      return {
        displayName,
        target,
        apiLevel,
        abi,
        deviceProfile,
        path: avdFolderPath,
        diskSize,
        hasPlayStore
      };
    } catch {
      return { path: avdFolderPath };
    }
  }

  /**
   * Patches an AVD's config.ini to ensure GPU acceleration uses SwiftShader on Windows,
   * preventing libgfxstream_backend.dll crashes.
   *
   * IMPORTANT: When a valid snapshot exists (snapshots/default_boot/snapshot.pb is present),
   * this method only touches safe cosmetic fields (GPU mode, device frame). Hardware fields
   * like hw.ramSize, vm.heapSize, hw.keyboard, and hw.cpu.ncore are left untouched because
   * the emulator compares config.ini against the snapshot's hardware.ini on boot; any mismatch
   * causes the snapshot to be rejected, forcing a resource-heavy cold boot that crashes on
   * integrated GPUs with software rendering.
   */
  public static optimizeAvdConfig(name: string, avdBaseDir?: string): boolean {
    const baseDir = avdBaseDir || this.getAvdDirectory();
    let configIniPath = path.join(baseDir, `${name}.avd`, 'config.ini');

    const iniPath = path.join(baseDir, `${name}.ini`);
    if (fs.existsSync(iniPath)) {
      try {
        const iniContent = fs.readFileSync(iniPath, 'utf-8');
        for (const line of iniContent.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (trimmed.startsWith('path=')) {
            const customPath = trimmed.substring(5).trim();
            const cand = path.join(customPath, 'config.ini');
            if (fs.existsSync(cand)) {
              configIniPath = cand;
              break;
            }
          }
        }
      } catch {
        // ignore
      }
    }

    if (!fs.existsSync(configIniPath)) {
      return false;
    }

    try {
      let content = fs.readFileSync(configIniPath, 'utf-8');

      // Check if a valid snapshot already exists in the AVD directory
      const avdFolder = path.dirname(configIniPath);
      const snapshotPbPath = path.join(avdFolder, 'snapshots', 'default_boot', 'snapshot.pb');
      const hasValidSnapshot = fs.existsSync(snapshotPbPath);

      // --- Safe fields: GPU mode and device frame never break snapshot compatibility ---

      const gpuEnabledRegex = /^hw\.gpu\.enabled\s*=.*$/m;
      const gpuModeRegex = /^hw\.gpu\.mode\s*=.*$/m;

      if (gpuEnabledRegex.test(content)) {
        content = content.replace(gpuEnabledRegex, 'hw.gpu.enabled = yes');
      } else {
        content += '\nhw.gpu.enabled = yes\n';
      }

      if (gpuModeRegex.test(content)) {
        content = content.replace(gpuModeRegex, 'hw.gpu.mode = swiftshader');
      } else {
        content += '\nhw.gpu.mode = swiftshader\n';
      }

      const frameRegex = /^showDeviceFrame\s*=.*$/m;
      if (frameRegex.test(content)) {
        content = content.replace(frameRegex, 'showDeviceFrame = no');
      } else {
        content += '\nshowDeviceFrame = no\n';
      }

      // --- Hardware fields: ONLY modify when there is NO existing snapshot ---
      // Changing these when a snapshot exists causes a hardware mismatch, the emulator
      // rejects the snapshot and falls back to cold boot, which crashes on software rendering.

      if (!hasValidSnapshot) {
        // Boost RAM if missing or too low (< 2048M)
        const ramRegex = /^hw\.ramSize\s*=\s*(.*)$/m;
        const ramMatch = content.match(ramRegex);
        if (ramMatch) {
          const currentRam = parseInt(ramMatch[1], 10);
          if (isNaN(currentRam) || currentRam < 2048) {
            content = content.replace(ramRegex, 'hw.ramSize = 2560M');
          }
        } else {
          content += '\nhw.ramSize = 2560M\n';
        }

        // Boost VM heap if missing or too low (< 384M)
        const heapRegex = /^vm\.heapSize\s*=\s*(.*)$/m;
        const heapMatch = content.match(heapRegex);
        if (heapMatch) {
          const currentHeap = parseInt(heapMatch[1], 10);
          if (isNaN(currentHeap) || currentHeap < 384) {
            content = content.replace(heapRegex, 'vm.heapSize = 384M');
          }
        } else {
          content += '\nvm.heapSize = 384M\n';
        }

        // Set data partition size if not configured
        const diskRegex = /^disk\.dataPartition\.size\s*=.*$/m;
        if (!diskRegex.test(content)) {
          content += '\ndisk.dataPartition.size = 6G\n';
        }

        // Enable host keyboard input
        const keyboardRegex = /^hw\.keyboard\s*=.*$/m;
        if (keyboardRegex.test(content)) {
          content = content.replace(keyboardRegex, 'hw.keyboard = yes');
        } else {
          content += '\nhw.keyboard = yes\n';
        }

        // Allocate 4 virtual CPU cores
        const cpuRegex = /^hw\.cpu\.ncore\s*=.*$/m;
        if (cpuRegex.test(content)) {
          content = content.replace(cpuRegex, 'hw.cpu.ncore = 4');
        } else {
          content += '\nhw.cpu.ncore = 4\n';
        }
      }

      fs.writeFileSync(configIniPath, content, 'utf-8');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ensures ~/.android/advancedFeatures.ini has Vulkan disabled and direct memory enabled
   * on Windows to prevent libgfxstream crashes and system freezes.
   */
  public static ensureAdvancedFeatures(): void {
    try {
      const userHome = os.homedir();
      const dotAndroid = path.join(userHome, '.android');
      if (!fs.existsSync(dotAndroid)) {
        fs.mkdirSync(dotAndroid, { recursive: true });
      }
      const advPath = path.join(dotAndroid, 'advancedFeatures.ini');
      let content = '';
      if (fs.existsSync(advPath)) {
        content = fs.readFileSync(advPath, 'utf-8');
      }
      let modified = false;
      if (!content.includes('Vulkan = off')) {
        content += '\nVulkan = off\n';
        modified = true;
      }
      if (!content.includes('GLDirectMem = on')) {
        content += '\nGLDirectMem = on\n';
        modified = true;
      }
      if (modified) {
        fs.writeFileSync(advPath, content.trim() + '\n', 'utf-8');
      }
    } catch {
      // ignore
    }
  }

  /**
   * Spawns a detached process (can be overridden or mocked in tests).
   */
  public static spawnProcess(command: string, args: string[]): child_process.ChildProcess {
    return child_process.spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: false
    });
  }

  /**
   * Spawns an emulator instance detached from the extension host.
   */
  public static async launchAvd(
    name: string,
    options: LaunchAvdOptions = {},
    sdkRoot?: string | null
  ): Promise<{ success: boolean; message: string }> {
    const emulatorPath = await this.resolveEmulatorPath(sdkRoot);

    // Prevent launching duplicate instance if already running
    try {
      const activeAvds = await this.listAvds(sdkRoot);
      const existing = activeAvds.find(a => a.name === name);
      if (existing && existing.isRunning) {
        return {
          success: true,
          message: `Virtual device "${name}" is already running (${existing.runningSerial || 'active'}).`
        };
      }
    } catch {
      // ignore
    }

    const args = ['-avd', name];
    if (options.coldBoot) args.push('-no-snapshot-load');
    if (options.noWindow) args.push('-no-window');
    if (options.wipeData) args.push('-wipe-data');

    // Windows GPU and sound stability:
    // 1. Force SwiftShader and disable Vulkan to prevent libgfxstream / libvulkan_lvp driver crashes
    // 2. Add -no-audio to prevent virtio-snd driver inconsistency crashes during snapshot restore
    const isWindows = process.platform === 'win32';
    const gpu = options.gpuMode || (isWindows ? 'swiftshader' : undefined);
    if (isWindows) {
      args.push('-gpu', 'swiftshader');
      args.push('-feature', '-Vulkan');
      args.push('-no-boot-anim');
      args.push('-no-audio');
    } else if (gpu && gpu !== 'auto') {
      args.push('-gpu', gpu);
    }

    // Ensure Windows advancedFeatures.ini has Vulkan disabled for graphics stability
    this.ensureAdvancedFeatures();

    // Clean up stale lock files, corrupted snapshot dirty flags, and setup window coordinates before launching
    try {
      const baseDir = this.getAvdDirectory();
      const avdFolder = path.join(baseDir, `${name}.avd`);
      if (fs.existsSync(avdFolder)) {
        const lockEntries = fs.readdirSync(avdFolder).filter(f => f.endsWith('.lock'));
        for (const entry of lockEntries) {
          try {
            const lockPath = path.join(avdFolder, entry);
            if (fs.existsSync(lockPath)) {
              fs.rmSync(lockPath, { recursive: true, force: true });
            }
          } catch {
            // lock held by running process, ignore
          }
        }

        // Clean ram.img.dirty flag if left behind so emulator can load snapshot without corruption or freezing
        const dirtySnapshotPath = path.join(avdFolder, 'snapshots', 'default_boot', 'ram.img.dirty');
        if (fs.existsSync(dirtySnapshotPath)) {
          try {
            fs.rmSync(dirtySnapshotPath, { force: true });
          } catch {
            // ignore
          }
        }

        // If snapshot is missing snapshot.pb, purge incomplete directory so it cold boots cleanly
        const snapshotDir = path.join(avdFolder, 'snapshots', 'default_boot');
        const snapshotPb = path.join(snapshotDir, 'snapshot.pb');
        if (fs.existsSync(snapshotDir) && !fs.existsSync(snapshotPb)) {
          try {
            fs.rmSync(snapshotDir, { recursive: true, force: true });
          } catch {
            // ignore
          }
        }

        // Ensure emulator-user.ini has valid positive coordinates to prevent UpdateLayeredWindowIndirect errors
        try {
          const userIniPath = path.join(avdFolder, 'emulator-user.ini');
          let userIni = '';
          if (fs.existsSync(userIniPath)) {
            userIni = fs.readFileSync(userIniPath, 'utf-8');
          }
          let modified = false;
          if (/window\.scale\s*=\s*-\d+(\.\d+)?/.test(userIni)) {
            userIni = userIni.replace(/window\.scale\s*=\s*-\d+(\.\d+)?/g, 'window.scale = 0.500000');
            modified = true;
          }
          if (/window\.y\s*=\s*-\d+/.test(userIni)) {
            userIni = userIni.replace(/window\.y\s*=\s*-\d+/g, 'window.y = 80');
            modified = true;
          }
          if (!/window\.scale\s*=/.test(userIni)) {
            userIni += '\nwindow.scale = 0.500000\n';
            modified = true;
          }
          if (!/window\.x\s*=/.test(userIni)) {
            userIni += '\nwindow.x = 200\n';
            modified = true;
          }
          if (!/window\.y\s*=/.test(userIni)) {
            userIni += '\nwindow.y = 80\n';
            modified = true;
          }
          if (modified || !fs.existsSync(userIniPath)) {
            fs.writeFileSync(userIniPath, userIni.trim() + '\n', 'utf-8');
          }
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }

    // Try patching the AVD's config.ini if it exists
    try {
      this.optimizeAvdConfig(name);
    } catch {
      // ignore
    }

    try {
      const child = this.spawnProcess(emulatorPath, args);
      child.unref();

      const modeLabel = gpu ? ` (${gpu})` : '';
      return {
        success: true,
        message: `Emulator "${name}" is launching${modeLabel}...`
      };
    } catch (err: unknown) {
      return {
        success: false,
        message: `Failed to launch emulator: ${err instanceof Error ? err.message : String(err)}`
      };
    }
  }

  /**
   * Checks if an OS process with the given PID is currently alive.
   */
  public static isProcessAlive(pid: number): boolean {
    if (!pid || isNaN(pid) || pid <= 0) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      return code === 'EPERM';
    }
  }

  /**
   * Forcefully kills a process (and its child process tree on Windows) by PID.
   */
  public static async killProcess(pid: number): Promise<boolean> {
    if (!this.isProcessAlive(pid)) {
      return true;
    }

    if (process.platform === 'win32') {
      try {
        const res = await ProcessManager.execute('taskkill', ['/F', '/T', '/PID', String(pid)], { timeout: 5000 });
        if (res.exitCode === 0) {
          return true;
        }
      } catch {
        // Fallback to process.kill
      }
    }

    try {
      process.kill(pid, 'SIGKILL');
      return true;
    } catch {
      return !this.isProcessAlive(pid);
    }
  }

  /**
   * Stops a running or booting AVD.
   * Attempts graceful shutdown via ADB emu kill and shell reboot -p first.
   * If ADB control fails (such as TCP port 5554 connection refused), it falls back to
   * terminating the emulator process by PID from lock files and cleanly purging lock folders.
   */
  public static async stopAvd(
    name: string,
    serial?: string,
    sdkRoot?: string | null
  ): Promise<{ success: boolean; message: string }> {
    let adbPath: string | null = null;
    try {
      adbPath = await DeviceManager.resolveAdbPath(sdkRoot);
    } catch {
      // ADB path resolution failed
    }

    let targetSerial = serial;

    // 1. If serial not provided, attempt to locate matching connected emulator
    if (!targetSerial && adbPath) {
      try {
        const connectedDevices = await DeviceManager.listDevices(sdkRoot);
        const emulators = connectedDevices.filter(d => d.connectionType === 'emulator');

        for (const emu of emulators) {
          try {
            const res = await ProcessManager.execute(adbPath, ['-s', emu.serial, 'emu', 'avd', 'name'], { timeout: 4000 });
            if (res.exitCode === 0 && res.stdout.includes(name)) {
              targetSerial = emu.serial;
              break;
            }
          } catch {
            // ignore
          }

          if (!targetSerial && emu.state === 'device') {
            try {
              const propRes = await ProcessManager.execute(adbPath, ['-s', emu.serial, 'shell', 'getprop', 'ro.boot.qemu.avd_name'], { timeout: 2000 });
              if (propRes.exitCode === 0 && propRes.stdout.trim().includes(name)) {
                targetSerial = emu.serial;
                break;
              }
            } catch {
              // ignore
            }
          }
        }

        // If only 1 emulator device is connected, correlate it with this AVD
        if (!targetSerial && emulators.length === 1) {
          targetSerial = emulators[0].serial;
        }
      } catch {
        // ignore
      }
    }

    let gracefulStopped = false;

    // 2. Try graceful shutdown via ADB emu kill and shell reboot -p
    if (targetSerial && adbPath) {
      try {
        const res = await ProcessManager.execute(adbPath, ['-s', targetSerial, 'emu', 'kill'], { timeout: 8000 });
        if (res.exitCode === 0 || res.stdout.toLowerCase().includes('ok')) {
          gracefulStopped = true;
        }
      } catch {
        // Port 5554 connection refused or timed out, will proceed to process kill fallback
      }

      // If emu kill failed (e.g. TCP 5554 refused), try adb shell reboot -p (clean Android powerdown)
      if (!gracefulStopped) {
        try {
          const rebootRes = await ProcessManager.execute(adbPath, ['-s', targetSerial, 'shell', 'reboot', '-p'], { timeout: 4000 });
          if (rebootRes.exitCode === 0) {
            gracefulStopped = true;
          }
        } catch {
          // ignore
        }
      }
    }

    // 3. Fallback and cleanup: inspect lock files and terminate emulator OS process if still alive
    const avdDir = this.getAvdDirectory();
    const avdFolder = path.join(avdDir, `${name}.avd`);

    if (fs.existsSync(avdFolder)) {
      const lockFiles = ['hardware-qemu.ini.lock', 'multiinstance.lock'];
      for (const lockFile of lockFiles) {
        const pidPath = path.join(avdFolder, lockFile, 'pid');
        if (fs.existsSync(pidPath)) {
          try {
            const pidStr = fs.readFileSync(pidPath, 'utf-8').trim();
            const pid = parseInt(pidStr, 10);
            if (!isNaN(pid) && pid > 0) {
              await this.killProcess(pid);
            }
          } catch {
            // ignore
          }
        }
      }

      // Cleanly remove all lock directories and files in avdFolder
      try {
        const entries = fs.readdirSync(avdFolder);
        for (const entry of entries) {
          if (entry.endsWith('.lock')) {
            const lockPath = path.join(avdFolder, entry);
            try {
              fs.rmSync(lockPath, { recursive: true, force: true });
            } catch {
              // ignore
            }
          }
        }
      } catch {
        // ignore
      }

      // Remove any ram.img.dirty left behind by process termination so snapshot remains clean
      const dirtySnapshotPath = path.join(avdFolder, 'snapshots', 'default_boot', 'ram.img.dirty');
      if (fs.existsSync(dirtySnapshotPath)) {
        try {
          fs.rmSync(dirtySnapshotPath, { force: true });
        } catch {
          // ignore
        }
      }
    }

    // 4. Verify whether the emulator is still running
    let isStillRunning = false;
    if (fs.existsSync(avdFolder)) {
      const pidPath = path.join(avdFolder, 'hardware-qemu.ini.lock', 'pid');
      if (fs.existsSync(pidPath)) {
        try {
          const pidStr = fs.readFileSync(pidPath, 'utf-8').trim();
          const pid = parseInt(pidStr, 10);
          if (this.isProcessAlive(pid)) {
            isStillRunning = true;
          }
        } catch {
          // ignore
        }
      }
    }

    if (isStillRunning) {
      return {
        success: false,
        message: `Failed to stop virtual device "${name}". The emulator process is still running.`
      };
    }

    const serialLabel = targetSerial ? ` (${targetSerial})` : '';
    return {
      success: true,
      message: `Virtual device "${name}"${serialLabel} has been stopped.`
    };
  }

  /**
   * Deletes an AVD from the local machine using avdmanager.
   */
  public static async deleteAvd(
    name: string,
    sdkRoot?: string | null
  ): Promise<{ success: boolean; message: string }> {
    const avdManagerPath = await this.resolveAvdManagerPath(sdkRoot);
    const res = await ProcessManager.execute(avdManagerPath, ['delete', 'avd', '-n', name], { timeout: 15000 });

    if (res.exitCode === 0 || !res.stderr.toLowerCase().includes('error')) {
      return {
        success: true,
        message: `Virtual device "${name}" was successfully deleted.`
      };
    }

    return {
      success: false,
      message: `Failed to delete virtual device: ${res.stderr || res.stdout}`
    };
  }

  /**
   * Creates a new AVD using avdmanager.
   */
  public static async createAvd(
    payload: CreateAvdPayload,
    sdkRoot?: string | null
  ): Promise<{ success: boolean; message: string }> {
    const avdManagerPath = await this.resolveAvdManagerPath(sdkRoot);

    const args = ['create', 'avd', '-n', payload.name, '-k', payload.packagePath];
    if (payload.deviceProfile) {
      args.push('--device', payload.deviceProfile);
    }
    if (payload.force !== false) {
      args.push('--force');
    }

    // Auto-respond 'no' to custom hardware profile prompt
    const res = await ProcessManager.execute(avdManagerPath, args, {
      timeout: 30000,
      stdin: 'no\n'
    });

    if (res.exitCode === 0) {
      // Optimize newly created AVD config for Windows Direct3D stability
      try {
        this.optimizeAvdConfig(payload.name);
      } catch {
        // ignore
      }

      return {
        success: true,
        message: `Virtual device "${payload.name}" created successfully.`
      };
    }

    return {
      success: false,
      message: `Failed to create virtual device: ${res.stderr || res.stdout}`
    };
  }

  /**
   * Scans the SDK directory for installed system images available for AVD creation.
   */
  public static async listInstalledSystemImages(sdkRoot?: string | null): Promise<SystemImageInfo[]> {
    const images: SystemImageInfo[] = [];

    const rootsToCheck = [
      sdkRoot,
      sdkRoot ? path.join(sdkRoot, 'sdk') : null,
      CmdlineToolsAdapter.resolveSdkRoot(sdkRoot),
      process.env.ANDROID_HOME,
      process.env.ANDROID_SDK_ROOT
    ];

    let foundDir: string | null = null;
    for (const r of rootsToCheck) {
      if (!r) continue;
      const candidate = path.join(r, 'system-images');
      if (fs.existsSync(candidate)) {
        foundDir = candidate;
        break;
      }
    }

    if (!foundDir) return images;
    const sysImgDir = foundDir;

    try {
      const apiDirs = fs.readdirSync(sysImgDir);
      for (const apiDir of apiDirs) {
        // e.g. "android-34"
        const apiMatch = apiDir.match(/android-(\d+)/i);
        if (!apiMatch) continue;
        const apiLevel = parseInt(apiMatch[1], 10);

        const apiPath = path.join(sysImgDir, apiDir);
        if (!fs.statSync(apiPath).isDirectory()) continue;

        const tagDirs = fs.readdirSync(apiPath);
        for (const tagDir of tagDirs) {
          // e.g. "google_apis", "default", "google_apis_playstore"
          const tagPath = path.join(apiPath, tagDir);
          if (!fs.statSync(tagPath).isDirectory()) continue;

          const abiDirs = fs.readdirSync(tagPath);
          for (const abiDir of abiDirs) {
            // e.g. "x86_64", "arm64-v8a"
            const abiPath = path.join(tagPath, abiDir);
            if (!fs.statSync(abiPath).isDirectory()) continue;

            const packageId = `system-images;${apiDir};${tagDir};${abiDir}`;
            const tagLabel = tagDir.replace(/_/g, ' ');

            images.push({
              id: packageId,
              apiLevel,
              tag: tagDir,
              abi: abiDir,
              description: `Android ${apiLevel} (${tagLabel}) - ${abiDir}`
            });
          }
        }
      }
    } catch {
      // scan error
    }

    return images;
  }
}
