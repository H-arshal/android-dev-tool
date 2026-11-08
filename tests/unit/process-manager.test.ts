import { describe, it, expect } from 'vitest';
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
});
