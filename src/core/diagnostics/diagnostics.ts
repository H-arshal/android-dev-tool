import * as fs from 'fs';
import * as path from 'path';
import { DiagnosticIssue } from '../../shared/types';
import { WindowsEnvironment } from '../environment/windows-environment';
import { EnvironmentManager } from '../environment/environment-manager';
import { CmdlineToolsAdapter } from '../sdk/package-manager-adapter';
import { JdkDetection } from '../jdk/jdk-detection';
import { ProcessManager } from '../process/process-manager';

export interface DiagnosticContext {
  sdkRoot: string | null;
  androidHome: string | null;
  androidSdkRoot: string | null;
  javaHome: string | null;
}

export class DiagnosticsEngine {
  /**
   * Runs all diagnostic probes against the current environment.
   */
  public static async runAllChecks(context: DiagnosticContext): Promise<DiagnosticIssue[]> {
    const issues: DiagnosticIssue[] = [];

    // Probe 1: ANDROID_HOME and ANDROID_SDK_ROOT checks
    const homeIssues = await this.checkAndroidHome(context);
    issues.push(...homeIssues);

    // Probe 2: ADB and User PATH checks
    const pathIssues = await this.checkAdbAndPath(context);
    issues.push(...pathIssues);

    // Probe 3: Command-line Tools directory layout check
    const cmdlineIssues = await this.checkCmdlineToolsLayout(context.sdkRoot);
    issues.push(...cmdlineIssues);

    // Probe 4: Java Development Kit compatibility check
    const javaIssues = await this.checkJavaEnvironment(context.javaHome);
    issues.push(...javaIssues);

    // Probe 5: SDK Licenses check
    const licenseIssues = await this.checkLicenses(context.sdkRoot);
    issues.push(...licenseIssues);

    return issues;
  }

  /**
   * Probe: Validates ANDROID_HOME and reconciles legacy ANDROID_SDK_ROOT.
   */
  public static async checkAndroidHome(context: DiagnosticContext): Promise<DiagnosticIssue[]> {
    const issues: DiagnosticIssue[] = [];

    if (!context.sdkRoot) {
      issues.push({
        id: 'missing-sdk',
        severity: 'warning',
        title: 'Android SDK Not Found',
        description: 'No existing Android SDK was detected in standard directories or environment variables.',
        solution: 'Run the Setup Manager wizard to install the required Android development tools.',
        canAutoFix: false
      });
      return issues;
    }

    // Check if SDK folder actually exists on disk
    if (!fs.existsSync(context.sdkRoot)) {
      issues.push({
        id: 'invalid-sdk-directory',
        severity: 'error',
        title: 'Configured SDK Directory Does Not Exist',
        description: `The configured Android SDK path (${context.sdkRoot}) does not exist on disk.`,
        detectedPath: context.sdkRoot,
        solution: 'Verify the path in Settings or run the Setup Manager to install into this directory.',
        canAutoFix: false
      });
    }

    // Check if ANDROID_HOME variable is defined
    if (!context.androidHome) {
      issues.push({
        id: 'missing-android-home',
        severity: 'warning',
        title: 'ANDROID_HOME Variable Not Set',
        description: `An Android SDK was detected at ${context.sdkRoot}, but the ANDROID_HOME environment variable is not defined.`,
        detectedPath: context.sdkRoot,
        solution: 'Set the user-level ANDROID_HOME environment variable to point to this SDK directory.',
        canAutoFix: true,
        autoFixAction: 'SET_ANDROID_HOME'
      });
    }

    // Check for conflicting legacy ANDROID_SDK_ROOT
    if (context.androidHome && context.androidSdkRoot) {
      if (WindowsEnvironment.normalizePath(context.androidHome) !== WindowsEnvironment.normalizePath(context.androidSdkRoot)) {
        issues.push({
          id: 'conflicting-sdk-paths',
          severity: 'warning',
          title: 'Conflicting Android SDK Environment Variables',
          description: `ANDROID_HOME (${context.androidHome}) and legacy ANDROID_SDK_ROOT (${context.androidSdkRoot}) point to different directories.`,
          solution: 'Reconcile ANDROID_SDK_ROOT to match ANDROID_HOME.',
          canAutoFix: true,
          autoFixAction: 'SET_ANDROID_HOME'
        });
      }
    }

    return issues;
  }

