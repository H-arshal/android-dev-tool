import { describe, it, expect } from 'vitest';
import { createMessage, createErrorMessage, MessageTypes } from '../../src/shared/messages';
import { DEFAULT_SETTINGS } from '../../src/shared/constants';

describe('Shared Messaging & Constants', () => {
  it('should create a valid bridge message', () => {
    const msg = createMessage(MessageTypes.GET_HEALTH_REPORT, { test: true }, 'req-123');
    expect(msg.id).toBe('req-123');
    expect(msg.type).toBe('GET_HEALTH_REPORT');
    expect(msg.payload).toEqual({ test: true });
    expect(msg.error).toBeUndefined();
  });

  it('should create a valid bridge error message', () => {
    const errorMsg = createErrorMessage(MessageTypes.INSTALL_FAILED, 'ERR_DISK_FULL', 'Insufficient disk space', 'req-456');
    expect(errorMsg.id).toBe('req-456');
    expect(errorMsg.type).toBe('INSTALL_FAILED');
    expect(errorMsg.error).toBeDefined();
    expect(errorMsg.error?.code).toBe('ERR_DISK_FULL');
    expect(errorMsg.error?.message).toBe('Insufficient disk space');
  });

  it('should have sensible default settings', () => {
    expect(DEFAULT_SETTINGS.sdk.installationProfile).toBe('physical-device');
    expect(DEFAULT_SETTINGS.environment.configureAndroidHome).toBe(true);
    expect(DEFAULT_SETTINGS.environment.configurePath).toBe(true);
  });
});

