import * as fs from 'fs';
import * as path from 'path';
import { PackageInfo, InstallProgress, InstallResult } from '../../shared/types';
import { GOOGLE_KNOWN_LICENSES } from '../../shared/constants';
import { ProcessManager } from '../process/process-manager';
import { WindowsEnvironment } from '../environment/windows-environment';

export interface AndroidPackageManager {
  listPackages(): Promise<PackageInfo[]>;
  listInstalledPackages(): Promise<PackageInfo[]>;
  installPackages(
    packages: string[],
    onProgress?: (progress: InstallProgress) => void
  ): Promise<InstallResult>;
  updatePackages(): Promise<InstallResult>;
  acceptLicenses(): Promise<{ success: boolean; message: string }>;
}

export class CmdlineToolsAdapter implements AndroidPackageManager {
  private sdkmanagerPath: string;
  private readonly sdkRoot: string;

  constructor(initialSdkRoot: string) {
    this.sdkRoot = CmdlineToolsAdapter.resolveSdkRoot(initialSdkRoot);
    this.sdkmanagerPath = CmdlineToolsAdapter.resolveSdkManagerPath(this.sdkRoot);
  }

  /**
   * Resolves the canonical Android SDK root directory, handling nested structures or parent paths.
   */
  public static resolveSdkRoot(candidateRoot?: string | null): string {
    if (candidateRoot) {
      // 1. Direct check: Does candidateRoot have Android tools?
      if (
        fs.existsSync(path.join(candidateRoot, 'cmdline-tools')) ||
        fs.existsSync(path.join(candidateRoot, 'platform-tools')) ||
        fs.existsSync(path.join(candidateRoot, 'system-images'))
      ) {
        return candidateRoot;
      }
      // 2. Nested check: Does candidateRoot/sdk have Android tools?
      const nested = path.join(candidateRoot, 'sdk');
      if (
        fs.existsSync(path.join(nested, 'cmdline-tools')) ||
        fs.existsSync(path.join(nested, 'platform-tools')) ||
        fs.existsSync(path.join(nested, 'system-images'))
      ) {
        return nested;
      }
      // 3. If candidateRoot was explicitly passed and is not the default unverified fallback, respect candidateRoot
      if (candidateRoot !== 'C:\\Android_Tools\\sdk' && fs.existsSync(candidateRoot)) {
        return candidateRoot;
      }
    }

    // 4. Check environment variables
    const envCandidates = [
      process.env['ANDROID_HOME'],
      process.env['ANDROID_SDK_ROOT'],
      'C:\\Android_Tools\\sdk',
      'C:\\Android_Tools\\sdk\\sdk'
    ];

    for (const cand of envCandidates) {
      if (!cand) continue;
      if (
        fs.existsSync(path.join(cand, 'cmdline-tools')) ||
        fs.existsSync(path.join(cand, 'platform-tools')) ||
        fs.existsSync(path.join(cand, 'system-images'))
      ) {
        return cand;
      }
    }

    return candidateRoot || 'C:\\Android_Tools\\sdk';
  }

