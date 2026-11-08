import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import {
  StartInstallPayload,
  InstallProgress,
  InstallResult,
  InstallationProfile
} from '../../shared/types';
import {
  GOOGLE_CMDLINE_TOOLS,
  PROFILE_DEFAULT_PACKAGES
} from '../../shared/constants';
import { Downloader } from './downloader';
import { Extractor } from './extractor';
import { CmdlineToolsAdapter } from '../sdk/package-manager-adapter';

export class Installer {
  private isCancelled = false;

  public cancel() {
    this.isCancelled = true;
  }

  /**
   * Orchestrates the complete end-to-end installation of the Android development environment.
   */
  public async start(
    payload: StartInstallPayload,
    onProgress: (progress: InstallProgress) => void
  ): Promise<InstallResult> {
    this.isCancelled = false;

    const rootDir = path.resolve(payload.rootDir);
    const sdkRoot = path.join(rootDir, 'sdk');
    const downloadsDir = path.join(rootDir, 'downloads');
    const configDir = path.join(rootDir, 'config');
    const logsDir = path.join(rootDir, 'logs');

    // 1. Pre-flight Validation
    onProgress({
      phase: 'validating',
      currentTask: 'Validating disk space and target directory permissions',
      message: `Inspecting ${rootDir}...`
    });

    await this.validatePreflight(rootDir, payload.profile);
    if (this.isCancelled) throw new Error('Installation was cancelled by the user.');

    // Ensure directory skeleton
    await fs.mkdir(sdkRoot, { recursive: true });
    await fs.mkdir(downloadsDir, { recursive: true });
    await fs.mkdir(configDir, { recursive: true });
    await fs.mkdir(logsDir, { recursive: true });

    // 2. Download Command-line Tools
    const archivePath = path.join(downloadsDir, GOOGLE_CMDLINE_TOOLS.FILE_NAME);

    // Skip download if archive already exists and is valid
    let shouldDownload = true;
    if (fsSync.existsSync(archivePath)) {
      const stats = fsSync.statSync(archivePath);
      if (stats.size > 50 * 1024 * 1024) { // Typical size is ~140 MB
        shouldDownload = false;
      }
    }

    if (shouldDownload) {
      onProgress({
        phase: 'downloading',
        currentTask: 'Downloading official Google Android command-line tools',
        percentage: 0,
        message: 'Connecting to dl.google.com...'
      });

      await Downloader.downloadFile(GOOGLE_CMDLINE_TOOLS.URL, archivePath, {
        expectedSha256: GOOGLE_CMDLINE_TOOLS.SHA256,
        onProgress: (p) => {
          if (this.isCancelled) return;
          onProgress({
            phase: 'downloading',
            currentTask: 'Downloading Google command-line tools',
            percentage: p.percentage,
            downloadedBytes: p.downloadedBytes,
            totalBytes: p.totalBytes,
            message: `Downloaded ${(p.downloadedBytes / (1024 * 1024)).toFixed(1)} MB of ${(p.totalBytes / (1024 * 1024)).toFixed(1)} MB`
          });
        }
      });
    }

    if (this.isCancelled) throw new Error('Installation was cancelled by the user.');

    // 3. Extract Command-line Tools into cmdline-tools/latest
    onProgress({
      phase: 'extracting',
      currentTask: 'Extracting command-line tools into SDK directory',
      percentage: undefined,
      message: 'Unpacking archive into cmdline-tools/latest...'
    });

    await Extractor.extractCmdlineTools(archivePath, sdkRoot);

    if (this.isCancelled) throw new Error('Installation was cancelled by the user.');

    // 4. Initialize Package Manager and Accept Licenses
    onProgress({
      phase: 'accepting_licenses',
      currentTask: 'Configuring SDK license agreements',
      message: 'Writing accepted license signatures...'
    });

    const pkgAdapter = new CmdlineToolsAdapter(sdkRoot);
    await pkgAdapter.acceptLicenses();

    if (this.isCancelled) throw new Error('Installation was cancelled by the user.');

    // 5. Install Selected Profile Packages
    const packagesToInstall = payload.customPackages && payload.customPackages.length > 0
      ? payload.customPackages
      : (PROFILE_DEFAULT_PACKAGES[payload.profile] || PROFILE_DEFAULT_PACKAGES['physical-device']);

    onProgress({
      phase: 'installing_packages',
      currentTask: `Installing Android SDK packages: ${packagesToInstall.join(', ')}`,
      percentage: undefined,
      message: 'Executing sdkmanager.bat to download and configure build packages...'
    });

    const installResult = await pkgAdapter.installPackages(packagesToInstall, onProgress);

    // 6. Write Installation Manifest
    const manifestPath = path.join(configDir, 'installation.json');
    const manifestData = {
      schemaVersion: 1,
      sdkRoot,
      status: 'completed',
      installedAt: new Date().toISOString(),
      profile: payload.profile,
      packages: packagesToInstall
    };
    await fs.writeFile(manifestPath, JSON.stringify(manifestData, null, 2), 'utf-8');

    onProgress({
      phase: 'completed',
      currentTask: 'Android development tools installed successfully',
      percentage: 100,
      message: 'SDK is ready.'
    });

    return installResult;
  }

  private async validatePreflight(rootDir: string, profile: InstallationProfile) {
    // 1. Check drive free space
    try {
      const rootDrive = path.parse(rootDir).root || 'C:\\';
      const stats = await fs.statfs(rootDrive);
      const freeBytes = stats.bfree * stats.bsize;
      const freeGb = freeBytes / (1024 * 1024 * 1024);

      const requiredGb = profile === 'full-setup' ? 15 : 5;
      if (freeGb < requiredGb) {
        throw new Error(
          `Insufficient disk space on ${rootDrive}. Required: ${requiredGb} GB, Available: ${freeGb.toFixed(1)} GB.`
        );
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('Insufficient disk space')) {
        throw err;
      }
      // If statfs is unsupported on this mount, continue with warning
    }

    // 2. Test directory write permissions
    try {
      await fs.mkdir(rootDir, { recursive: true });
      const testFile = path.join(rootDir, `.test_write_${Date.now()}`);
      await fs.writeFile(testFile, 'test');
      await fs.unlink(testFile);
    } catch {
      throw new Error(`Write permission denied for target directory: ${rootDir}`);
    }
  }
}

