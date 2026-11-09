import { describe, it, expect } from 'vitest';
import { JdkManager } from '../../src/core/jdk/jdk-manager';

describe('JdkManager', () => {
  it('should reject invalid manual paths that do not exist', async () => {
    await expect(
      JdkManager.setJdkConfiguration('manual', null, 'C:\\NonExistent_Invalid_Path_12345')
    ).rejects.toThrow('The specified custom JDK path does not exist');
  });

  it('should reject managed mode if no root directory is provided', async () => {
    await expect(
      JdkManager.setJdkConfiguration('managed', null)
    ).rejects.toThrow('A valid root directory is required');
  });

  it('should return an array when discovering available JDKs', async () => {
    const jdks = await JdkManager.getAvailableJdks();
    expect(Array.isArray(jdks)).toBe(true);
    for (const jdk of jdks) {
      expect(jdk.path).toBeDefined();
      expect(jdk.version).toBeDefined();
      expect(typeof jdk.majorVersion).toBe('number');
      expect(typeof jdk.isCompatibleWithAgp8).toBe('boolean');
    }
  });
});

