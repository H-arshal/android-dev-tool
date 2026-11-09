import * as fs from 'fs';
import * as path from 'path';
import { JdkInfo } from '../../shared/types';
import { COMMON_WINDOWS_JDK_SEARCH_PATHS } from '../../shared/constants';
import { WindowsEnvironment } from '../environment/windows-environment';
import { ProcessManager } from '../process/process-manager';

export class JdkDetection {
  /**
   * Discovers and validates all JDK installations on the machine.
   */
  public static async discoverInstalledJdks(managedRoot?: string | null): Promise<JdkInfo[]> {
    const candidateDirs = new Set<string>();

    // 1. Check JAVA_HOME from Process Environment and Registry
    const procJavaHome = process.env['JAVA_HOME'];
    if (procJavaHome) candidateDirs.add(procJavaHome);

    const userJavaHome = await WindowsEnvironment.getUserEnvironmentVariable('JAVA_HOME');
    if (userJavaHome) candidateDirs.add(userJavaHome);

    // 2. Check Managed JDK location if root is provided
    if (managedRoot) {
      const managedPath = path.join(managedRoot, 'jdk', 'managed');
      if (fs.existsSync(managedPath)) {
        candidateDirs.add(managedPath);
      }
    }

    // 3. Check where java.exe resolves in PATH
    const whereResult = await ProcessManager.execute('where.exe', ['java'], { timeout: 3000 });
    if (whereResult.exitCode === 0 && whereResult.stdout) {
      const lines = whereResult.stdout.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && fs.existsSync(trimmed)) {
          // If in <jdk>/bin/java.exe, candidate is <jdk>
          const binDir = path.dirname(trimmed);
          if (path.basename(binDir).toLowerCase() === 'bin') {
            candidateDirs.add(path.dirname(binDir));
          }
        }
      }
    }

    // 4. Scan Common Windows JDK Installation Paths
    for (const searchPattern of COMMON_WINDOWS_JDK_SEARCH_PATHS) {
      const expandedDir = WindowsEnvironment.expandEnvironmentMarkers(searchPattern);
      if (fs.existsSync(expandedDir)) {
        try {
          const stats = fs.statSync(expandedDir);
          if (stats.isDirectory()) {
            // Check if this directory itself is a JDK
            if (this.isValidJdkDirectory(expandedDir)) {
              candidateDirs.add(expandedDir);
            } else {
              // Check subdirectories (e.g. C:\Program Files\Java\jdk-17.0.8)
              const entries = fs.readdirSync(expandedDir, { withFileTypes: true });
              for (const entry of entries) {
                if (entry.isDirectory()) {
                  const subDir = path.join(expandedDir, entry.name);
                  if (this.isValidJdkDirectory(subDir)) {
                    candidateDirs.add(subDir);
                  }
                }
              }
            }
          }
        } catch {
          // Ignore folder read permission errors
        }
      }
    }

    // 5. Inspect each candidate directory
    const discoveredJdks: JdkInfo[] = [];
    const normalizedSeen = new Set<string>();

    for (const candidate of candidateDirs) {
      const normalized = WindowsEnvironment.normalizePath(candidate);
      if (normalizedSeen.has(normalized)) continue;
      normalizedSeen.add(normalized);

      const info = await this.inspectJdkDirectory(candidate, managedRoot);
      if (info) {
        discoveredJdks.push(info);
      }
    }

    // Sort JDKs: Compatible first, then descending major version
    discoveredJdks.sort((a, b) => {
      if (a.isCompatibleWithAgp8 !== b.isCompatibleWithAgp8) {
        return a.isCompatibleWithAgp8 ? -1 : 1;
      }
      return b.majorVersion - a.majorVersion;
    });

    return discoveredJdks;
  }

  /**
   * Fast sync check to verify if a folder has standard JDK binary layout.
   */
  public static isValidJdkDirectory(dirPath: string): boolean {
    if (!dirPath || !fs.existsSync(dirPath)) return false;
    const javaExe = path.join(dirPath, 'bin', 'java.exe');
    return fs.existsSync(javaExe);
  }

  /**
   * Inspects a candidate JDK directory and extracts detailed metadata.
   */
  public static async inspectJdkDirectory(dirPath: string, managedRoot?: string | null): Promise<JdkInfo | null> {
    if (!this.isValidJdkDirectory(dirPath)) {
      return null;
    }

    const javaExe = path.join(dirPath, 'bin', 'java.exe');
    const javacExe = path.join(dirPath, 'bin', 'javac.exe');
    const isJdk = fs.existsSync(javacExe);

    // Run java.exe -version (outputs to stderr)
    const result = await ProcessManager.execute(javaExe, ['-version'], { timeout: 4000 });
    const output = (result.stderr + '\n' + result.stdout).trim();

    if (!output) {
      return null;
    }

    const { version, majorVersion, vendor } = this.parseJavaVersionOutput(output);
    const isManaged = managedRoot ? WindowsEnvironment.normalizePath(dirPath).includes('jdk\\managed') : false;

    return {
      path: path.normalize(dirPath),
      version,
      majorVersion,
      vendor,
      isJdk,
      isCompatibleWithAgp8: majorVersion >= 17,
      isManaged
    };
  }

  /**
   * Parses java -version command output into structured metadata.
   */
  public static parseJavaVersionOutput(output: string): {
    version: string;
    majorVersion: number;
    vendor: string;
  } {
    // 1. Extract Version String
    const versionMatch = output.match(/(?:java|openjdk)\s+version\s+"([^"]+)"/i) ||
                         output.match(/version\s+"([^"]+)"/i);
    const version = versionMatch ? versionMatch[1] : 'Unknown';

    // 2. Determine Major Version Number
    let majorVersion = 0;
    if (version !== 'Unknown') {
      const parts = version.split('.');
      const first = parseInt(parts[0], 10);
      if (first === 1 && parts.length > 1) {
        // Legacy Java 1.8.x format
        majorVersion = parseInt(parts[1], 10);
      } else if (!isNaN(first)) {
        majorVersion = first;
      }
    }

    // 3. Extract Vendor
    let vendor = 'OpenJDK';
    if (/Temurin|Adoptium/i.test(output)) {
      vendor = 'Eclipse Temurin';
    } else if (/Microsoft/i.test(output)) {
      vendor = 'Microsoft';
    } else if (/Corretto/i.test(output)) {
      vendor = 'Amazon Corretto';
    } else if (/Zulu/i.test(output)) {
      vendor = 'Azul Zulu';
    } else if (/Oracle|Java\(TM\)|HotSpot\(TM\)/i.test(output)) {
      vendor = 'Oracle';
    } else if (/JetBrains/i.test(output)) {
      vendor = 'JetBrains Runtime';
    }

    return {
      version,
      majorVersion,
      vendor
    };
  }
}
