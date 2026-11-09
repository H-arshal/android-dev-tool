import * as fs from 'fs';
import * as path from 'path';
import { ProcessManager } from '../process/process-manager';
import { PathManager } from './path-manager';
import { WindowsEnvironment } from './windows-environment';

export interface EnvironmentConfigResult {
  androidHome: string;
  sdkRootReconciled: boolean;
  addedPaths: string[];
  freshProcessVerified: boolean;
}

export class EnvironmentManager {
  /**
   * Configures persistent User ANDROID_HOME and reconciles deprecated ANDROID_SDK_ROOT.
   */
  public static async configureAndroidHome(
    sdkRoot: string,
    reconcileSdkRoot = true
  ): Promise<{ androidHome: string; sdkRootReconciled: boolean }> {
    const formattedRoot = path.normalize(sdkRoot).replace(/[\\/]+$/, '');

    // 1. Set persistent User ANDROID_HOME in HKCU:\Environment
    await this.setUserVariable('ANDROID_HOME', formattedRoot);
    process.env['ANDROID_HOME'] = formattedRoot;

    let sdkRootReconciled = false;

    // 2. Check if legacy ANDROID_SDK_ROOT exists or should be reconciled
    const existingLegacy = await WindowsEnvironment.getUserEnvironmentVariable('ANDROID_SDK_ROOT');
    if (reconcileSdkRoot || existingLegacy !== null) {
      await this.setUserVariable('ANDROID_SDK_ROOT', formattedRoot);
      process.env['ANDROID_SDK_ROOT'] = formattedRoot;
      sdkRootReconciled = true;
    }

    return {
      androidHome: formattedRoot,
      sdkRootReconciled
    };
  }

  /**
   * Surgically appends required Android SDK directories to User PATH.
   */
  public static async configureSdkPaths(
    sdkRoot: string,
    includeEmulator = false
  ): Promise<{ addedEntries: string[]; changed: boolean }> {
    const formattedRoot = path.normalize(sdkRoot).replace(/[\\/]+$/, '');

    const candidates = [
      path.join(formattedRoot, 'platform-tools'),
      path.join(formattedRoot, 'cmdline-tools', 'latest', 'bin')
    ];

    const emulatorDir = path.join(formattedRoot, 'emulator');
    if (includeEmulator || fs.existsSync(emulatorDir)) {
      candidates.push(emulatorDir);
    }

    const currentPath = await PathManager.getUserPath();
    const result = PathManager.appendEntriesIfMissing(currentPath, candidates);

    if (result.changed) {
      await PathManager.setUserPath(result.updatedPath);
      PathManager.syncProcessPath(result.addedEntries);
    }

    return {
      addedEntries: result.addedEntries,
      changed: result.changed
    };
  }

  /**
   * Performs an out-of-process verification check by spawning a fresh shell instance.
   */
  public static async verifyFreshProcess(): Promise<boolean> {
    const result = await ProcessManager.execute('cmd.exe', ['/c', 'adb', 'version'], {
      timeout: 5000
    });
    return result.exitCode === 0;
  }

  /**
   * End-to-end environment configuration coordinator.
   */
  public static async configureFullEnvironment(
    sdkRoot: string,
    options: {
      reconcileSdkRoot?: boolean;
      includeEmulator?: boolean;
    } = {}
  ): Promise<EnvironmentConfigResult> {
    const homeResult = await this.configureAndroidHome(
      sdkRoot,
      options.reconcileSdkRoot ?? true
    );

    const pathResult = await this.configureSdkPaths(
      sdkRoot,
      options.includeEmulator ?? false
    );

    const freshProcessVerified = await this.verifyFreshProcess();

    return {
      androidHome: homeResult.androidHome,
      sdkRootReconciled: homeResult.sdkRootReconciled,
      addedPaths: pathResult.addedEntries,
      freshProcessVerified
    };
  }

  /**
   * Sets a persistent User environment variable in HKCU:\Environment.
   */
  private static async setUserVariable(varName: string, value: string): Promise<void> {
    const escapedValue = value.replace(/'/g, "''");
    const script = `[System.Environment]::SetEnvironmentVariable('${varName}', '${escapedValue}', [System.EnvironmentVariableTarget]::User)`;

    const result = await ProcessManager.executePowerShell(script, 5000);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to set persistent User environment variable ${varName}: ${result.stderr}`);
    }
  }
}

