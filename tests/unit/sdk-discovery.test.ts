import { describe, it, expect } from 'vitest';
import { SdkDiscovery } from '../../src/core/sdk/sdk-discovery';

describe('SdkDiscovery', () => {
  it('should parse ADB versions from standard CLI output strings', () => {
    const rawOutput = 'Android Debug Bridge version 1.0.41\nVersion 35.0.1-11580240\nInstalled as D:\\Android_Tools\\sdk\\platform-tools\\adb.exe';
    // Access private static parser via any cast for testing
    const parsed = (SdkDiscovery as any).parseAdbVersion(rawOutput);
    expect(parsed).toBe('35.0.1');
  });

  it('should return undefined when parsing invalid ADB version output', () => {
    const invalidOutput = 'Unknown command line argument';
    const parsed = (SdkDiscovery as any).parseAdbVersion(invalidOutput);
    expect(parsed).toBeUndefined();
  });

  it('should scan environment and return a well-formed SystemHealthReport', async () => {
    const report = await SdkDiscovery.scanEnvironment('C:\\NonExistent_Test_Root_XYZ');

    expect(report).toBeDefined();
    expect(report.overallStatus).toBeDefined();
    expect(Array.isArray(report.components)).toBe(true);
    expect(report.components.length).toBe(5);
    expect(Array.isArray(report.issues)).toBe(true);
    expect(report.lastChecked).toBeDefined();
  });
});