  /**
   * Probe: Inspects ADB presence on disk and visibility in User PATH.
   */
  public static async checkAdbAndPath(context: DiagnosticContext): Promise<DiagnosticIssue[]> {
    const issues: DiagnosticIssue[] = [];
    if (!context.sdkRoot) return issues;

    const adbPath = path.join(context.sdkRoot, 'platform-tools', 'adb.exe');
    const adbExists = fs.existsSync(adbPath);

    if (!adbExists) {
      issues.push({
        id: 'missing-platform-tools',
        severity: 'warning',
        title: 'Platform Tools (ADB) Not Installed',
        description: 'The platform-tools directory or adb.exe binary is missing from your Android SDK.',
        detectedPath: path.join(context.sdkRoot, 'platform-tools'),
        solution: 'Install the Platform Tools package via the SDK Packages manager.',
        canAutoFix: false
      });
      return issues;
    }

    // Test direct CLI execution from PATH
    const directExec = await ProcessManager.execute('adb.exe', ['version'], { timeout: 3000 });
    const inPath = directExec.exitCode === 0;

    if (!inPath) {
      issues.push({
        id: 'adb-not-in-path',
        severity: 'warning',
        title: 'ADB is Not Recognized in PATH',
        description: 'The adb.exe binary is installed on disk, but its containing platform-tools directory is absent from your User PATH.',
        detectedPath: adbPath,
        solution: 'Append the platform-tools directory to your Windows User PATH environment variable.',
        canAutoFix: true,
        autoFixAction: 'ADD_PATH'
      });
    }

    return issues;
  }

  /**
   * Probe: Enforces Google's mandatory cmdline-tools/latest nested layout.
   */
  public static async checkCmdlineToolsLayout(sdkRoot: string | null): Promise<DiagnosticIssue[]> {
    const issues: DiagnosticIssue[] = [];
    if (!sdkRoot || !fs.existsSync(sdkRoot)) return issues;

    const cmdlineToolsDir = path.join(sdkRoot, 'cmdline-tools');
    if (!fs.existsSync(cmdlineToolsDir)) return issues;

    const latestDir = path.join(cmdlineToolsDir, 'latest');
    const unnestedBin = path.join(cmdlineToolsDir, 'bin', 'sdkmanager.bat');

    // If sdkmanager.bat was extracted directly into cmdline-tools/bin rather than cmdline-tools/latest/bin
    if (fs.existsSync(unnestedBin) && !fs.existsSync(latestDir)) {
      issues.push({
        id: 'cmdline-tools-not-nested',
        severity: 'error',
        title: 'Invalid Command-Line Tools Directory Layout',
        description: 'sdkmanager.bat is located in cmdline-tools/bin instead of cmdline-tools/latest/bin. Google tools will fail with "Could not determine SDK root".',
        detectedPath: unnestedBin,
        solution: 'Move the command-line tools directory contents into a subfolder named "latest".',
        canAutoFix: true,
        autoFixAction: 'REPAIR_CMDLINE_TOOLS'
      });
    }

    return issues;
  }

  /**
   * Probe: Inspects Java Development Kit installation and AGP 8.x compatibility.
   */
  public static async checkJavaEnvironment(javaHome: string | null): Promise<DiagnosticIssue[]> {
    const issues: DiagnosticIssue[] = [];

    const activeJdk = await JdkDetection.inspectJdkDirectory(javaHome || '');
    const hasActiveJava = activeJdk !== null;

    if (!hasActiveJava) {
      // Test if java is runnable from PATH
      const pathJava = await ProcessManager.execute('java.exe', ['-version'], { timeout: 3000 });
      if (pathJava.exitCode !== 0) {
        issues.push({
          id: 'missing-java',
          severity: 'error',
          title: 'Java Runtime Not Found',
          description: 'No compatible Java Development Kit (JDK) was found in JAVA_HOME or system PATH.',
          solution: 'Install the Managed OpenJDK 17 LTS via the JDK Manager.',
          canAutoFix: false
        });
        return issues;
      }

      const parsed = JdkDetection.parseJavaVersionOutput(pathJava.stderr + '\n' + pathJava.stdout);
      if (parsed.majorVersion < 17) {
        issues.push({
          id: 'incompatible-java',
          severity: 'warning',
          title: 'Outdated Java Version Detected',
          description: `Java ${parsed.majorVersion} was detected in PATH. Modern Android Gradle Plugin (AGP 8.x+) requires JDK 17 or higher.`,
          solution: 'Upgrade to OpenJDK 17 LTS or install the Managed JDK in Android Dev Tools.',
          canAutoFix: false
        });
      }
    } else if (activeJdk && !activeJdk.isCompatibleWithAgp8) {
      issues.push({
        id: 'incompatible-java',
        severity: 'warning',
        title: 'Active JDK Incompatible with AGP 8.x',
        description: `JAVA_HOME points to Java ${activeJdk.majorVersion}. Android Gradle Plugin (AGP 8.x+) requires JDK 17 or higher.`,
        detectedPath: activeJdk.path,
        solution: 'Switch to a compatible JDK 17+ or install the Managed OpenJDK 17.',
        canAutoFix: false
      });
    }

    return issues;
  }

