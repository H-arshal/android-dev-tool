import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { JdkDetection } from '../../src/core/jdk/jdk-detection';

describe('JdkDetection', () => {
  it('should parse Eclipse Temurin OpenJDK 17 version strings correctly', () => {
    const output = `
openjdk version "17.0.12" 2024-07-16
OpenJDK Runtime Environment Temurin-17.0.12+7 (build 17.0.12+7)
OpenJDK 64-Bit Server VM Temurin-17.0.12+7 (build 17.0.12+7, mixed mode, sharing)
`;
    const parsed = JdkDetection.parseJavaVersionOutput(output);
    expect(parsed.version).toBe('17.0.12');
    expect(parsed.majorVersion).toBe(17);
    expect(parsed.vendor).toBe('Eclipse Temurin');
  });

  it('should parse Oracle Java 21 LTS version strings correctly', () => {
    const output = `
java version "21.0.1" 2023-10-17 LTS
Java(TM) SE Runtime Environment (build 21.0.1+12-LTS-29)
Java HotSpot(TM) 64-Bit Server VM (build 21.0.1+12-LTS-29, mixed mode, sharing)
`;
    const parsed = JdkDetection.parseJavaVersionOutput(output);
    expect(parsed.version).toBe('21.0.1');
    expect(parsed.majorVersion).toBe(21);
    expect(parsed.vendor).toBe('Oracle');
  });

  it('should parse legacy Java 1.8.x version format into major version 8', () => {
    const output = `
java version "1.8.0_351"
Java(TM) SE Runtime Environment (build 1.8.0_351-b10)
Java HotSpot(TM) 64-Bit Server VM (build 25.351-b10, mixed mode)
`;
    const parsed = JdkDetection.parseJavaVersionOutput(output);
    expect(parsed.version).toBe('1.8.0_351');
    expect(parsed.majorVersion).toBe(8);
  });

  it('should parse Microsoft OpenJDK version strings', () => {
    const output = `
openjdk version "17.0.8" 2023-07-18 LTS
OpenJDK Runtime Environment Microsoft-8032773 (build 17.0.8+7-LTS)
OpenJDK 64-Bit Server VM Microsoft-8032773 (build 17.0.8+7-LTS, mixed mode, sharing)
`;
    const parsed = JdkDetection.parseJavaVersionOutput(output);
    expect(parsed.version).toBe('17.0.8');
    expect(parsed.majorVersion).toBe(17);
    expect(parsed.vendor).toBe('Microsoft');
  });

  it('should accurately test whether a folder has a valid JDK layout', () => {
    const tempDir = path.join(os.tmpdir(), `jdk_test_layout_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      expect(JdkDetection.isValidJdkDirectory(tempDir)).toBe(false);

      const binDir = path.join(tempDir, 'bin');
      fs.mkdirSync(binDir, { recursive: true });
      fs.writeFileSync(path.join(binDir, 'java.exe'), 'mock');

      expect(JdkDetection.isValidJdkDirectory(tempDir)).toBe(true);
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
  });
});

