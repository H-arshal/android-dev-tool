import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DiagnosticsEngine, DiagnosticContext } from '../../src/core/diagnostics/diagnostics';

describe('DiagnosticsEngine', () => {
  let tempSdkDir: string;

  beforeEach(() => {
    tempSdkDir = path.join(os.tmpdir(), `diag_test_${Date.now()}`);
    fs.mkdirSync(tempSdkDir, { recursive: true });
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempSdkDir)) {
        fs.rmSync(tempSdkDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it('should flag missing-sdk issue when sdkRoot is null', async () => {
    const context: DiagnosticContext = {
      sdkRoot: null,
      androidHome: null,
      androidSdkRoot: null,
      javaHome: null
    };

    const issues = await DiagnosticsEngine.checkAndroidHome(context);
    expect(issues.some(i => i.id === 'missing-sdk')).toBe(true);
  });

  it('should flag missing-android-home when SDK exists on disk but ANDROID_HOME is null', async () => {
    const context: DiagnosticContext = {
      sdkRoot: tempSdkDir,
      androidHome: null,
      androidSdkRoot: null,
      javaHome: null
    };

    const issues = await DiagnosticsEngine.checkAndroidHome(context);
    expect(issues.some(i => i.id === 'missing-android-home')).toBe(true);
    expect(issues.find(i => i.id === 'missing-android-home')?.canAutoFix).toBe(true);
  });

  it('should flag conflicting-sdk-paths when ANDROID_HOME and ANDROID_SDK_ROOT diverge', async () => {
    const context: DiagnosticContext = {
      sdkRoot: tempSdkDir,
      androidHome: 'C:\\Android_Tools\\sdk',
      androidSdkRoot: 'D:\\Old_Android\\sdk',
      javaHome: null
    };

    const issues = await DiagnosticsEngine.checkAndroidHome(context);
    expect(issues.some(i => i.id === 'conflicting-sdk-paths')).toBe(true);
  });

  it('should flag unaccepted-licenses when licenses directory is absent', async () => {
    const issues = await DiagnosticsEngine.checkLicenses(tempSdkDir);
    expect(issues.some(i => i.id === 'unaccepted-licenses')).toBe(true);
    expect(issues.find(i => i.id === 'unaccepted-licenses')?.canAutoFix).toBe(true);
  });

  it('should detect un-nested cmdline-tools directory layout', async () => {
    // Simulate un-nested Google archive extraction into cmdline-tools/bin/sdkmanager.bat
    const cmdlineBin = path.join(tempSdkDir, 'cmdline-tools', 'bin');
    fs.mkdirSync(cmdlineBin, { recursive: true });
    fs.writeFileSync(path.join(cmdlineBin, 'sdkmanager.bat'), '@echo off');

    const issues = await DiagnosticsEngine.checkCmdlineToolsLayout(tempSdkDir);
    expect(issues.some(i => i.id === 'cmdline-tools-not-nested')).toBe(true);
    expect(issues.find(i => i.id === 'cmdline-tools-not-nested')?.autoFixAction).toBe('REPAIR_CMDLINE_TOOLS');
  });

  it('should automatically repair unaccepted-licenses via executeAutoRepair', async () => {
    const context: DiagnosticContext = {
      sdkRoot: tempSdkDir,
      androidHome: tempSdkDir,
      androidSdkRoot: null,
      javaHome: null
    };

    const result = await DiagnosticsEngine.executeAutoRepair('unaccepted-licenses', context);
    expect(result.success).toBe(true);

    const issuesAfter = await DiagnosticsEngine.checkLicenses(tempSdkDir);
    expect(issuesAfter.length).toBe(0);
  });

  it('should automatically repair cmdline-tools nesting via executeAutoRepair', async () => {
    const cmdlineBin = path.join(tempSdkDir, 'cmdline-tools', 'bin');
    fs.mkdirSync(cmdlineBin, { recursive: true });
    fs.writeFileSync(path.join(cmdlineBin, 'sdkmanager.bat'), '@echo off');

    const context: DiagnosticContext = {
      sdkRoot: tempSdkDir,
      androidHome: tempSdkDir,
      androidSdkRoot: null,
      javaHome: null
    };

    const result = await DiagnosticsEngine.executeAutoRepair('cmdline-tools-not-nested', context);
    expect(result.success).toBe(true);

    // Verify file is now at cmdline-tools/latest/bin/sdkmanager.bat
    const repairedPath = path.join(tempSdkDir, 'cmdline-tools', 'latest', 'bin', 'sdkmanager.bat');
    expect(fs.existsSync(repairedPath)).toBe(true);

    const issuesAfter = await DiagnosticsEngine.checkCmdlineToolsLayout(tempSdkDir);
    expect(issuesAfter.length).toBe(0);
  });
});

