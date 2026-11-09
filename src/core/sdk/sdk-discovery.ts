import * as fs from 'fs';
import * as path from 'path';
import { ProcessManager } from '../process/process-manager';
import { WindowsEnvironment } from '../environment/windows-environment';
import { SystemHealthReport, ComponentHealth, DiagnosticIssue, HealthStatus } from '../../shared/types';
import { COMMON_WINDOWS_SDK_PATHS } from '../../shared/constants';
import { DiagnosticsEngine } from '../diagnostics/diagnostics';

export class SdkDiscovery {
  /**
   * Performs a comprehensive, non-destructive audit of the Android development environment.
   */
  public static async scanEnvironment(fallbackRoot?: string | null): Promise<SystemHealthReport> {
    // 1. Discover Environment Variables
    const processAndroidHome = process.env['ANDROID_HOME'] || null;
    const userAndroidHome = await WindowsEnvironment.getUserEnvironmentVariable('ANDROID_HOME');
    const effectiveAndroidHome = userAndroidHome || processAndroidHome;

    const processAndroidSdkRoot = process.env['ANDROID_SDK_ROOT'] || null;
    const userAndroidSdkRoot = await WindowsEnvironment.getUserEnvironmentVariable('ANDROID_SDK_ROOT');
    const effectiveAndroidSdkRoot = userAndroidSdkRoot || processAndroidSdkRoot;

    const processJavaHome = process.env['JAVA_HOME'] || null;
    const userJavaHome = await WindowsEnvironment.getUserEnvironmentVariable('JAVA_HOME');
    const effectiveJavaHome = userJavaHome || processJavaHome;

    // 2. Discover SDK Root Directory on Disk
    const discoveredSdkRoot = await this.locateSdkRoot([
      effectiveAndroidHome,
      effectiveAndroidSdkRoot,
      fallbackRoot || null,
      ...COMMON_WINDOWS_SDK_PATHS
    ]);

    // 3. Inspect ADB and PATH
    const userPath = await WindowsEnvironment.getUserPath();
    const userPathEntries = WindowsEnvironment.parsePathEntries(userPath);
    const processPathEntries = WindowsEnvironment.parsePathEntries(process.env['PATH'] || '');
    const combinedPathEntries = [...new Set([...userPathEntries, ...processPathEntries])];

    const adbProbe = await this.probeAdb(discoveredSdkRoot, combinedPathEntries);
    const javaProbe = await this.probeJava(effectiveJavaHome);
    const components = await this.inspectComponents(discoveredSdkRoot);
    const licensesAccepted = await this.checkLicenses(discoveredSdkRoot);

    // 4. Run Standardized Diagnostic Engine Probes
    const issues = await DiagnosticsEngine.runAllChecks({
      sdkRoot: discoveredSdkRoot,
      androidHome: effectiveAndroidHome,
      androidSdkRoot: effectiveAndroidSdkRoot,
      javaHome: effectiveJavaHome
    });

    // 5. Calculate Overall Health Status
    let overallStatus: HealthStatus = 'ready';
    if (issues.some(i => i.severity === 'error') || !discoveredSdkRoot) {
      overallStatus = 'error';
    } else if (issues.some(i => i.severity === 'warning')) {
      overallStatus = 'warning';
    }

    return {
      overallStatus,
      sdkRoot: discoveredSdkRoot,
      isCustomSdk: !!discoveredSdkRoot && discoveredSdkRoot !== fallbackRoot,
      androidHome: effectiveAndroidHome,
      androidSdkRoot: effectiveAndroidSdkRoot,
      adbAvailableInPath: adbProbe.inPath,
      adbVersion: adbProbe.version,
      javaDetected: javaProbe.detected,
      javaVersion: javaProbe.rawVersion,
      javaHome: effectiveJavaHome,
      licensesAccepted,
      components,
      issues,
      lastChecked: new Date().toISOString()
    };
  }

  /**
   * Searches a prioritized list of directory candidates for a valid Android SDK.
   */
  private static async locateSdkRoot(candidates: (string | null)[]): Promise<string | null> {
    for (const rawCandidate of candidates) {
      if (!rawCandidate) continue;
      const candidate = WindowsEnvironment.expandEnvironmentMarkers(rawCandidate);

      if (fs.existsSync(candidate)) {
        // Validate if this folder looks like an Android SDK
        const hasPlatformTools = fs.existsSync(path.join(candidate, 'platform-tools'));
        const hasBuildTools = fs.existsSync(path.join(candidate, 'build-tools'));
        const hasCmdlineTools = fs.existsSync(path.join(candidate, 'cmdline-tools'));
        const hasPlatforms = fs.existsSync(path.join(candidate, 'platforms'));

        if (hasPlatformTools || hasBuildTools || hasCmdlineTools || hasPlatforms) {
          return candidate;
        }
      }
    }
    return null;
  }

