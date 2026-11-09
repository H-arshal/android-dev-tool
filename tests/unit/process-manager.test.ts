import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ProcessManager } from '../../src/core/process/process-manager';

describe('ProcessManager', () => {
  it('should execute a standard node command and return stdout', async () => {
    const result = await ProcessManager.execute(process.execPath, ['-e', 'console.log("hello process manager")']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('hello process manager');
  });

  it('should capture stderr when a process outputs an error', async () => {
    const result = await ProcessManager.execute(process.execPath, ['-e', 'console.error("test error output"); process.exit(2)']);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('test error output');
  });

  it('should gracefully handle non-existent executables with negative exit code', async () => {
    const result = await ProcessManager.execute('non_existent_binary_xyz_123.exe', []);
    expect(result.exitCode).toBe(-1);
    expect(result.stderr).toBeDefined();
  });

  it('should respect execution timeouts', async () => {
    const result = await ProcessManager.execute(
      process.execPath,
      ['-e', 'setTimeout(() => {}, 5000)'],
      { timeout: 300 }
    );
    expect(result.exitCode).toBe(-1);
    expect(result.stderr).toContain('timed out');
  });

  it('should execute a Windows batch file without EINVAL errors', async () => {
    if (process.platform !== 'win32') return;

    const tempBat = path.join(os.tmpdir(), `test_pm_${Date.now()}.bat`);
    fs.writeFileSync(tempBat, '@echo off\r\necho BATCH SUCCESS: %1 %2\r\n');

    try {
      const result = await ProcessManager.execute(tempBat, ['arg1', 'arg with spaces']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('BATCH SUCCESS: arg1 "arg with spaces"');
    } finally {
      try {
        fs.unlinkSync(tempBat);
      } catch {}
    }
  });
});
