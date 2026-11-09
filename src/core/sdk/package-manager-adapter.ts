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

  constructor(private readonly sdkRoot: string) {
    this.sdkmanagerPath = path.join(this.sdkRoot, 'cmdline-tools', 'latest', 'bin', 'sdkmanager.bat');
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