  /**
   * Probes ADB binary presence and extracts its version.
   */
  private static async probeAdb(sdkRoot: string | null, pathList: string[]): Promise<{
    inPath: boolean;
    existsOnDisk: boolean;
    binaryPath?: string;
    version?: string;
  }> {
    let binaryPath: string | undefined;
    let existsOnDisk = false;

    if (sdkRoot) {
      const candidate = path.join(sdkRoot, 'platform-tools', 'adb.exe');
      if (fs.existsSync(candidate)) {
        binaryPath = candidate;
        existsOnDisk = true;
      }
    }

    // Check if adb is directly executable via PATH
    const directExec = await ProcessManager.execute('adb.exe', ['version'], { timeout: 3000 });
    const inPath = directExec.exitCode === 0;

    let version: string | undefined;
    const versionOutput = directExec.exitCode === 0 ? directExec.stdout : '';

    if (!version && binaryPath && existsOnDisk) {
      const localExec = await ProcessManager.execute(binaryPath, ['version'], { timeout: 3000 });
      if (localExec.exitCode === 0) {
        version = this.parseAdbVersion(localExec.stdout);
      }
    } else if (versionOutput) {
      version = this.parseAdbVersion(versionOutput);
    }

    return {
      inPath,
      existsOnDisk,
      binaryPath,
      version
    };
  }

  private static parseAdbVersion(output: string): string | undefined {
    // Platform tools release version: e.g. "Version 35.0.1-11580240"
    const releaseMatch = output.match(/^Version\s+([\d.]+)/m);
    if (releaseMatch && releaseMatch[1]) {
      return releaseMatch[1];
    }
    // Protocol version fallback: e.g. "Android Debug Bridge version 1.0.41"
    const protocolMatch = output.match(/Android Debug Bridge version\s+([\d.]+)/i);
    if (protocolMatch && protocolMatch[1]) {
      return protocolMatch[1];
    }
    const genericMatch = output.match(/version\s+([\d.]+)/i);
    return genericMatch ? genericMatch[1] : undefined;
  }

  /**
   * Probes Java runtime presence and version.
   */
  private static async probeJava(javaHome: string | null): Promise<{
    detected: boolean;
    rawVersion?: string;
    majorVersion?: number;
  }> {
    let executable = 'java.exe';

    if (javaHome) {
      const candidate = path.join(javaHome, 'bin', 'java.exe');
      if (fs.existsSync(candidate)) {
        executable = candidate;
      }
    }

    // Note: java -version outputs to stderr
    const result = await ProcessManager.execute(executable, ['-version'], { timeout: 4000 });
    const output = (result.stderr + '\n' + result.stdout).trim();

    if (output.length > 0) {
      // Examples:
      // openjdk version "17.0.8" 2023-07-18
      // java version "1.8.0_351"
      const match = output.match(/(?:java|openjdk)\s+version\s+"([^"]+)"/i);
      if (match && match[1]) {
        const rawVersion = match[1];
        let major = parseInt(rawVersion.split('.')[0], 10);
        // Handle legacy Java 1.8 format
        if (major === 1) {
          const parts = rawVersion.split('.');
          if (parts.length > 1) {
            major = parseInt(parts[1], 10);
          }
        }
        return {
          detected: true,
          rawVersion,
          majorVersion: major
        };
      }
    }

