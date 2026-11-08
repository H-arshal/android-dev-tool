import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import * as crypto from 'crypto';

export interface DownloadProgress {
  downloadedBytes: number;
  totalBytes: number;
  percentage?: number;
}

export interface DownloadResult {
  destPath: string;
  sha256: string;
  verified: boolean;
}

export interface DownloadOptions {
  onProgress?: (progress: DownloadProgress) => void;
  expectedSha256?: string;
  timeout?: number;
  requestClient?: { get: (url: string, callback: (res: any) => void) => any };
}

export class Downloader {
  /**
   * Downloads a remote file over HTTP/HTTPS with streaming progress and on-the-fly SHA-256 calculation.
   */
  public static async downloadFile(
    url: string,
    destPath: string,
    options: DownloadOptions = {}
  ): Promise<DownloadResult> {
    const parentDir = path.dirname(destPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const tempPath = `${destPath}.download`;
    if (fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch {
        // Ignore unlink error
      }
    }

    return new Promise((resolve, reject) => {
      const fileStream = fs.createWriteStream(tempPath);
      const hash = crypto.createHash('sha256');
      let downloadedBytes = 0;
      let totalBytes = 0;

      const requestClient = options.requestClient || (url.startsWith('https:') ? https : http);

      const makeRequest = (targetUrl: string, redirectCount = 0) => {
        if (redirectCount > 5) {
          reject(new Error('Too many HTTP redirects during download.'));
          return;
        }

        const req = requestClient.get(targetUrl, (res) => {
          // Handle HTTP redirects (301, 302, 307, 308)
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            const redirectUrl = res.headers.location;
            res.resume(); // Discard previous stream
            makeRequest(redirectUrl, redirectCount + 1);
            return;
          }

          if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
            reject(new Error(`Download failed with HTTP status ${res.statusCode}: ${res.statusMessage}`));
            return;
          }

          const contentLengthHeader = res.headers['content-length'];
          totalBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;

          res.on('data', (chunk: Buffer) => {
            downloadedBytes += chunk.length;
            hash.update(chunk);

            if (options.onProgress) {
              const percentage = totalBytes > 0
                ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
                : undefined;

              options.onProgress({
                downloadedBytes,
                totalBytes,
                percentage
              });
            }
          });

          res.pipe(fileStream);

          fileStream.on('finish', () => {
            fileStream.close(() => {
              const actualSha256 = hash.digest('hex');
              const verified = options.expectedSha256
                ? actualSha256.toLowerCase() === options.expectedSha256.toLowerCase()
                : true;

              try {
                if (fs.existsSync(destPath)) {
                  fs.unlinkSync(destPath);
                }
                fs.renameSync(tempPath, destPath);
                resolve({
                  destPath,
                  sha256: actualSha256,
                  verified
                });
              } catch (err) {
                reject(err);
              }
            });
          });
        });

        req.on('error', (err) => {
          fileStream.close();
          try {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
          } catch {}
          reject(err);
        });

        if (options.timeout) {
          req.setTimeout(options.timeout, () => {
            req.destroy();
            reject(new Error(`Download timed out after ${options.timeout}ms`));
          });
        }
      };

      makeRequest(url);
    });
  }
}
