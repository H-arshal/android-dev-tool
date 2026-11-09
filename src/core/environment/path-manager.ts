import * as path from 'path';
import { ProcessManager } from '../process/process-manager';
import { WindowsEnvironment } from './windows-environment';

export interface PathUpdateResult {
  updatedPath: string;
  addedEntries: string[];
  changed: boolean;
}

export class PathManager {
  public static readonly MAX_SAFE_PATH_LENGTH = 2048;

  /**
   * Retrieves current User PATH from HKCU:\Environment.
   */
  public static async getUserPath(): Promise<string> {
    return WindowsEnvironment.getUserPath();
  }

  /**
   * Surgically appends missing entries to a PATH string without altering existing entries.
   * Performs case-insensitive, normalized deduplication.
   */
  public static appendEntriesIfMissing(
    currentPath: string,
    newEntries: string[]
  ): PathUpdateResult {
    const existingEntries = WindowsEnvironment.parsePathEntries(currentPath);
    const normalizedExisting = new Set(
      existingEntries.map(e => WindowsEnvironment.normalizePath(e))
    );

    const addedEntries: string[] = [];

    for (const rawEntry of newEntries) {
      if (!rawEntry || rawEntry.trim().length === 0) continue;
      const normalizedTarget = WindowsEnvironment.normalizePath(rawEntry);

      if (!normalizedExisting.has(normalizedTarget)) {
        // Normalize slash direction to Windows backslashes
        const formattedEntry = path.normalize(rawEntry).replace(/[\\/]+$/, '');
        addedEntries.push(formattedEntry);
        normalizedExisting.add(normalizedTarget);
      }
    }

    if (addedEntries.length === 0) {
      return {
        updatedPath: currentPath,
        addedEntries: [],
        changed: false
      };
    }

    const updatedEntries = [...existingEntries, ...addedEntries];
    const updatedPath = updatedEntries.join(';');

    if (updatedPath.length > this.MAX_SAFE_PATH_LENGTH) {
      throw new Error(
        `User PATH length (${updatedPath.length} characters) exceeds safe limit of ${this.MAX_SAFE_PATH_LENGTH}. Operation aborted to prevent truncation.`
      );
    }

    return {
      updatedPath,
      addedEntries,
      changed: true
    };
  }

  /**
   * Sets the persistent User PATH in HKCU:\Environment via PowerShell.
   * Automatically broadcasts WM_SETTINGCHANGE so new explorer/terminal windows inherit it.
   */
  public static async setUserPath(updatedPath: string): Promise<boolean> {
    const escaped = updatedPath.replace(/'/g, "''");
    const script = `[System.Environment]::SetEnvironmentVariable('Path', '${escaped}', [System.EnvironmentVariableTarget]::User)`;

    const result = await ProcessManager.executePowerShell(script, 8000);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to update persistent User PATH: ${result.stderr || result.stdout}`);
    }

    return true;
  }

  /**
   * Surgically updates process.env.PATH in the active Extension Host process.
   */
  public static syncProcessPath(newEntries: string[]): void {
    const current = process.env['PATH'] || '';
    const { updatedPath, changed } = this.appendEntriesIfMissing(current, newEntries);
    if (changed) {
      process.env['PATH'] = updatedPath;
    }
  }
}

