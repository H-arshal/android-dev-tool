import { describe, it, expect } from 'vitest';
import { WindowsEnvironment } from '../../src/core/environment/windows-environment';

describe('WindowsEnvironment', () => {
  it('should parse delimited PATH strings correctly', () => {
    const rawPath = 'C:\\Windows\\System32;C:\\Program Files\\Java\\bin;;D:\\Android_Tools\\platform-tools;';
    const parsed = WindowsEnvironment.parsePathEntries(rawPath);

    expect(parsed).toEqual([
      'C:\\Windows\\System32',
      'C:\\Program Files\\Java\\bin',
      'D:\\Android_Tools\\platform-tools'
    ]);
  });

  it('should return an empty array for empty or whitespace-only PATH strings', () => {
    expect(WindowsEnvironment.parsePathEntries('')).toEqual([]);
    expect(WindowsEnvironment.parsePathEntries('   ')).toEqual([]);
    expect(WindowsEnvironment.parsePathEntries(';;;')).toEqual([]);
  });

  it('should normalize paths consistently for Windows comparisons', () => {
    const p1 = WindowsEnvironment.normalizePath('C:\\Android_Tools\\sdk\\platform-tools\\');
    const p2 = WindowsEnvironment.normalizePath('c:/android_tools/sdk/platform-tools');

    expect(p1).toBe(p2);
    expect(p1).toBe('c:\\android_tools\\sdk\\platform-tools');
  });

  it('should accurately detect whether a directory exists in a PATH list', () => {
    const pathList = [
      'C:\\Windows\\System32',
      'C:\\Android_Tools\\sdk\\platform-tools',
      'C:\\Android_Tools\\sdk\\cmdline-tools\\latest\\bin'
    ];

    expect(
      WindowsEnvironment.isDirectoryInPathList('c:/Android_Tools/sdk/platform-tools/', pathList)
    ).toBe(true);

    expect(
      WindowsEnvironment.isDirectoryInPathList('C:\\Android_Tools\\sdk\\emulator', pathList)
    ).toBe(false);
  });

  it('should expand environment variable markers', () => {
    const original = process.env['USERPROFILE'];
    process.env['USERPROFILE'] = 'C:\\Users\\TestUser';

    const expanded = WindowsEnvironment.expandEnvironmentMarkers('%USERPROFILE%\\Android\\Sdk');
    expect(expanded).toBe('C:\\Users\\TestUser\\Android\\Sdk');

    if (original !== undefined) {
      process.env['USERPROFILE'] = original;
    }
  });
});
