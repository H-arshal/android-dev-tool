import * as fs from 'fs';
import * as path from 'path';
import { JdkInfo, InstallProgress } from '../../shared/types';
import { MANAGED_JDK_CONFIG } from '../../shared/constants';
import { Downloader } from '../installer/downloader';
import { Extractor } from '../installer/extractor';
import { JdkDetection } from './jdk-detection';

export class JdkInstaller {
  /**
   * Downloads and extracts certified Eclipse Temurin OpenJDK 17 LTS to <rootDir>/jdk/managed.
   */
  public static async installManagedJdk(
    rootDir: string,
    onProgress?: (progress: InstallProgress) => void
  ): Promise<JdkInfo> {
    const downloadsDir = path.join(rootDir, 'downloads');
    const jdkDir = path.join(rootDir, 'jdk');
    const managedJdkDir = path.join(jdkDir, MANAGED_JDK_CONFIG.FOLDER_NAME);
    const tempExtractDir = path.join(jdkDir, '_temp_extract');

    if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });
    if (!fs.existsSync(jdkDir)) fs.mkdirSync(jdkDir, { recursive: true });

    // 1. Download OpenJDK Archive
    const zipPath = path.join(downloadsDir, MANAGED_JDK_CONFIG.FILE_NAME);
    let shouldDownload = true;

    if (fs.existsSync(zipPath)) {
      const stats = fs.statSync(zipPath);
      if (stats.size > 100 * 1024 * 1024) { // Typical Temurin JDK 17 is ~170MB
        shouldDownload = false;
      }
    }

    if (shouldDownload) {
      if (onProgress) {
        onProgress({
          phase: 'downloading',
          currentTask: `Downloading ${MANAGED_JDK_CONFIG.DISTRIBUTION}`,
          percentage: 0,
          message: 'Connecting to Adoptium releases...'
        });
      }

      await Downloader.downloadFile(MANAGED_JDK_CONFIG.URL, zipPath, {
        onProgress: (p) => {
          if (onProgress) {
            onProgress({
              phase: 'downloading',
              currentTask: `Downloading ${MANAGED_JDK_CONFIG.DISTRIBUTION}`,
              percentage: p.percentage,
              downloadedBytes: p.downloadedBytes,
              totalBytes: p.totalBytes,
              message: `Downloaded ${(p.downloadedBytes / (1024 * 1024)).toFixed(1)} MB of ${(p.totalBytes / (1024 * 1024)).toFixed(1)} MB`
            });
          }
        }
      });
    }

    // 2. Extract Archive
    if (onProgress) {
      onProgress({
        phase: 'extracting',
        currentTask: `Extracting ${MANAGED_JDK_CONFIG.DISTRIBUTION}`,
        percentage: undefined,
        message: 'Unpacking OpenJDK archive...'
      });
    }

    if (fs.existsSync(tempExtractDir)) {
      try {
        fs.rmSync(tempExtractDir, { recursive: true, force: true });
      } catch {}
    }
    fs.mkdirSync(tempExtractDir, { recursive: true });

    await Extractor.extractZip(zipPath, tempExtractDir);

    // Locate the inner JDK folder (e.g. jdk-17.0.12+7)
    const entries = fs.readdirSync(tempExtractDir, { withFileTypes: true });
    let sourceFolder = tempExtractDir;

    const innerFolder = entries.find(e => e.isDirectory() && (e.name.startsWith('jdk-') || e.name.startsWith('jdk17')));
    if (innerFolder) {
      sourceFolder = path.join(tempExtractDir, innerFolder.name);
    }

    // 3. Move to <rootDir>/jdk/managed
    if (fs.existsSync(managedJdkDir)) {
      try {
        fs.rmSync(managedJdkDir, { recursive: true, force: true });
      } catch {}
    }

    try {
      fs.renameSync(sourceFolder, managedJdkDir);
    } catch {
      this.copyDirectoryRecursive(sourceFolder, managedJdkDir);
    }

    // Clean up temporary extraction directory
    try {
      if (fs.existsSync(tempExtractDir)) {
        fs.rmSync(tempExtractDir, { recursive: true, force: true });
      }
    } catch {}

    // 4. Validate and Inspect Installed Managed JDK
    const jdkInfo = await JdkDetection.inspectJdkDirectory(managedJdkDir, rootDir);
    if (!jdkInfo) {
      throw new Error(`Managed JDK extraction verification failed at: ${managedJdkDir}`);
    }

    if (onProgress) {
      onProgress({
        phase: 'completed',
        currentTask: `${MANAGED_JDK_CONFIG.DISTRIBUTION} installed successfully`,
        percentage: 100,
        message: 'Java runtime is ready.'
      });
    }

    return jdkInfo;
  }

  private static copyDirectoryRecursive(source: string, destination: string) {
    if (!fs.existsSync(destination)) {
      fs.mkdirSync(destination, { recursive: true });
    }
    const entries = fs.readdirSync(source, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(source, entry.name);
      const destPath = path.join(destination, entry.name);

      if (entry.isDirectory()) {
        this.copyDirectoryRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}

