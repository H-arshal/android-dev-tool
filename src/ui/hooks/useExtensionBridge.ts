import { useState, useEffect, useCallback, useRef } from 'react';
import {
  BridgeMessage,
  SystemHealthReport,
  SettingsConfig,
  InstallProgress,
  JdkInfo,
  DeviceInfo,
  DeviceDetails,
  InstallApkOptions,
  InstallApkResult,
  AvdInfo,
  LaunchAvdOptions,
  CreateAvdPayload,
  SystemImageInfo,
  PackageInfo
} from '../../shared/types';
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
  const [availableJdks, setAvailableJdks] = useState<JdkInfo[]>([]);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [deviceDetails, setDeviceDetails] = useState<Record<string, DeviceDetails>>({});
  const [isRefreshingDevices, setIsRefreshingDevices] = useState<boolean>(false);
  const [avds, setAvds] = useState<AvdInfo[]>([]);
  const [systemImages, setSystemImages] = useState<SystemImageInfo[]>([]);
  const [packages, setPackages] = useState<PackageInfo[]>([]);
  const [isRefreshingPackages, setIsRefreshingPackages] = useState<boolean>(false);
  const [isRefreshingAvds, setIsRefreshingAvds] = useState<boolean>(false);
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

      // Ignore Antigravity IDE / Jetski internal RPC messages
      if ((message as any).channel === 'agy-ext-antigravity-api' || message.type === 'postmessage-rpc') {
        return;
      }

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

        case MessageTypes.JDK_LIST_DATA:
          setAvailableJdks(payload as JdkInfo[]);
          break;

        case MessageTypes.DEVICES_LIST_DATA:
          setDevices(payload as DeviceInfo[]);
          setIsRefreshingDevices(false);
          break;

        case MessageTypes.DEVICE_DETAILS_DATA: {
          const detail = payload as DeviceDetails;
          if (detail && detail.serial) {
            setDeviceDetails(prev => ({ ...prev, [detail.serial]: detail }));
          }
          break;
        }

        case MessageTypes.AVDS_LIST_DATA:
          setAvds(payload as AvdInfo[] || []);
          setIsRefreshingAvds(false);
          break;

        case MessageTypes.SYSTEM_IMAGES_DATA:
          setSystemImages(payload as SystemImageInfo[] || []);
          break;

        case MessageTypes.PACKAGE_CATALOG:
          setPackages(payload as PackageInfo[] || []);
          setIsRefreshingPackages(false);
          break;

        case MessageTypes.INSTALL_COMPLETED:
          setInstallProgress({
            phase: 'completed',
            currentTask: 'Android development tools installed successfully',
            percentage: 100,
            message: 'All Android SDK components are configured and ready.'
          });
          break;

        default:
          break;
      }
    };

    window.addEventListener('message', handleWindowMessage);

    // Announce UI readiness to Extension Host
    postMessage(MessageTypes.UI_READY);
    postMessage(MessageTypes.GET_JDK_LIST);
    postMessage(MessageTypes.GET_AVDS);
    postMessage(MessageTypes.GET_SYSTEM_IMAGES);
    postMessage(MessageTypes.GET_DEVICES);
    postMessage(MessageTypes.GET_PACKAGES);

    return () => {
      window.removeEventListener('message', handleWindowMessage);
    };
  }, [postMessage]);

  const refreshHealthReport = useCallback(() => {
    setIsLoading(true);
    postMessage(MessageTypes.GET_HEALTH_REPORT);
  }, [postMessage]);

  const fetchJdks = useCallback(() => {
    postMessage(MessageTypes.GET_JDK_LIST);
  }, [postMessage]);

  const setJdkConfig = useCallback((mode: 'detect' | 'managed' | 'manual', customPath?: string) => {
    return postMessage(MessageTypes.SET_JDK_CONFIG, { mode, customPath });
  }, [postMessage]);

  const installManagedJdk = useCallback(() => {
    return postMessage(MessageTypes.INSTALL_MANAGED_JDK);
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

  const fetchDevices = useCallback(() => {
    setIsRefreshingDevices(true);
    return postMessage(MessageTypes.GET_DEVICES);
  }, [postMessage]);

  const fetchDeviceDetails = useCallback((serial: string) => {
    return postMessage(MessageTypes.GET_DEVICE_DETAILS, { serial });
  }, [postMessage]);

  const selectApkFile = useCallback(async (): Promise<string | null> => {
    const res = await postMessage(MessageTypes.SELECT_APK_FILE) as { filePath?: string };
    return res?.filePath || null;
  }, [postMessage]);

  const installApk = useCallback((serial: string, apkPath: string, options?: InstallApkOptions): Promise<InstallApkResult> => {
    return postMessage(MessageTypes.INSTALL_APK, { serial, apkPath, options }) as Promise<InstallApkResult>;
  }, [postMessage]);

  const rebootDevice = useCallback((serial: string, mode?: 'system' | 'bootloader' | 'recovery') => {
    return postMessage(MessageTypes.REBOOT_DEVICE, { serial, mode });
  }, [postMessage]);

  const takeScreenshot = useCallback((serial: string) => {
    return postMessage(MessageTypes.TAKE_SCREENSHOT, { serial });
  }, [postMessage]);

  const openDeviceShell = useCallback((serial: string) => {
    return postMessage(MessageTypes.OPEN_DEVICE_SHELL, { serial });
  }, [postMessage]);

  const connectWireless = useCallback((ip: string, port?: number) => {
    return postMessage(MessageTypes.CONNECT_WIRELESS, { ip, port });
  }, [postMessage]);

  const enableTcpip = useCallback((serial: string, port?: number) => {
    return postMessage(MessageTypes.ENABLE_TCPIP, { serial, port });
  }, [postMessage]);

  const fetchAvds = useCallback(() => {
    setIsRefreshingAvds(true);
    return postMessage(MessageTypes.GET_AVDS);
  }, [postMessage]);

  const launchAvd = useCallback((name: string, options?: LaunchAvdOptions) => {
    return postMessage(MessageTypes.LAUNCH_AVD, { name, options });
  }, [postMessage]);

  const stopAvd = useCallback((name: string, serial?: string) => {
    return postMessage(MessageTypes.STOP_AVD, { name, serial });
  }, [postMessage]);

  const deleteAvd = useCallback((name: string) => {
    return postMessage(MessageTypes.DELETE_AVD, { name });
  }, [postMessage]);

  const createAvd = useCallback((payload: CreateAvdPayload) => {
    return postMessage(MessageTypes.CREATE_AVD, payload);
  }, [postMessage]);

  const fetchSystemImages = useCallback(() => {
    return postMessage(MessageTypes.GET_SYSTEM_IMAGES);
  }, [postMessage]);

  const fetchPackages = useCallback(() => {
    setIsRefreshingPackages(true);
    return postMessage(MessageTypes.GET_PACKAGES);
  }, [postMessage]);

  const installPackages = useCallback((packages: string[]) => {
    return postMessage(MessageTypes.INSTALL_PACKAGES, { packages });
  }, [postMessage]);

  return {
    healthReport,
    settings,
    installProgress,
    selectedDirectory,
    availableJdks,
    devices,
    deviceDetails,
    isRefreshingDevices,
    avds,
    systemImages,
    packages,
    isRefreshingPackages,
    isRefreshingAvds,
    isLoading,
    postMessage,
    refreshHealthReport,
    fetchJdks,
    fetchDevices,
    fetchDeviceDetails,
    selectApkFile,
    installApk,
    rebootDevice,
    takeScreenshot,
    openDeviceShell,
    connectWireless,
    enableTcpip,
    fetchAvds,
    launchAvd,
    stopAvd,
    deleteAvd,
    createAvd,
    fetchSystemImages,
    fetchPackages,
    installPackages,
    setJdkConfig,
    installManagedJdk,
    saveSettings,
    openDirectoryPicker,
    runAutoRepair
  };
}