  /**
   * Probe: Verifies Android SDK license agreement status.
   */
  public static async checkLicenses(sdkRoot: string | null): Promise<DiagnosticIssue[]> {
    const issues: DiagnosticIssue[] = [];
    if (!sdkRoot || !fs.existsSync(sdkRoot)) return issues;

    const licensePath = path.join(sdkRoot, 'licenses', 'android-sdk-license');
    if (!fs.existsSync(licensePath)) {
      issues.push({
        id: 'unaccepted-licenses',
        severity: 'warning',
        title: 'Android SDK Licenses Pending',
        description: 'The Android SDK license agreements have not yet been accepted for this installation.',
        detectedPath: path.join(sdkRoot, 'licenses'),
        solution: 'Accept the Android SDK license terms to allow Gradle and CLI tools to assemble packages.',
        canAutoFix: true,
        autoFixAction: 'ACCEPT_LICENSES'
      });
    }

    return issues;
  }

  /**
   * Executes automated remediation for a diagnosed issue.
   */
  public static async executeAutoRepair(
    issueId: string,
    context: DiagnosticContext
  ): Promise<{ success: boolean; message: string }> {
    if (!context.sdkRoot) {
      throw new Error('No SDK root directory configured for auto-repair.');
    }

    switch (issueId) {
      case 'adb-not-in-path': {
        const result = await EnvironmentManager.configureSdkPaths(context.sdkRoot);
        return {
          success: true,
          message: result.changed
            ? 'Added platform-tools to User PATH. Please restart integrated terminal to use adb.'
            : 'platform-tools is already configured in PATH.'
        };
      }

      case 'missing-android-home':
      case 'conflicting-sdk-paths': {
        await EnvironmentManager.configureAndroidHome(context.sdkRoot, true);
        return {
          success: true,
          message: `Configured ANDROID_HOME and reconciled ANDROID_SDK_ROOT to ${context.sdkRoot}`
        };
      }

      case 'unaccepted-licenses': {
        const adapter = new CmdlineToolsAdapter(context.sdkRoot);
        return adapter.acceptLicenses();
      }

      case 'cmdline-tools-not-nested': {
        return this.repairCmdlineToolsNesting(context.sdkRoot);
      }

      default:
        throw new Error(`Auto-repair is not available for issue ID: ${issueId}`);
    }
  }

  /**
   * Repairs command-line tools directory layout by moving files into cmdline-tools/latest.
   */
  private static async repairCmdlineToolsNesting(sdkRoot: string): Promise<{ success: boolean; message: string }> {
    const cmdlineToolsDir = path.join(sdkRoot, 'cmdline-tools');
    const latestDir = path.join(cmdlineToolsDir, 'latest');
    const tempDir = path.join(sdkRoot, 'cmdline-tools_staging_' + Date.now());

    if (!fs.existsSync(cmdlineToolsDir)) {
      throw new Error(`Directory not found: ${cmdlineToolsDir}`);
    }

    // Rename cmdline-tools to staging
    fs.renameSync(cmdlineToolsDir, tempDir);
    fs.mkdirSync(cmdlineToolsDir, { recursive: true });

    // Move staging contents to cmdline-tools/latest
    fs.renameSync(tempDir, latestDir);

    return {
      success: true,
      message: 'Command-line tools directory layout repaired into cmdline-tools/latest.'
    };
  }
}

