import { describe, it, expect } from 'vitest';
import { PathManager } from '../../src/core/environment/path-manager';

describe('PathManager', () => {
  it('should append only missing directories to the PATH', () => {
    const current = 'C:\\Windows\\System32;C:\\Program Files\\Git\\cmd';
    const toAdd = [
      'C:\\Android_Tools\\sdk\\platform-tools',
      'C:\\Windows\\System32', // Already present
      'C:\\Android_Tools\\sdk\\cmdline-tools\\latest\\bin'
    ];

    const result = PathManager.appendEntriesIfMissing(current, toAdd);

    expect(result.changed).toBe(true);
    expect(result.addedEntries).toEqual([
      'C:\\Android_Tools\\sdk\\platform-tools',
      'C:\\Android_Tools\\sdk\\cmdline-tools\\latest\\bin'
    ]);
    expect(result.updatedPath).toBe(
      'C:\\Windows\\System32;C:\\Program Files\\Git\\cmd;C:\\Android_Tools\\sdk\\platform-tools;C:\\Android_Tools\\sdk\\cmdline-tools\\latest\\bin'
    );
  });

  it('should return changed=false if all entries are already in PATH', () => {
    const current = 'C:\\Android_Tools\\sdk\\platform-tools;C:\\Android_Tools\\sdk\\cmdline-tools\\latest\\bin';
    const toAdd = [
      'c:/android_tools/sdk/platform-tools/',
      'C:\\Android_Tools\\sdk\\cmdline-tools\\latest\\bin\\'
    ];

    const result = PathManager.appendEntriesIfMissing(current, toAdd);
    expect(result.changed).toBe(false);
    expect(result.addedEntries.length).toBe(0);
    expect(result.updatedPath).toBe(current);
  });

  it('should throw an error if the resulting PATH exceeds the 2048-character safety threshold', () => {
    const current = 'C:\\ExistingPath';
    // Generate an excessively long entry (> 2048 characters)
    const giantEntry = 'C:\\' + 'A'.repeat(2100);

    expect(() => {
      PathManager.appendEntriesIfMissing(current, [giantEntry]);
    }).toThrow('exceeds safe limit');
  });

  it('should synchronize process.env.PATH in the active Node process', () => {
    const originalPath = process.env['PATH'] || '';
    const uniqueTestEntry = 'C:\\Android_Dev_Tools_Test_Unique_123';

    try {
      PathManager.syncProcessPath([uniqueTestEntry]);
      expect(process.env['PATH']).toContain(uniqueTestEntry);
    } finally {
      process.env['PATH'] = originalPath;
    }
  });
});

