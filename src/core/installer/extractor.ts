import * as fs from 'fs';
import * as path from 'path';
import { ProcessManager } from '../process/process-manager';

export class Extractor {
  /**
   * Unpacks a ZIP archive into the destination directory using native Windows PowerShell Expand-Archive.
   */
  public static async extractZip(archivePath: string, destinationDir: string): Promise<boolean> {
    if (!fs.existsSync(archivePath)) {
      throw new Error(`Archive not found: ${archivePath}`);
    }

    if (!fs.existsSync(destinationDir)) {
      fs.mkdirSync(destinationDir, { recursive: true });
    }

    // Escape single quotes for PowerShell literal paths
    const escapedZip = archivePath.replace(/'/g, "''");
    const escapedDest = destinationDir.replace(/'/g, "''");

    const script = `Expand-Archive -LiteralPath '${escapedZip}' -DestinationPath '${escapedDest}' -Force`;
    const result = await ProcessManager.executePowerShell(script, 180000); // 3-minute timeout for large extractions

    if (result.exitCode !== 0) {
      throw new Error(`Archive extraction failed: ${result.stderr || result.stdout}`);
    }

    return true;
  }

  /**
   * Canonical extraction for Google's commandlinetools-win-*.zip.
   * Ensures files are nested properly under <sdkRoot>/cmdline-tools/latest.
   */
  public static async extractCmdlineTools(archivePath: string, sdkRoot: string): Promise<string> {
    const targetLatestDir = path.join(sdkRoot, 'cmdline-tools', 'latest');
    const tempExtractDir = path.join(sdkRoot, 'cmdline-tools', '_temp_extract');

    if (fs.existsSync(tempExtractDir)) {
      try {
        fs.rmSync(tempExtractDir, { recursive: true, force: true });
      } catch {}
    }

    fs.mkdirSync(tempExtractDir, { recursive: true });

    // Step 1: Extract into temporary staging folder
    await this.extractZip(archivePath, tempExtractDir);

    // Google's zip typically contains a top-level "cmdline-tools" folder
    const innerCmdlineTools = path.join(tempExtractDir, 'cmdline-tools');
    const sourceDir = fs.existsSync(innerCmdlineTools) ? innerCmdlineTools : tempExtractDir;

    // Step 2: Ensure destination directory exists and is clean
    if (fs.existsSync(targetLatestDir)) {
      try {
        fs.rmSync(targetLatestDir, { recursive: true, force: true });
      } catch {}
    }
    const parentDir = path.dirname(targetLatestDir);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    // Step 3: Move files to cmdline-tools/latest
    try {
      fs.renameSync(sourceDir, targetLatestDir);
    } catch {
      // If rename fails across volumes or locks, copy recursively
      this.copyDirectoryRecursive(sourceDir, targetLatestDir);
    }

    // Clean up temporary staging
    try {
      if (fs.existsSync(tempExtractDir)) {
        fs.rmSync(tempExtractDir, { recursive: true, force: true });
      }
    } catch {}

    const sdkManagerBat = path.join(targetLatestDir, 'bin', 'sdkmanager.bat');
    if (!fs.existsSync(sdkManagerBat)) {
      throw new Error(`sdkmanager.bat was not found at expected location: ${sdkManagerBat}`);
    }

    return targetLatestDir;
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

