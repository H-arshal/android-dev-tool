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
  shell?: boolean | string;
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
}

export class ProcessManager {
  /**
   * Spawns an executable with argument arrays, preventing shell injection vulnerabilities.
   * On Windows, automatically routes .bat and .cmd files through cmd.exe to prevent Node.js spawn EINVAL errors.
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
      let timer: NodeJS.Timeout | undefined;

      const settle = (result: ProcessResult) => {
        if (!isSettled) {
          isSettled = true;
          if (timer) clearTimeout(timer);
          resolve(result);
        }
      };

      const isBatch = process.platform === 'win32' && /\.(bat|cmd)$/i.test(command);
      let proc: child_process.ChildProcess;

      try {
        if (isBatch) {
          const comspec = process.env.COMSPEC || 'cmd.exe';
          const quotedArgs = args.map(arg => {
            if (arg.includes(' ') && !arg.startsWith('"')) {
              return `"${arg}"`;
            }
            return arg;
          });
          const innerCmd = `"${command}" ${quotedArgs.join(' ')}`.trim();
          const fullCommandLine = `"${innerCmd}"`;

          proc = child_process.spawn(comspec, ['/d', '/s', '/c', fullCommandLine], {
            cwd: options.cwd,
            env: options.env ? { ...process.env, ...options.env } : process.env,
            windowsHide: true,
            windowsVerbatimArguments: true
          });
        } else {
          proc = child_process.spawn(command, args, {
            cwd: options.cwd,
            env: options.env ? { ...process.env, ...options.env } : process.env,
            windowsHide: true,
            shell: options.shell ?? false
          });
        }
      } catch (err: unknown) {
        settle({
          stdout: '',
          stderr: err instanceof Error ? err.message : String(err),
          exitCode: -1
        });
        return;
      }

      timer = setTimeout(() => {
        try {
          proc.kill();
        } catch {
          // Process may already be dead
        }
        settle({
          stdout,
          stderr: stderr ? `${stderr}\nProcess timed out after ${timeout}ms` : `Process timed out after ${timeout}ms`,
          exitCode: -1
        });
      }, timeout);

      if (proc.stdout) {
        proc.stdout.on('data', (data) => {
          const text = data.toString();
          stdout += text;
          if (options.onStdout) options.onStdout(text);
        });
      }

      if (proc.stderr) {
        proc.stderr.on('data', (data) => {
          const text = data.toString();
          stderr += text;
          if (options.onStderr) options.onStderr(text);
        });
      }

      proc.on('error', (err) => {
        settle({
          stdout,
          stderr: err.message,
          exitCode: -1
        });
      });

      proc.on('close', (code) => {
        settle({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code ?? 0
        });
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