  /**
   * Locates sdkmanager (sdkmanager.bat on Windows) with multi-directory fallback.
   */
  public static resolveSdkManagerPath(baseDir: string): string {
    const isWindows = process.platform === 'win32';
    const binaryName = isWindows ? 'sdkmanager.bat' : 'sdkmanager';

    // 1. Direct cmdline-tools/latest/bin
    const directLatest = path.join(baseDir, 'cmdline-tools', 'latest', 'bin', binaryName);
    if (fs.existsSync(directLatest)) return directLatest;

    // 2. Nested sdk/cmdline-tools/latest/bin
    const nestedLatest = path.join(baseDir, 'sdk', 'cmdline-tools', 'latest', 'bin', binaryName);
    if (fs.existsSync(nestedLatest)) return nestedLatest;

    // 3. Any versioned folder in cmdline-tools/*/bin
    for (const checkDir of [baseDir, path.join(baseDir, 'sdk')]) {
      const cmdlineRoot = path.join(checkDir, 'cmdline-tools');
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

    // 4. PATH lookup
    const pathDirs = (process.env.PATH || '').split(path.delimiter);
    for (const dir of pathDirs) {
      const candidate = path.join(dir.trim(), binaryName);
      if (fs.existsSync(candidate)) return candidate;
    }

    return path.join(baseDir, 'cmdline-tools', 'latest', 'bin', binaryName);
  }

  /**
   * Accepts Google Android SDK licenses by writing certified cryptographic license hashes directly to disk.
   */
  public async acceptLicenses(): Promise<{ success: boolean; message: string }> {
    const licensesDir = path.join(this.sdkRoot, 'licenses');
    if (!fs.existsSync(licensesDir)) {
      fs.mkdirSync(licensesDir, { recursive: true });
    }

    const sdkLicensePath = path.join(licensesDir, GOOGLE_KNOWN_LICENSES.SDK_LICENSE);
    const previewLicensePath = path.join(licensesDir, GOOGLE_KNOWN_LICENSES.PREVIEW_LICENSE);

    const sdkLicenseHashes = [
      '24333f8a63b6825ea9c5514f83c2829b004d1fee',
      'd56f5187479451eabf01fb78af6dfcb131a6481e',
      '84831b9409646a53ee0f22618e2001670d613094'
    ].join('\n') + '\n';

    const previewLicenseHashes = [
      '84831b9409646a53ee0f22618e2001670d613094'
    ].join('\n') + '\n';

    fs.writeFileSync(sdkLicensePath, sdkLicenseHashes, 'utf-8');
    fs.writeFileSync(previewLicensePath, previewLicenseHashes, 'utf-8');

    return {
      success: true,
      message: 'Android SDK licenses accepted successfully.'
    };
  }

  /**
   * Installs specified SDK package identifiers using sdkmanager.bat.
   */
  public async installPackages(
    packages: string[],
    onProgress?: (progress: InstallProgress) => void
  ): Promise<InstallResult> {
    if (!fs.existsSync(this.sdkmanagerPath)) {
      throw new Error(`sdkmanager executable not found at: ${this.sdkmanagerPath}`);
    }

    // Ensure licenses are accepted prior to invocation
    await this.acceptLicenses();

    const args = [
      `--sdk_root=${this.sdkRoot}`,
      ...packages
    ];

    if (onProgress) {
      onProgress({
        phase: 'installing_packages',
        currentTask: `Installing ${packages.join(', ')}`,
        currentPackage: packages[0],
        message: 'Launching official Android SDK Package Manager...'
      });
    }

    // Execute sdkmanager.bat (can take a few minutes depending on download speed)
    const env = await this.getExecutionEnv();
    const result = await ProcessManager.execute(this.sdkmanagerPath, args, {
      timeout: 600000,
      env,
      onStdout: (chunk) => {
        if (onProgress) {
          const lines = chunk.trim().split('\n');
          const lastLine = lines[lines.length - 1]?.trim();
          const percentMatch = chunk.match(/(\d+)%/);
          const percent = percentMatch ? parseInt(percentMatch[1], 10) : undefined;
          onProgress({
            phase: 'installing_packages',
            currentTask: `Installing ${packages.join(', ')}`,
            percentage: percent,
            message: lastLine || 'Downloading and installing Android SDK packages...'
          });
        }
      }
    });

    if (result.exitCode !== 0) {
      throw new Error(`Package installation failed: ${result.stderr || result.stdout}`);
    }

    return {
      success: true,
      sdkRoot: this.sdkRoot,
      installedPackages: packages,
      requiresRestart: true,
      message: 'All requested Android packages installed successfully.'
    };
  }

  /**
   * Updates all currently installed SDK packages.
   */
  public async updatePackages(): Promise<InstallResult> {
    if (!fs.existsSync(this.sdkmanagerPath)) {
      throw new Error(`sdkmanager executable not found at: ${this.sdkmanagerPath}`);
    }

    await this.acceptLicenses();

    const args = [
      `--sdk_root=${this.sdkRoot}`,
      '--update'
    ];

    const env = await this.getExecutionEnv();
    const result = await ProcessManager.execute(this.sdkmanagerPath, args, { timeout: 600000, env });

    if (result.exitCode !== 0) {
      throw new Error(`Package update failed: ${result.stderr || result.stdout}`);
    }

    return {
      success: true,
      sdkRoot: this.sdkRoot,
      installedPackages: [],
      requiresRestart: false,
      message: 'Installed packages updated successfully.'
    };
  }

  /**
   * Lists installed packages from the SDK root.
   */
  public async listInstalledPackages(): Promise<PackageInfo[]> {
    if (!fs.existsSync(this.sdkmanagerPath)) {
      return [];
    }

    const env = await this.getExecutionEnv();
    const args = [`--sdk_root=${this.sdkRoot}`, '--list_installed'];
    const result = await ProcessManager.execute(this.sdkmanagerPath, args, { timeout: 30000, env });

    if (result.exitCode !== 0) {
      return [];
    }

    return this.parsePackagesFromOutput(result.stdout, true);
  }

  /**
   * Lists all available packages from Google's repository.
   */
  public async listPackages(): Promise<PackageInfo[]> {
    if (!fs.existsSync(this.sdkmanagerPath)) {
      return [];
    }

    const env = await this.getExecutionEnv();
    const args = [`--sdk_root=${this.sdkRoot}`, '--list'];
    const result = await ProcessManager.execute(this.sdkmanagerPath, args, { timeout: 60000, env });

    if (result.exitCode !== 0) {
      return [];
    }

    return this.parsePackagesFromOutput(result.stdout, false);
  }

  /**
   * Returns a merged package catalog with accurate installation status
   * derived from both disk layout and sdkmanager installed output.
   */
  public async getPackageCatalog(): Promise<PackageInfo[]> {
    const isWindows = process.platform === 'win32';
    const installedIds = new Set<string>();
    const installedVersions = new Map<string, string>();

    // 1. Check filesystem directly for high-speed offline accuracy
    if (this.sdkRoot && fs.existsSync(this.sdkRoot)) {
      // cmdline-tools
      const cmdlineDir = path.join(this.sdkRoot, 'cmdline-tools');
      if (fs.existsSync(cmdlineDir)) {
        try {
          const entries = fs.readdirSync(cmdlineDir);
          if (entries.length > 0) {
            installedIds.add('cmdline-tools;latest');
          }
        } catch {}
      }

      // platform-tools
      const adbBinary = isWindows ? 'adb.exe' : 'adb';
      if (fs.existsSync(path.join(this.sdkRoot, 'platform-tools', adbBinary))) {
        installedIds.add('platform-tools');
      }

      // emulator
      const emuBinary = isWindows ? 'emulator.exe' : 'emulator';
      if (fs.existsSync(path.join(this.sdkRoot, 'emulator', emuBinary))) {
        installedIds.add('emulator');
      }

      // build-tools
      const btDir = path.join(this.sdkRoot, 'build-tools');
      if (fs.existsSync(btDir)) {
        try {
          const versions = fs.readdirSync(btDir);
          for (const ver of versions) {
            installedIds.add(`build-tools;${ver}`);
            installedVersions.set(`build-tools;${ver}`, ver);
          }
        } catch {}
      }

      // platforms
      const platformsDir = path.join(this.sdkRoot, 'platforms');
      if (fs.existsSync(platformsDir)) {
        try {
          const plats = fs.readdirSync(platformsDir);
          for (const p of plats) {
            installedIds.add(`platforms;${p}`);
          }
        } catch {}
      }

      // system-images
      const sysImgDir = path.join(this.sdkRoot, 'system-images');
      if (fs.existsSync(sysImgDir)) {
        try {
          const apis = fs.readdirSync(sysImgDir);
          for (const api of apis) {
            const apiPath = path.join(sysImgDir, api);
            if (!fs.statSync(apiPath).isDirectory()) continue;
            const tags = fs.readdirSync(apiPath);
            for (const tag of tags) {
              const tagPath = path.join(apiPath, tag);
              if (!fs.statSync(tagPath).isDirectory()) continue;
              const abis = fs.readdirSync(tagPath);
              for (const abi of abis) {
                installedIds.add(`system-images;${api};${tag};${abi}`);
              }
            }
          }
        } catch {}
      }
    }

    // 2. Query sdkmanager --list_installed if available to catch metadata
    try {
      const cliInstalled = await this.listInstalledPackages();
      for (const pkg of cliInstalled) {
        installedIds.add(pkg.id);
        if (pkg.version) installedVersions.set(pkg.id, pkg.version);
      }
    } catch {}

    // Curated catalog covering standard developer requirements
    const baseCatalog: PackageInfo[] = [
      {
        id: 'cmdline-tools;latest',
        description: 'Android SDK Command-line Tools (latest)',
        version: installedVersions.get('cmdline-tools;latest') || '12.0',
        isInstalled: installedIds.has('cmdline-tools;latest'),
        category: 'cmdline-tools'
      },
      {
        id: 'platform-tools',
        description: 'Android SDK Platform-Tools (ADB & Fastboot)',
        version: installedVersions.get('platform-tools') || '35.0.1',
        isInstalled: installedIds.has('platform-tools'),
        category: 'platform-tools'
      },
      {
        id: 'build-tools;34.0.0',
        description: 'Android SDK Build-Tools 34.0.0',
        version: '34.0.0',
        isInstalled: installedIds.has('build-tools;34.0.0'),
        category: 'build-tools'
      },
      {
        id: 'build-tools;35.0.0',
        description: 'Android SDK Build-Tools 35.0.0',
        version: '35.0.0',
        isInstalled: installedIds.has('build-tools;35.0.0'),
        category: 'build-tools'
      },
      {
        id: 'platforms;android-34',
        description: 'Android SDK Platform 34 (UpsideDownCake)',
        version: '3',
        isInstalled: installedIds.has('platforms;android-34'),
        category: 'platforms'
      },
      {
        id: 'platforms;android-35',
        description: 'Android SDK Platform 35 (VanillaIceCream)',
        version: '1',
        isInstalled: installedIds.has('platforms;android-35'),
        category: 'platforms'
      },
      {
        id: 'emulator',
        description: 'Android Emulator',
        version: installedVersions.get('emulator') || '34.2.14',
        isInstalled: installedIds.has('emulator'),
        category: 'emulator'
      },
      {
        id: 'system-images;android-34;google_apis;x86_64',
        description: 'Google APIs Intel x86_64 Atom System Image (API 34)',
        version: '14',
        isInstalled: installedIds.has('system-images;android-34;google_apis;x86_64'),
        category: 'system-images'
      }
    ];

    // Include any additional installed packages that might not be in the curated catalog
    const baseIds = new Set(baseCatalog.map(p => p.id));
    for (const id of installedIds) {
      if (!baseIds.has(id)) {
        let category: PackageInfo['category'] = 'platforms';
        let desc = id;
        if (id.startsWith('build-tools')) {
          category = 'build-tools';
          desc = `Android SDK Build-Tools ${id.split(';')[1] || ''}`;
        } else if (id.startsWith('platforms')) {
          category = 'platforms';
          desc = `Android SDK Platform ${id.split(';')[1] || ''}`;
        } else if (id.startsWith('system-images')) {
          category = 'system-images';
          desc = `System Image (${id.replace(/;/g, ' ')})`;
        } else if (id.startsWith('cmdline-tools')) {
          category = 'cmdline-tools';
        } else if (id.startsWith('platform-tools')) {
          category = 'platform-tools';
        } else if (id.startsWith('emulator')) {
          category = 'emulator';
        }

        baseCatalog.push({
          id,
          description: desc,
          version: installedVersions.get(id) || 'Installed',
          isInstalled: true,
          category
        });
      }
    }

    return baseCatalog;
  }

  private async getExecutionEnv(): Promise<NodeJS.ProcessEnv> {
    const userJava = await WindowsEnvironment.getUserEnvironmentVariable('JAVA_HOME');
    const effectiveJavaHome = process.env['JAVA_HOME'] || userJava;

    const env: NodeJS.ProcessEnv = { ...process.env };
    if (effectiveJavaHome) {
      env['JAVA_HOME'] = effectiveJavaHome;
      const javaBin = path.join(effectiveJavaHome, 'bin');
      env['PATH'] = `${javaBin};${env['PATH'] || ''}`;
    }
    return env;
  }

  private parsePackagesFromOutput(output: string, isInstalledOnly: boolean): PackageInfo[] {
    const packages: PackageInfo[] = [];
    const lines = output.split('\n');

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('Installed packages:') || line.startsWith('Available Packages:') || line.startsWith('---')) {
        continue;
      }

      // Line format: "platforms;android-34 | 3 | Android SDK Platform 34"
      const parts = line.split('|').map(p => p.trim());
      if (parts.length >= 2) {
        const id = parts[0];
        if (id.toLowerCase() === 'path' || id.toLowerCase() === 'package') {
          continue;
        }
        const version = parts[1];
        const description = parts[2] || id;

        let category: PackageInfo['category'] = 'platforms';
        if (id.startsWith('build-tools')) category = 'build-tools';
        else if (id.startsWith('platform-tools')) category = 'platform-tools';
        else if (id.startsWith('cmdline-tools')) category = 'cmdline-tools';
        else if (id.startsWith('emulator')) category = 'emulator';
        else if (id.startsWith('system-images')) category = 'system-images';

        packages.push({
          id,
          description,
          version,
          isInstalled: isInstalledOnly,
          category
        });
      }
    }

    return packages;
  }
}
