import * as fs from 'fs';
import * as path from 'path';
import { JdkInfo, InstallProgress } from '../../shared/types';
import { JdkDetection } from './jdk-detection';
import { JdkInstaller } from './jdk-installer';
import { ProcessManager } from '../process/process-manager';

export class JdkManager {
  /**
   * Retrieves all detected JDKs available on the system.
   */
  public static async getAvailableJdks(rootDir?: string | null): Promise<JdkInfo[]> {
    return JdkDetection.discoverInstalledJdks(rootDir);
  }

  /**
   * Identifies the current active JDK pointed to by JAVA_HOME or PATH.
   */
  public static async getActiveJdk(): Promise<JdkInfo | null> {
    const javaHome = process.env['JAVA_HOME'];
    if (javaHome && fs.existsSync(javaHome)) {
      return JdkDetection.inspectJdkDirectory(javaHome);
    }

    const available = await JdkDetection.discoverInstalledJdks();
    return available.length > 0 ? available[0] : null;
  }

  /**
   * Installs managed Eclipse Temurin OpenJDK 17 LTS into <rootDir>/jdk/managed.
   */
  public static async installManagedJdk(
    rootDir: string,
    onProgress?: (progress: InstallProgress) => void
  ): Promise<JdkInfo> {
    return JdkInstaller.installManagedJdk(rootDir, onProgress);
  }

  /**
   * Configures the JDK environment strategy and updates user-level JAVA_HOME safely.
   */
  public static async setJdkConfiguration(
    mode: 'detect' | 'managed' | 'manual',
    rootDir: string | null,
    customPath?: string
  ): Promise<{ success: boolean; javaHome: string; jdk: JdkInfo }> {
    let targetPath: string | null = null;

    if (mode === 'manual') {
      if (!customPath || !fs.existsSync(customPath)) {
        throw new Error(`The specified custom JDK path does not exist: ${customPath}`);
      }
      if (!JdkDetection.isValidJdkDirectory(customPath)) {
        throw new Error(`The specified path is missing bin/java.exe: ${customPath}`);
      }
      targetPath = path.resolve(customPath);
    } else if (mode === 'managed') {
      if (!rootDir) {
        throw new Error('A valid root directory is required to configure a Managed JDK.');
      }
      const managedPath = path.join(rootDir, 'jdk', 'managed');
      if (!fs.existsSync(managedPath)) {
        // Automatically install managed JDK if absent
        await this.installManagedJdk(rootDir);
      }
      targetPath = managedPath;
    } else {
      // mode === 'detect'
      const available = await JdkDetection.discoverInstalledJdks(rootDir);
      if (available.length === 0) {
        throw new Error('No compatible JDK was detected on this machine. Please install the Managed OpenJDK.');
      }
      // Prefer compatible JDK 17+
      const compatible = available.find(j => j.isCompatibleWithAgp8 && j.isJdk) || available[0];
      targetPath = compatible.path;
    }

    const jdkInfo = await JdkDetection.inspectJdkDirectory(targetPath, rootDir);
    if (!jdkInfo) {
      throw new Error(`Failed to validate JDK at: ${targetPath}`);
    }

    // Persist to Windows User Registry: HKCU:\Environment\JAVA_HOME
    await this.setUserJavaHome(targetPath);

    // Synchronize in-memory process environment
    process.env['JAVA_HOME'] = targetPath;

    return {
      success: true,
      javaHome: targetPath,
      jdk: jdkInfo
    };
  }

  /**
   * Sets persistent User JAVA_HOME in HKCU:\Environment via PowerShell.
   */
  private static async setUserJavaHome(targetPath: string): Promise<void> {
    const escaped = targetPath.replace(/'/g, "''");
    const script = `[System.Environment]::SetEnvironmentVariable('JAVA_HOME', '${escaped}', [System.EnvironmentVariableTarget]::User)`;
    const result = await ProcessManager.executePowerShell(script, 5000);

    if (result.exitCode !== 0) {
      throw new Error(`Failed to set persistent User JAVA_HOME: ${result.stderr}`);
    }
  }
}

