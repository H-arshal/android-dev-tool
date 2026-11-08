import { useState, useEffect, useCallback, useRef } from 'react';
import { BridgeMessage, SystemHealthReport, SettingsConfig, InstallProgress } from '../../shared/types';
import { MessageTypes, createMessage } from '../../shared/messages';
import { DEFAULT_SETTINGS } from '../../shared/constants';

// Declare VS Code API acquisition
declare function acquireVsCodeApi(): {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

// Fallback mock for browser preview outside of VS Code
const mockVsCodeApi = {
  postMessage: (msg: unknown) => {
    console.log('[Mock VS Code API] postMessage:', msg);
  },
  getState: () => ({}),
  setState: () => {}
};

let vsCodeApiInstance: ReturnType<typeof acquireVsCodeApi> | null = null;
function getVsCodeApi() {
  if (!vsCodeApiInstance) {
    try {
      vsCodeApiInstance = acquireVsCodeApi();
    } catch {
      vsCodeApiInstance = mockVsCodeApi as unknown as ReturnType<typeof acquireVsCodeApi>;
    }
  }
  return vsCodeApiInstance;
}

export function useExtensionBridge() {
  const [healthReport, setHealthReport] = useState<SystemHealthReport | null>(null);
  const [settings, setSettings] = useState<SettingsConfig>(DEFAULT_SETTINGS);
  const [installProgress, setInstallProgress] = useState<InstallProgress | null>(null);
  const [selectedDirectory, setSelectedDirectory] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Response callback resolvers for request-response RPC
  const pendingRequests = useRef<Map<string, (payload: unknown) => void>>(new Map());

  const postMessage = useCallback((type: string, payload?: unknown): Promise<unknown> => {
    const api = getVsCodeApi();
    const id = `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const msg = createMessage(type, payload, id);

    return new Promise((resolve) => {
      pendingRequests.current.set(id, resolve);
      api.postMessage(msg);
    });
  }, []);

  useEffect(() => {
    const handleWindowMessage = (event: MessageEvent) => {
      const message = event.data as BridgeMessage;
      if (!message || !message.type) return;

      const { id, type, payload } = message;

      // Correlate with pending request promise if ID matches
      if (id && pendingRequests.current.has(id)) {
        const resolver = pendingRequests.current.get(id);
        if (resolver) {
          resolver(payload);
          pendingRequests.current.delete(id);
        }
      }

      // Handle broadcast events
      switch (type) {
        case MessageTypes.HEALTH_REPORT:
          setHealthReport(payload as SystemHealthReport);
          setIsLoading(false);
          break;

        case MessageTypes.SETTINGS_DATA:
          setSettings(payload as SettingsConfig);
          break;

        case MessageTypes.DIRECTORY_SELECTED:
          setSelectedDirectory((payload as { selectedPath: string | null }).selectedPath);
          break;

        case MessageTypes.INSTALL_PROGRESS_EVENT:
          setInstallProgress(payload as InstallProgress);
          break;

        default:
          break;
      }
    };

    window.addEventListener('message', handleWindowMessage);

    // Announce UI readiness to Extension Host
    postMessage(MessageTypes.UI_READY);

    return () => {
      window.removeEventListener('message', handleWindowMessage);
    };
  }, [postMessage]);

  const refreshHealthReport = useCallback(() => {
    setIsLoading(true);
    postMessage(MessageTypes.GET_HEALTH_REPORT);
  }, [postMessage]);

  const saveSettings = useCallback((newSettings: SettingsConfig) => {
    setSettings(newSettings);
    postMessage(MessageTypes.SAVE_SETTINGS, newSettings);
  }, [postMessage]);

  const openDirectoryPicker = useCallback(() => {
    postMessage(MessageTypes.SELECT_DIRECTORY);
  }, [postMessage]);

  const runAutoRepair = useCallback((issueId: string) => {
    postMessage(MessageTypes.RUN_AUTO_REPAIR, { issueId });
  }, [postMessage]);

  return {
    healthReport,
    settings,
    installProgress,
    selectedDirectory,
    isLoading,
    postMessage,
    refreshHealthReport,
    saveSettings,
    openDirectoryPicker,
    runAutoRepair
  };
}

