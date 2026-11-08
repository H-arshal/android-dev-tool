import * as path from 'path';
import { ProcessManager } from '../process/process-manager';

export class WindowsEnvironment {
  /**
   * Reads a persistent User environment variable from HKCU:\Environment.
   * Utilizes reg.exe for ultra-fast native registry inspection (< 20ms).
   */
  public static async getUserEnvironmentVariable(varName: string): Promise<string | null> {
    const regResult = await ProcessManager.execute('reg.exe', [
      'query',
      'HKCU\\Environment',
      '/v',
      varName
    ], { timeout: 3000 });

    if (regResult.exitCode === 0 && regResult.stdout) {
      // reg query output format:
      //     VARNAME    REG_SZ    VALUE
      // or  VARNAME    REG_EXPAND_SZ    VALUE
      const lines = regResult.stdout.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith(varName)) {
          const match = trimmed.match(new RegExp(`^${varName}\\s+REG_(?:SZ|EXPAND_SZ)\\s+(.*)$`, 'i'));
          if (match && match[1]) {
            return match[1].trim();
          }
        }
      }
    }

    // Secondary fallback: PowerShell .NET query
    const psResult = await ProcessManager.executePowerShell(
      `[System.Environment]::GetEnvironmentVariable('${varName}', [System.EnvironmentVariableTarget]::User)`,
      5000
    );

    if (psResult.exitCode === 0 && psResult.stdout.trim().length > 0) {
      return psResult.stdout.trim();
    }

    return null;
  }

  /**
   * Reads the current persistent User PATH from HKCU:\Environment.
   */
  public static async getUserPath(): Promise<string> {
    const userPath = await this.getUserEnvironmentVariable('PATH');
    return userPath || '';
  }

  /**
   * Parses a Windows PATH string into an array of cleaned, normalized entries.
   */
  public static parsePathEntries(pathStr: string): string[] {
    if (!pathStr || pathStr.trim().length === 0) {
      return [];
    }

    return pathStr
      .split(';')
      .map(entry => entry.trim())
      .filter(entry => entry.length > 0);
  }

  /**
   * Normalizes a filesystem path for case-insensitive Windows comparisons.
   */
  public static normalizePath(targetPath: string): string {
    if (!targetPath) return '';
    let normalized = path.normalize(targetPath).trim();
    // Strip trailing slashes
    normalized = normalized.replace(/[\\/]+$/, '');
    // Standardize drive letter casing
    if (/^[a-zA-Z]:/.test(normalized)) {
      normalized = normalized.charAt(0).toUpperCase() + normalized.slice(1);
    }
    return normalized.toLowerCase();
  }

  /**
   * Checks whether targetDir is contained within the supplied list of PATH entries.
   */
  public static isDirectoryInPathList(targetDir: string, pathList: string[]): boolean {
    const normalizedTarget = this.normalizePath(targetDir);
    return pathList.some(entry => this.normalizePath(entry) === normalizedTarget);
  }

  /**
   * Resolves common environment variable markers like %LOCALAPPDATA% or %USERPROFILE%.
   */
  public static expandEnvironmentMarkers(rawPath: string): string {
    return rawPath.replace(/%([^%]+)%/g, (_, n) => {
      return process.env[n] || `%${n}%`;
    });
  }
}
