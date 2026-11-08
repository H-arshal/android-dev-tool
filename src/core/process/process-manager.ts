import * as child_process from 'child_process';

export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ProcessOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeout?: number;
}

export class ProcessManager {
  /**
   * Spawns an executable with argument arrays, preventing shell injection vulnerabilities.
   */
  public static async execute(
    command: string,
    args: string[] = [],
    options: ProcessOptions = {}
  ): Promise<ProcessResult> {
    const timeout = options.timeout ?? 10000;

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let isSettled = false;

      const proc = child_process.spawn(command, args, {
        cwd: options.cwd,
        env: options.env ? { ...process.env, ...options.env } : process.env,
        windowsHide: true,
        shell: false
      });

      const timer = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          try {
            proc.kill();
          } catch {
            // Process may already be dead
          }
          resolve({
            stdout,
            stderr: stderr + `\nProcess timed out after ${timeout}ms`,
            exitCode: -1
          });
        }
      }, timeout);

      if (proc.stdout) {
        proc.stdout.on('data', (data) => {
          stdout += data.toString();
        });
      }

      if (proc.stderr) {
        proc.stderr.on('data', (data) => {
          stderr += data.toString();
        });
      }

      proc.on('error', (err) => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timer);
          resolve({
            stdout,
            stderr: err.message,
            exitCode: -1
          });
        }
      });

      proc.on('close', (code) => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timer);
          resolve({
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode: code ?? 0
          });
        }
      });
    });
  }

  /**
   * Executes a PowerShell command safely and returns stdout.
   */
  public static async executePowerShell(script: string, timeout = 10000): Promise<ProcessResult> {
    const args = [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      script
    ];
    return this.execute('powershell.exe', args, { timeout });
  }
}

