import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { EnvironmentManager } from '../../src/core/environment/environment-manager';

describe('EnvironmentManager', () => {
  it('should format and set in-memory process.env.ANDROID_HOME correctly', async () => {
    const original = process.env['ANDROID_HOME'];
    const testPath = 'C:\\Android_Tools\\test_sdk\\';

    try {
      // Mock internal setUserVariable to avoid OS registry mutation during tests
      const originalSetUserVar = (EnvironmentManager as any).setUserVariable;
      (EnvironmentManager as any).setUserVariable = async () => {};

      const result = await EnvironmentManager.configureAndroidHome(testPath, true);

      expect(result.androidHome).toBe(path.normalize('C:\\Android_Tools\\test_sdk'));
      expect(result.sdkRootReconciled).toBe(true);
      expect(process.env['ANDROID_HOME']).toBe(path.normalize('C:\\Android_Tools\\test_sdk'));
      expect(process.env['ANDROID_SDK_ROOT']).toBe(path.normalize('C:\\Android_Tools\\test_sdk'));

      (EnvironmentManager as any).setUserVariable = originalSetUserVar;
    } finally {
      if (original) {
        process.env['ANDROID_HOME'] = original;
      } else {
        delete process.env['ANDROID_HOME'];
      }
    }
  });
});