    return { detected: false };
  }

  /**
   * Fast file-based inspection of installed SDK components (< 10ms).
   */
  private static async inspectComponents(sdkRoot: string | null): Promise<ComponentHealth[]> {
    if (!sdkRoot || !fs.existsSync(sdkRoot)) {
      return [
        { id: 'cmdline-tools', name: 'Command-line Tools', isInstalled: false, statusText: 'Not installed' },
        { id: 'platform-tools', name: 'Platform Tools (ADB)', isInstalled: false, statusText: 'Not installed' },
        { id: 'build-tools', name: 'Build Tools', isInstalled: false, statusText: 'Not installed' },
        { id: 'platforms', name: 'Android Platforms', isInstalled: false, statusText: 'Not installed' },
        { id: 'emulator', name: 'Android Emulator', isInstalled: false, statusText: 'Not installed' }
      ];
    }

    // 1. cmdline-tools
    const cmdlineLatest = path.join(sdkRoot, 'cmdline-tools', 'latest');
    const cmdlineInstalled = fs.existsSync(cmdlineLatest);
    const cmdlineVersion = cmdlineInstalled ? await this.readSourceProperty(cmdlineLatest, 'Pkg.Revision') : undefined;

    // 2. platform-tools
    const platformToolsPath = path.join(sdkRoot, 'platform-tools');
    const platformToolsInstalled = fs.existsSync(platformToolsPath);
    const platformToolsVersion = platformToolsInstalled ? await this.readSourceProperty(platformToolsPath, 'Pkg.Revision') : undefined;

    // 3. build-tools
    const buildToolsPath = path.join(sdkRoot, 'build-tools');
    let buildToolsInstalled = false;
    let buildToolsVersion: string | undefined;
    if (fs.existsSync(buildToolsPath)) {
      const versions = fs.readdirSync(buildToolsPath).filter(d => fs.statSync(path.join(buildToolsPath, d)).isDirectory());
      if (versions.length > 0) {
        buildToolsInstalled = true;
        // Sort versions descending
        versions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
        buildToolsVersion = versions[0];
      }
    }

    // 4. platforms
    const platformsPath = path.join(sdkRoot, 'platforms');
    let platformsInstalled = false;
    let platformName: string | undefined;
    if (fs.existsSync(platformsPath)) {
      const platforms = fs.readdirSync(platformsPath).filter(d => fs.statSync(path.join(platformsPath, d)).isDirectory());
      if (platforms.length > 0) {
        platformsInstalled = true;
        platforms.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
        platformName = platforms[0];
      }
    }

    // 5. emulator
    const emulatorPath = path.join(sdkRoot, 'emulator');
    const emulatorInstalled = fs.existsSync(emulatorPath);
    const emulatorVersion = emulatorInstalled ? await this.readSourceProperty(emulatorPath, 'Pkg.Revision') : undefined;

    return [
      {
        id: 'cmdline-tools',
        name: 'Command-line Tools',
        isInstalled: cmdlineInstalled,
        version: cmdlineVersion,
        path: cmdlineInstalled ? cmdlineLatest : undefined,
        statusText: cmdlineInstalled ? (cmdlineVersion ? `Installed (v${cmdlineVersion})` : 'Installed') : 'Missing'
      },
      {
        id: 'platform-tools',
        name: 'Platform Tools (ADB)',
        isInstalled: platformToolsInstalled,
        version: platformToolsVersion,
        path: platformToolsInstalled ? platformToolsPath : undefined,
        statusText: platformToolsInstalled ? (platformToolsVersion ? `Installed (v${platformToolsVersion})` : 'Installed') : 'Missing'
      },
      {
        id: 'build-tools',
        name: 'Build Tools',
        isInstalled: buildToolsInstalled,
        version: buildToolsVersion,
        path: buildToolsInstalled ? path.join(buildToolsPath, buildToolsVersion!) : undefined,
        statusText: buildToolsInstalled ? `Installed (${buildToolsVersion})` : 'Missing'
      },
      {
        id: 'platforms',
        name: 'Android Platforms',
        isInstalled: platformsInstalled,
        version: platformName,
        path: platformsInstalled ? path.join(platformsPath, platformName!) : undefined,
        statusText: platformsInstalled ? `Target API ${platformName}` : 'Missing'
      },
      {
        id: 'emulator',
        name: 'Android Emulator',
        isInstalled: emulatorInstalled,
        version: emulatorVersion,
        path: emulatorInstalled ? emulatorPath : undefined,
        statusText: emulatorInstalled ? `Installed (v${emulatorVersion})` : 'Not installed (Optional)'
      }
    ];
  }

  /**
   * Reads a key from a source.properties file inside an SDK package.
   */
  private static async readSourceProperty(pkgDir: string, key: string): Promise<string | undefined> {
    try {
      const propFile = path.join(pkgDir, 'source.properties');
      if (fs.existsSync(propFile)) {
        const content = fs.readFileSync(propFile, 'utf-8');
        const match = content.match(new RegExp(`^${key}\\s*=\\s*(.+)$`, 'm'));
        return match ? match[1].trim() : undefined;
      }
    } catch {
      // Ignore read errors
    }
    return undefined;
  }

  /**
   * Checks if Android SDK licenses have been accepted.
   */
  private static async checkLicenses(sdkRoot: string | null): Promise<boolean> {
    if (!sdkRoot) return false;
    const licenseFile = path.join(sdkRoot, 'licenses', 'android-sdk-license');
    return fs.existsSync(licenseFile);
  }
}
