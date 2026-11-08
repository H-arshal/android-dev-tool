import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { Readable } from 'stream';
import { Downloader } from '../../src/core/installer/downloader';

describe('Downloader', () => {
  let tempDestFile: string;
  const testPayload = 'Antigravity Android Dev Tools Test Payload Content';
  const expectedHash = crypto.createHash('sha256').update(testPayload).digest('hex');

  beforeEach(() => {
    tempDestFile = path.join(os.tmpdir(), `dl_test_${Date.now()}.txt`);
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempDestFile)) {
        fs.unlinkSync(tempDestFile);
      }
    } catch {}
  });

  it('should stream download a file, verify SHA-256 hash, and track progress', async () => {
    let progressSeen = false;

    const mockClient = {
      get: (_url: string, callback: (res: any) => void) => {
        const mockStream = new Readable({
          read() {
            this.push(Buffer.from(testPayload));
            this.push(null);
          }
        }) as any;

        mockStream.statusCode = 200;
        mockStream.headers = {
          'content-length': String(Buffer.byteLength(testPayload))
        };

        setTimeout(() => {
          callback(mockStream);
        }, 5);

        return {
          on: vi.fn(),
          setTimeout: vi.fn(),
          destroy: vi.fn()
        };
      }
    };

    const result = await Downloader.downloadFile('https://dl.google.com/testfile', tempDestFile, {
      expectedSha256: expectedHash,
      requestClient: mockClient,
      onProgress: (p) => {
        progressSeen = true;
        expect(p.downloadedBytes).toBeGreaterThan(0);
      }
    });

    expect(result.verified).toBe(true);
    expect(result.sha256).toBe(expectedHash);
    expect(fs.existsSync(tempDestFile)).toBe(true);
    expect(fs.readFileSync(tempDestFile, 'utf-8')).toBe(testPayload);
    expect(progressSeen).toBe(true);
  });
});
