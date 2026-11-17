import React, { useState, useEffect } from 'react';
import {
  DeviceInfo,
  DeviceDetails,
  InstallApkOptions,
  InstallApkResult,
  AvdInfo,
  LaunchAvdOptions,
  CreateAvdPayload,
  SystemImageInfo
} from '../../shared/types';
import {
  Smartphone,
  Wifi,
  Cpu,
  RefreshCw,
  Battery,
  BatteryCharging,
  Maximize,
  HardDrive,
  Info,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Camera,
  Terminal,
  RotateCw,
  Package,
  FolderOpen,
  ChevronDown,
  XCircle,
  FileCheck,
  Play,
  Square,
  Trash2,
  PlusCircle,
  Monitor,
  Laptop,
  PlayCircle,
  ShieldCheck,
  Box,
  DownloadCloud,
  ArrowRight
} from 'lucide-react';

interface DeviceManagerProps {
  devices: DeviceInfo[];
  deviceDetails: Record<string, DeviceDetails>;
  isRefreshing: boolean;
  onRefreshDevices: () => void;
  onFetchDetails: (serial: string) => void;
  onSelectApkFile: () => Promise<string | null>;
  onInstallApk: (serial: string, apkPath: string, options?: InstallApkOptions) => Promise<InstallApkResult>;
  onReboot: (serial: string, mode?: 'system' | 'bootloader' | 'recovery') => Promise<unknown>;
  onTakeScreenshot: (serial: string) => Promise<unknown>;
  onOpenShell: (serial: string) => Promise<unknown>;
  onConnectWireless: (ip: string, port?: number) => Promise<unknown>;
  onEnableTcpip: (serial: string, port?: number) => Promise<unknown>;
  avds?: AvdInfo[];
  systemImages?: SystemImageInfo[];
  isRefreshingAvds?: boolean;
  onRefreshAvds?: () => void;
  onLaunchAvd?: (name: string, options?: LaunchAvdOptions) => Promise<unknown>;
  onStopAvd?: (name: string, serial?: string) => Promise<unknown>;
  onDeleteAvd?: (name: string) => Promise<unknown>;
  onCreateAvd?: (payload: CreateAvdPayload) => Promise<unknown>;
  onFetchSystemImages?: () => void;
  onInstallPackages?: (packages: string[]) => Promise<unknown>;
}

export const DeviceManager: React.FC<DeviceManagerProps> = ({
  devices,
  deviceDetails,
  isRefreshing,
  onRefreshDevices,
  onFetchDetails,
  onSelectApkFile,
  onInstallApk,
  onReboot,
  onTakeScreenshot,
  onOpenShell,
  onConnectWireless,
  onEnableTcpip,
  avds = [],
  systemImages = [],
  isRefreshingAvds = false,
  onRefreshAvds = () => {},
  onLaunchAvd = async () => {},
  onStopAvd = async () => {},
  onDeleteAvd = async () => {},
  onCreateAvd = async () => {},
  onFetchSystemImages = () => {},
  onInstallPackages
}) => {
  const [subTab, setSubTab] = useState<'connected' | 'avds'>('connected');
  const [selectedSerial, setSelectedSerial] = useState<string | null>(null);

  // Quick Action States
  const [isCapturingScreenshot, setIsCapturingScreenshot] = useState(false);
  const [screenshotSuccess, setScreenshotSuccess] = useState(false);
  const [showRebootMenu, setShowRebootMenu] = useState(false);
  const [showWirelessModal, setShowWirelessModal] = useState(false);
  const [wirelessIp, setWirelessIp] = useState('');
  const [wirelessPort, setWirelessPort] = useState('5555');
  const [isConnectingWireless, setIsConnectingWireless] = useState(false);

  // APK Sideloading State
  const [selectedApkPath, setSelectedApkPath] = useState<string>('');
  const [apkOptions, setApkOptions] = useState<InstallApkOptions>({
    reinstall: true,
    grantPermissions: true,
    allowDowngrade: false,
    allowTestOnly: false
  });
  const [isInstallingApk, setIsInstallingApk] = useState(false);
  const [apkResult, setApkResult] = useState<InstallApkResult | null>(null);

  // AVD Management State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newAvdName, setNewAvdName] = useState('Pixel_7_API_34');
  const [selectedSystemImage, setSelectedSystemImage] = useState('system-images;android-34;google_apis;x86_64');
  const [selectedProfile, setSelectedProfile] = useState('pixel_7');
  const [isCreatingAvd, setIsCreatingAvd] = useState(false);
  const [isDownloadingImage, setIsDownloadingImage] = useState(false);
  const [downloadProgressMsg, setDownloadProgressMsg] = useState('');
  const [launchingAvdName, setLaunchingAvdName] = useState<string | null>(null);
  const [stoppingAvdName, setStoppingAvdName] = useState<string | null>(null);

  // Auto-clear launching indicator once AVD is reported running or booting
  useEffect(() => {
    if (launchingAvdName) {
      const match = avds.find(a => a.name === launchingAvdName);
      if (match && (match.isRunning || match.status === 'running' || match.status === 'booting')) {
        setLaunchingAvdName(null);
      }
    }
  }, [avds, launchingAvdName]);

  // Safety timeout for launching state (25 seconds)
  useEffect(() => {
    if (launchingAvdName) {
      const timer = setTimeout(() => {
        setLaunchingAvdName(null);
      }, 25000);
      return () => clearTimeout(timer);
    }
  }, [launchingAvdName]);

  // Auto-clear stopping indicator once AVD is reported stopped
  useEffect(() => {
    if (stoppingAvdName) {
      const match = avds.find(a => a.name === stoppingAvdName);
      if (!match || (!match.isRunning && match.status === 'stopped')) {
        setStoppingAvdName(null);
      }
    }
  }, [avds, stoppingAvdName]);

  // Safety timeout for stopping state (15 seconds)
  useEffect(() => {
    if (stoppingAvdName) {
      const timer = setTimeout(() => {
        setStoppingAvdName(null);
      }, 15000);
      return () => clearTimeout(timer);
    }
  }, [stoppingAvdName]);

  // Active polling when viewing Virtual Devices tab to keep status live
  useEffect(() => {
    if (subTab === 'avds') {
      onRefreshAvds();
      onRefreshDevices();

      const interval = setInterval(() => {
        onRefreshAvds();
        onRefreshDevices();
      }, 3000);

      return () => clearInterval(interval);
    }
  }, [subTab, onRefreshAvds, onRefreshDevices]);

  // When opening create modal, ensure smart defaults
  useEffect(() => {
    if (showCreateModal) {
      if (!newAvdName) setNewAvdName('Pixel_7_API_34');
      if (systemImages.length > 0) {
        setSelectedSystemImage(systemImages[0].id);
      } else {
        setSelectedSystemImage('system-images;android-34;google_apis;x86_64');
      }
    }
  }, [showCreateModal, systemImages]);

  // Auto-select first connected device if none selected
  useEffect(() => {
    if (devices.length > 0) {
      if (!selectedSerial || !devices.some(d => d.serial === selectedSerial)) {
        setSelectedSerial(devices[0].serial);
      }
    } else {
      setSelectedSerial(null);
    }
  }, [devices, selectedSerial]);

  // Fetch details when selected device changes
  useEffect(() => {
    if (selectedSerial) {
      onFetchDetails(selectedSerial);
      setApkResult(null);
    }
  }, [selectedSerial, onFetchDetails]);

  // Initial load
  useEffect(() => {
    onRefreshDevices();
    onRefreshAvds();
    onFetchSystemImages();
  }, [onRefreshDevices, onRefreshAvds, onFetchSystemImages]);

  // Select first available system image for create modal
  useEffect(() => {
    if (systemImages.length > 0 && !selectedSystemImage) {
      setSelectedSystemImage(systemImages[0].id);
    }
  }, [systemImages, selectedSystemImage]);

  const activeDevice = selectedSerial ? devices.find(d => d.serial === selectedSerial) : null;
  const activeDetails = selectedSerial ? deviceDetails[selectedSerial] : null;

  // Handlers for Connected Devices
  const handleTakeScreenshot = async () => {
    if (!selectedSerial) return;
    setIsCapturingScreenshot(true);
    setScreenshotSuccess(false);
    try {
      await onTakeScreenshot(selectedSerial);
      setScreenshotSuccess(true);
      setTimeout(() => setScreenshotSuccess(false), 3000);
    } finally {
      setIsCapturingScreenshot(false);
    }
  };

  const handleReboot = async (mode: 'system' | 'bootloader' | 'recovery') => {
    if (!selectedSerial) return;
    setShowRebootMenu(false);
    await onReboot(selectedSerial, mode);
  };

  const handleBrowseApk = async () => {
    const filePath = await onSelectApkFile();
    if (filePath) {
      setSelectedApkPath(filePath);
      setApkResult(null);
    }
  };

  const handleInstallApk = async () => {
    if (!selectedSerial || !selectedApkPath) return;
    setIsInstallingApk(true);
    setApkResult(null);
    try {
      const res = await onInstallApk(selectedSerial, selectedApkPath, apkOptions);
      setApkResult(res);
    } finally {
      setIsInstallingApk(false);
    }
  };

  const handleConnectWireless = async () => {
    if (!wirelessIp.trim()) return;
    setIsConnectingWireless(true);
    try {
      const port = parseInt(wirelessPort, 10) || 5555;
      await onConnectWireless(wirelessIp.trim(), port);
      setShowWirelessModal(false);
      setWirelessIp('');
    } finally {
      setIsConnectingWireless(false);
    }
  };

  const handleEnableTcpip = async () => {
    if (!selectedSerial) return;
    const port = parseInt(wirelessPort, 10) || 5555;
    await onEnableTcpip(selectedSerial, port);
  };

  // Handlers for AVDs
  const handleLaunchAvd = async (name: string, options?: LaunchAvdOptions) => {
    setLaunchingAvdName(name);
    try {
      await onLaunchAvd(name, options);
      // Trigger immediate refresh then let polling take over
      setTimeout(() => {
        onRefreshAvds();
        onRefreshDevices();
      }, 1500);
    } catch {
      setLaunchingAvdName(null);
    }
  };

  const handleStopAvd = async (name: string, serial?: string) => {
    setStoppingAvdName(name);
    try {
      await onStopAvd(name, serial);
    } catch {
      // error handled by extension notifications
    } finally {
      setTimeout(() => {
        setStoppingAvdName(null);
        onRefreshAvds();
        onRefreshDevices();
      }, 1000);
    }
  };

  const handleDeleteAvd = async (name: string) => {
    await onDeleteAvd(name);
  };

  const handleCreateAvd = async () => {
    if (!newAvdName.trim() || !selectedSystemImage) return;
    setIsCreatingAvd(true);
    try {
      await onCreateAvd({
        name: newAvdName.trim().replace(/\s+/g, '_'),
        packagePath: selectedSystemImage,
        deviceProfile: selectedProfile
      });
      setShowCreateModal(false);
      setNewAvdName('');
    } finally {
      setIsCreatingAvd(false);
    }
  };

  const handleDownloadRecommendedImage = async () => {
    setIsDownloadingImage(true);
    setDownloadProgressMsg('Downloading Android Emulator & System Image via sdkmanager...');
    try {
      if (onInstallPackages) {
        await onInstallPackages([
          'emulator',
          'system-images;android-34;google_apis;x86_64'
        ]);
        onFetchSystemImages();
        onRefreshAvds();
        setSelectedSystemImage('system-images;android-34;google_apis;x86_64');
      }
    } finally {
      setIsDownloadingImage(false);
      setDownloadProgressMsg('');
    }
  };

  return (
    <div className="p-4 space-y-4 max-w-5xl mx-auto">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-vscode-border/50 pb-3">
        <div>
          <div className="flex items-center space-x-2">
            <Smartphone className="w-5 h-5 text-emerald-400" />
            <h2 className="text-sm font-semibold tracking-wide">Device Manager</h2>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-vscode-badge-bg text-vscode-badge-fg">
              {devices.length} Connected • {avds.length} Virtual
            </span>
          </div>
          <p className="text-xs text-vscode-muted mt-0.5">
            Monitor, control, and sideload APKs onto physical hardware and Android Virtual Devices (AVDs).
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {subTab === 'connected' ? (
            <>
              <button
                onClick={() => setShowWirelessModal(!showWirelessModal)}
                className="px-2.5 py-1.5 rounded border border-vscode-border hover:bg-vscode-sidebar text-xs text-vscode-fg flex items-center space-x-1.5 transition-colors"
                title="Connect device over Wi-Fi"
              >
                <Wifi className="w-3.5 h-3.5 text-sky-400" />
                <span>Wi-Fi Pairing</span>
              </button>

              <button
                onClick={onRefreshDevices}
                disabled={isRefreshing}
                className="px-3 py-1.5 rounded bg-vscode-button-bg text-vscode-button-fg hover:bg-vscode-button-hover text-xs flex items-center space-x-1.5 transition-colors disabled:opacity-50"
                title="Refresh ADB devices"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>{isRefreshing ? 'Scanning...' : 'Refresh Devices'}</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  setShowCreateModal(true);
                  if (systemImages.length === 0) onFetchSystemImages();
                }}
                className="px-2.5 py-1.5 rounded border border-emerald-500/40 hover:bg-emerald-500/10 text-xs text-emerald-400 flex items-center space-x-1.5 transition-colors"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Create Virtual Device</span>
              </button>

              <button
                onClick={onRefreshAvds}
                disabled={isRefreshingAvds}
                className="px-3 py-1.5 rounded bg-vscode-button-bg text-vscode-button-fg hover:bg-vscode-button-hover text-xs flex items-center space-x-1.5 transition-colors disabled:opacity-50"
                title="Refresh AVD emulators"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingAvds ? 'animate-spin' : ''}`} />
                <span>{isRefreshingAvds ? 'Scanning...' : 'Refresh Emulators'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Sub-Tab Navigation Switcher */}
      <div className="flex space-x-1 p-1 bg-vscode-sidebar rounded border border-vscode-border/40 w-fit">
        <button
          onClick={() => setSubTab('connected')}
          className={`px-3 py-1.5 rounded text-xs font-medium flex items-center space-x-1.5 transition-all ${
            subTab === 'connected'
              ? 'bg-vscode-button-bg text-vscode-button-fg shadow-sm'
              : 'text-vscode-muted hover:text-vscode-fg'
          }`}
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>Connected Devices</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/20 font-mono">
            {devices.length}
          </span>
        </button>

        <button
          onClick={() => setSubTab('avds')}
          className={`px-3 py-1.5 rounded text-xs font-medium flex items-center space-x-1.5 transition-all ${
            subTab === 'avds'
              ? 'bg-vscode-button-bg text-vscode-button-fg shadow-sm'
              : 'text-vscode-muted hover:text-vscode-fg'
          }`}
        >
          <Laptop className="w-3.5 h-3.5" />
          <span>Virtual Devices (AVDs)</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/20 font-mono">
            {avds.length}
          </span>
        </button>
      </div>

      {/* VIEW 1: CONNECTED DEVICES */}
      {subTab === 'connected' && (
        <div className="space-y-4">
          {/* Wireless Connection Drawer/Modal */}
          {showWirelessModal && (
            <div className="p-4 rounded border border-sky-500/30 bg-sky-950/20 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-sky-400 flex items-center space-x-1.5">
                  <Wifi className="w-4 h-4" />
                  <span>Connect Device Over Wi-Fi (Wireless ADB)</span>
                </h3>
                <button
                  onClick={() => setShowWirelessModal(false)}
                  className="text-vscode-muted hover:text-vscode-fg text-xs"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="sm:col-span-2">
                  <input
                    type="text"
                    placeholder="Device IP (e.g. 192.168.1.105)"
                    value={wirelessIp}
                    onChange={(e) => setWirelessIp(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded border border-vscode-border bg-vscode-input-bg text-vscode-input-fg text-xs font-mono"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    placeholder="Port (default: 5555)"
                    value={wirelessPort}
                    onChange={(e) => setWirelessPort(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded border border-vscode-border bg-vscode-input-bg text-vscode-input-fg text-xs font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <p className="text-[11px] text-vscode-muted">
                  Tip: Ensure the device is connected to the same Wi-Fi network and has Wireless Debugging enabled.
                </p>
                <button
                  onClick={handleConnectWireless}
                  disabled={isConnectingWireless || !wirelessIp.trim()}
                  className="px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium flex items-center space-x-1.5 disabled:opacity-50"
                >
                  {isConnectingWireless ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Connecting...</span>
                    </>
                  ) : (
                    <>
                      <Wifi className="w-3.5 h-3.5" />
                      <span>Pair & Connect</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {devices.length === 0 ? (
            <div className="border border-dashed border-vscode-border rounded-lg p-8 text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-full bg-vscode-sidebar flex items-center justify-center text-vscode-muted">
                <Smartphone className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">No Android Devices Connected</h3>
                <p className="text-xs text-vscode-muted max-w-md mx-auto">
                  Connect an Android phone or tablet via USB with Developer Mode & USB Debugging enabled,
                  or start an Android Virtual Device (AVD).
                </p>
              </div>
              <div className="flex items-center justify-center space-x-2 pt-2">
                <button
                  onClick={() => setSubTab('avds')}
                  className="px-3 py-1.5 rounded bg-vscode-button-bg text-vscode-button-fg hover:bg-vscode-button-hover text-xs font-medium transition-colors"
                >
                  Go to Virtual Devices (AVDs)
                </button>
                <button
                  onClick={onRefreshDevices}
                  disabled={isRefreshing}
                  className="px-3 py-1.5 rounded border border-vscode-border hover:bg-vscode-sidebar text-xs text-vscode-fg transition-colors"
                >
                  Scan Again
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Left Column: Device Selection List */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-vscode-muted uppercase tracking-wider px-1">
                  Connected Targets ({devices.length})
                </h3>
                <div className="space-y-1.5">
                  {devices.map((device) => {
                    const isSelected = device.serial === selectedSerial;
                    const isWifi = device.connectionType === 'wifi';
                    const isEmulator = device.connectionType === 'emulator';

                    return (
                      <button
                        key={device.serial}
                        onClick={() => setSelectedSerial(device.serial)}
                        className={`w-full text-left p-3 rounded border transition-all ${
                          isSelected
                            ? 'border-emerald-500 bg-emerald-500/10'
                            : 'border-vscode-border hover:border-vscode-border/80 bg-vscode-sidebar hover:bg-vscode-sidebar/80'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center space-x-2 min-w-0">
                            {isWifi ? (
                              <Wifi className="w-4 h-4 text-sky-400 shrink-0" />
                            ) : isEmulator ? (
                              <Cpu className="w-4 h-4 text-purple-400 shrink-0" />
                            ) : (
                              <Smartphone className="w-4 h-4 text-emerald-400 shrink-0" />
                            )}
                            <div className="truncate">
                              <p className="text-xs font-medium truncate">
                                {device.model || (isEmulator ? 'Android Emulator' : 'Android Device')}
                              </p>
                              <p className="text-[11px] text-vscode-muted font-mono truncate">
                                {device.serial}
                              </p>
                            </div>
                          </div>

                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono shrink-0 ml-1 ${
                            device.state === 'device'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : device.state === 'unauthorized'
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-red-500/20 text-red-300'
                          }`}>
                            {device.state}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right Column: Active Device Details & Actions */}
              <div className="md:col-span-2 space-y-4">
                {activeDevice && (
                  <>
                    {/* Device Header Card with Quick Actions */}
                    <div className="p-4 rounded border border-vscode-border bg-vscode-sidebar space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-vscode-border/40 pb-3">
                        <div>
                          <div className="flex items-center space-x-2">
                            <h3 className="text-sm font-semibold">
                              {activeDetails?.manufacturer ? `${activeDetails.manufacturer} ` : ''}
                              {activeDetails?.model || activeDevice.model || 'Android Target'}
                            </h3>
                            <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-vscode-badge-bg text-vscode-badge-fg">
                              {activeDevice.connectionType.toUpperCase()}
                            </span>
                          </div>
                          <p className="text-xs text-vscode-muted font-mono mt-0.5">
                            Serial: {activeDevice.serial}
                          </p>
                        </div>

                        {/* Quick Action Buttons */}
                        <div className="flex items-center space-x-1.5 relative">
                          {/* Screenshot Button */}
                          <button
                            onClick={handleTakeScreenshot}
                            disabled={isCapturingScreenshot || activeDevice.state !== 'device'}
                            className={`p-1.5 rounded border border-vscode-border text-xs flex items-center space-x-1 transition-colors ${
                              screenshotSuccess
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                                : 'hover:bg-vscode-bg text-vscode-fg'
                            } disabled:opacity-40`}
                            title="Take Screenshot & Open in Editor"
                          >
                            <Camera className={`w-3.5 h-3.5 ${isCapturingScreenshot ? 'animate-pulse' : ''}`} />
                            <span className="hidden sm:inline">
                              {screenshotSuccess ? 'Captured!' : 'Screenshot'}
                            </span>
                          </button>

                          {/* Terminal Shell Button */}
                          <button
                            onClick={() => onOpenShell(activeDevice.serial)}
                            disabled={activeDevice.state !== 'device'}
                            className="p-1.5 rounded border border-vscode-border hover:bg-vscode-bg text-xs text-vscode-fg flex items-center space-x-1 transition-colors disabled:opacity-40"
                            title="Open ADB Interactive Shell Terminal"
                          >
                            <Terminal className="w-3.5 h-3.5 text-amber-400" />
                            <span className="hidden sm:inline">Shell</span>
                          </button>

                          {/* Reboot Dropdown */}
                          <div className="relative">
                            <button
                              onClick={() => setShowRebootMenu(!showRebootMenu)}
                              disabled={activeDevice.state !== 'device'}
                              className="p-1.5 rounded border border-vscode-border hover:bg-vscode-bg text-xs text-vscode-fg flex items-center space-x-1 transition-colors disabled:opacity-40"
                              title="Reboot Options"
                            >
                              <RotateCw className="w-3.5 h-3.5 text-sky-400" />
                              <span className="hidden sm:inline">Reboot</span>
                              <ChevronDown className="w-3 h-3 text-vscode-muted" />
                            </button>

                            {showRebootMenu && (
                              <div className="absolute right-0 mt-1 w-36 rounded border border-vscode-border bg-vscode-sidebar shadow-lg z-20 py-1 text-xs">
                                <button
                                  onClick={() => handleReboot('system')}
                                  className="w-full text-left px-3 py-1.5 hover:bg-vscode-bg flex items-center space-x-2"
                                >
                                  <span>System Reboot</span>
                                </button>
                                <button
                                  onClick={() => handleReboot('bootloader')}
                                  className="w-full text-left px-3 py-1.5 hover:bg-vscode-bg flex items-center space-x-2 text-amber-400"
                                >
                                  <span>Bootloader / Fastboot</span>
                                </button>
                                <button
                                  onClick={() => handleReboot('recovery')}
                                  className="w-full text-left px-3 py-1.5 hover:bg-vscode-bg flex items-center space-x-2 text-red-400"
                                >
                                  <span>Recovery Mode</span>
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Enable Wireless on Port 5555 */}
                          {activeDevice.connectionType === 'usb' && (
                            <button
                              onClick={handleEnableTcpip}
                              disabled={activeDevice.state !== 'device'}
                              className="p-1.5 rounded border border-vscode-border hover:bg-vscode-bg text-xs text-vscode-fg flex items-center space-x-1 transition-colors disabled:opacity-40"
                              title="Switch to Wireless TCP/IP Mode"
                            >
                              <Wifi className="w-3.5 h-3.5 text-sky-400" />
                              <span className="hidden sm:inline">Enable Wi-Fi</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Unauthorized Warning Banner */}
                      {activeDevice.state === 'unauthorized' && (
                        <div className="p-3 rounded border border-amber-500/30 bg-amber-500/10 flex items-start space-x-2 text-xs text-amber-300">
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-semibold">Device Unauthorized</p>
                            <p className="text-[11px] opacity-90 mt-0.5">
                              Check your device screen and accept the <strong>Allow USB debugging?</strong> prompt.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Hardware Specs Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        {/* Android OS */}
                        <div className="p-2.5 rounded bg-vscode-bg/60 border border-vscode-border/30">
                          <p className="text-[10px] text-vscode-muted font-medium">OS Version</p>
                          <p className="font-semibold text-xs mt-0.5">
                            {activeDetails?.androidVersion ? `Android ${activeDetails.androidVersion}` : 'Unknown'}
                          </p>
                          {activeDetails?.apiLevel && (
                            <span className="text-[10px] text-vscode-muted font-mono">
                              API Level {activeDetails.apiLevel}
                            </span>
                          )}
                        </div>

                        {/* Battery */}
                        <div className="p-2.5 rounded bg-vscode-bg/60 border border-vscode-border/30">
                          <div className="flex items-center justify-between">
                            <p className="text-[10px] text-vscode-muted font-medium">Battery</p>
                            {activeDetails?.battery?.isCharging ? (
                              <BatteryCharging className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Battery className="w-3 h-3 text-vscode-muted" />
                            )}
                          </div>
                          <p className="font-semibold text-xs mt-0.5">
                            {activeDetails?.battery ? `${activeDetails.battery.level}%` : 'N/A'}
                          </p>
                          {activeDetails?.battery?.temperature && (
                            <span className="text-[10px] text-vscode-muted font-mono">
                              {activeDetails.battery.temperature}°C
                            </span>
                          )}
                        </div>

                        {/* Display */}
                        <div className="p-2.5 rounded bg-vscode-bg/60 border border-vscode-border/30">
                          <div className="flex items-center justify-between">
                            <p className="text-[10px] text-vscode-muted font-medium">Display</p>
                            <Maximize className="w-3 h-3 text-vscode-muted" />
                          </div>
                          <p className="font-semibold text-xs mt-0.5">
                            {activeDetails?.display?.size || 'Unknown'}
                          </p>
                          {activeDetails?.display?.density && (
                            <span className="text-[10px] text-vscode-muted font-mono">
                              {activeDetails.display.density} dpi
                            </span>
                          )}
                        </div>

                        {/* Storage */}
                        <div className="p-2.5 rounded bg-vscode-bg/60 border border-vscode-border/30">
                          <div className="flex items-center justify-between">
                            <p className="text-[10px] text-vscode-muted font-medium">Data Storage</p>
                            <HardDrive className="w-3 h-3 text-vscode-muted" />
                          </div>
                          <p className="font-semibold text-xs mt-0.5">
                            {activeDetails?.storage ? `${activeDetails.storage.available} free` : 'N/A'}
                          </p>
                          {activeDetails?.storage && (
                            <span className="text-[10px] text-vscode-muted font-mono">
                              {activeDetails.storage.percentage}% used
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Sideload APK Section */}
                    <div className="p-4 rounded border border-vscode-border bg-vscode-sidebar space-y-3">
                      <div className="flex items-center space-x-2">
                        <Package className="w-4 h-4 text-emerald-400" />
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-vscode-fg">
                          Sideload & Install APK
                        </h4>
                      </div>

                      <div className="space-y-3">
                        {/* File Selector */}
                        <div className="flex items-center space-x-2">
                          <div className="relative flex-1">
                            <input
                              type="text"
                              value={selectedApkPath}
                              onChange={(e) => setSelectedApkPath(e.target.value)}
                              placeholder="Select or enter .apk file path on disk..."
                              className="w-full px-2.5 py-1.5 rounded border border-vscode-border bg-vscode-input-bg text-vscode-input-fg text-xs font-mono"
                            />
                          </div>
                          <button
                            onClick={handleBrowseApk}
                            className="px-3 py-1.5 rounded border border-vscode-border hover:bg-vscode-bg text-xs font-medium flex items-center space-x-1.5 text-vscode-fg transition-colors shrink-0"
                          >
                            <FolderOpen className="w-3.5 h-3.5 text-vscode-muted" />
                            <span>Browse...</span>
                          </button>
                        </div>

                        {/* Installation Options */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-vscode-fg/90">
                          <label className="flex items-center space-x-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={apkOptions.reinstall}
                              onChange={(e) => setApkOptions({ ...apkOptions, reinstall: e.target.checked })}
                              className="rounded text-vscode-button-bg focus:ring-0"
                            />
                            <span>Reinstall (-r)</span>
                          </label>

                          <label className="flex items-center space-x-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={apkOptions.grantPermissions}
                              onChange={(e) => setApkOptions({ ...apkOptions, grantPermissions: e.target.checked })}
                              className="rounded text-vscode-button-bg focus:ring-0"
                            />
                            <span>Grant Permissions (-g)</span>
                          </label>

                          <label className="flex items-center space-x-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={apkOptions.allowDowngrade}
                              onChange={(e) => setApkOptions({ ...apkOptions, allowDowngrade: e.target.checked })}
                              className="rounded text-vscode-button-bg focus:ring-0"
                            />
                            <span>Allow Downgrade (-d)</span>
                          </label>

                          <label className="flex items-center space-x-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={apkOptions.allowTestOnly}
                              onChange={(e) => setApkOptions({ ...apkOptions, allowTestOnly: e.target.checked })}
                              className="rounded text-vscode-button-bg focus:ring-0"
                            />
                            <span>Test-Only Package (-t)</span>
                          </label>
                        </div>

                        {/* Action and Status Feedback */}
                        <div className="flex items-center justify-between pt-1">
                          <div className="flex-1 mr-3">
                            {apkResult && (
                              <div className={`p-2 rounded text-xs flex items-start space-x-2 ${
                                apkResult.success
                                  ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                                  : 'bg-red-500/10 border border-red-500/30 text-red-400'
                              }`}>
                                {apkResult.success ? (
                                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                                ) : (
                                  <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                )}
                                <div>
                                  <p className="font-medium">{apkResult.message}</p>
                                  {apkResult.errorCode && (
                                    <code className="text-[10px] opacity-80 font-mono block mt-0.5">
                                      {apkResult.errorCode}
                                    </code>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>

                          <button
                            onClick={handleInstallApk}
                            disabled={isInstallingApk || !selectedApkPath.trim() || activeDevice.state !== 'device'}
                            className="px-4 py-2 rounded bg-vscode-button-bg text-vscode-button-fg hover:bg-vscode-button-hover text-xs font-semibold flex items-center space-x-1.5 shrink-0 disabled:opacity-50"
                          >
                            {isInstallingApk ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                <span>Installing APK...</span>
                              </>
                            ) : (
                              <>
                                <FileCheck className="w-3.5 h-3.5" />
                                <span>Install to Device</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: VIRTUAL DEVICES & EMULATORS (AVD) */}
      {subTab === 'avds' && (
        <div className="space-y-4">
          {avds.length === 0 ? (
            <div className="border border-dashed border-vscode-border rounded-lg p-8 text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-full bg-vscode-sidebar flex items-center justify-center text-vscode-muted">
                <Laptop className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">No Android Virtual Devices Configured</h3>
                <p className="text-xs text-vscode-muted max-w-md mx-auto">
                  Create an emulator virtual device using an installed system image to test and run apps directly on your PC.
                </p>
              </div>
              <div className="flex items-center justify-center space-x-2 pt-2">
                <button
                  onClick={() => {
                    setShowCreateModal(true);
                    if (systemImages.length === 0) onFetchSystemImages();
                  }}
                  className="px-3.5 py-1.5 rounded bg-vscode-button-bg text-vscode-button-fg hover:bg-vscode-button-hover text-xs font-medium flex items-center space-x-1.5 transition-colors"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Create Virtual Device</span>
                </button>
                <button
                  onClick={onRefreshAvds}
                  disabled={isRefreshingAvds}
                  className="px-3 py-1.5 rounded border border-vscode-border hover:bg-vscode-sidebar text-xs text-vscode-fg transition-colors"
                >
                  Scan Again
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {avds.map((avd) => {
                const isLaunching = launchingAvdName === avd.name;
                const isStopping = stoppingAvdName === avd.name;
                const isRunning = avd.isRunning || avd.status === 'running';
                const isBooting = avd.status === 'booting';

                return (
                  <div
                    key={avd.name}
                    className={`p-4 rounded border transition-all space-y-3 ${
                      isRunning
                        ? 'border-emerald-500/50 bg-emerald-500/5 shadow-sm'
                        : (isBooting || isLaunching)
                        ? 'border-amber-500/50 bg-amber-500/5'
                        : 'border-vscode-border bg-vscode-sidebar'
                    }`}
                  >
                    {/* Top Row: Device Name & Status */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${
                          isRunning
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : (isBooting || isLaunching)
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-vscode-bg text-vscode-muted'
                        }`}>
                          <Laptop className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-semibold truncate">
                            {avd.displayName || avd.name.replace(/_/g, ' ')}
                          </h4>
                          <p className="text-[11px] text-vscode-muted font-mono truncate">
                            {avd.name}
                          </p>
                        </div>
                      </div>

                      {/* Accurate Status Indicator Badge */}
                      {isStopping ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-mono flex items-center space-x-1.5 shrink-0 bg-red-500/10 text-red-300 border border-red-500/30">
                          <RefreshCw className="w-2.5 h-2.5 animate-spin text-red-400" />
                          <span>Shutting down...</span>
                        </span>
                      ) : isRunning ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-mono flex items-center space-x-1.5 shrink-0 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                          <span>Running ({avd.runningSerial || 'emulator-5554'})</span>
                        </span>
                      ) : (isBooting || isLaunching) ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-mono flex items-center space-x-1.5 shrink-0 bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                          <span>Booting Virtual Device...</span>
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-mono flex items-center space-x-1.5 shrink-0 bg-vscode-bg text-vscode-muted border border-vscode-border/50">
                          <span className="w-1.5 h-1.5 rounded-full bg-vscode-muted" />
                          <span>Stopped</span>
                        </span>
                      )}
                    </div>

                    {/* Metadata Specs Chips */}
                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                      {avd.target && (
                        <span className="px-2 py-0.5 rounded bg-vscode-bg/70 border border-vscode-border/40 font-medium">
                          {avd.target}
                        </span>
                      )}
                      {avd.abi && (
                        <span className="px-2 py-0.5 rounded bg-vscode-bg/70 border border-vscode-border/40 font-mono text-vscode-muted">
                          {avd.abi}
                        </span>
                      )}
                      {avd.deviceProfile && (
                        <span className="px-2 py-0.5 rounded bg-vscode-bg/70 border border-vscode-border/40 text-vscode-muted">
                          {avd.deviceProfile}
                        </span>
                      )}
                      {avd.diskSize && (
                        <span className="px-2 py-0.5 rounded bg-vscode-bg/70 border border-vscode-border/40 text-vscode-muted">
                          {avd.diskSize}
                        </span>
                      )}
                      {avd.hasPlayStore && (
                        <span className="px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/30 text-sky-400 flex items-center space-x-1">
                          <ShieldCheck className="w-3 h-3" />
                          <span>Google Play</span>
                        </span>
                      )}
                    </div>

                    {/* Bottom Action Bar */}
                    <div className="flex items-center justify-between pt-1 border-t border-vscode-border/40">
                      <div className="flex items-center space-x-2">
                        {isRunning || isBooting ? (
                          <button
                            onClick={() => handleStopAvd(avd.name, avd.runningSerial)}
                            disabled={isStopping}
                            className="px-3.5 py-1.5 rounded bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 text-xs font-semibold flex items-center space-x-1.5 transition-colors disabled:opacity-50"
                          >
                            {isStopping ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                <span>Stopping...</span>
                              </>
                            ) : (
                              <>
                                <Square className="w-3.5 h-3.5" />
                                <span>Stop Emulator</span>
                              </>
                            )}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleLaunchAvd(avd.name)}
                            disabled={isLaunching}
                            className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center space-x-1.5 transition-colors shadow disabled:opacity-50"
                          >
                            {isLaunching ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                <span>Starting Emulator...</span>
                              </>
                            ) : (
                              <>
                                <Play className="w-3.5 h-3.5" />
                                <span>Launch Emulator</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>

                      <div className="flex items-center space-x-1.5">
                        {isRunning && avd.runningSerial && (
                          <button
                            onClick={() => {
                              setSelectedSerial(avd.runningSerial || null);
                              setSubTab('connected');
                            }}
                            className="px-2.5 py-1.5 rounded border border-vscode-border hover:bg-vscode-bg text-xs text-vscode-fg transition-colors flex items-center space-x-1"
                            title="Inspect in Connected Devices tab"
                          >
                            <span>Inspect & Sideload</span>
                            <ArrowRight className="w-3 h-3 text-vscode-muted" />
                          </button>
                        )}

                        <button
                          onClick={() => handleDeleteAvd(avd.name)}
                          disabled={isRunning || isBooting}
                          className="p-1.5 rounded hover:bg-red-500/10 text-vscode-muted hover:text-red-400 transition-colors disabled:opacity-30"
                          title="Delete Virtual Device"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MODAL: CREATE AVD */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-vscode-sidebar border border-vscode-border rounded-lg max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-vscode-border/50 pb-3">
              <div className="flex items-center space-x-2">
                <Box className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold">Create Android Virtual Device</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-vscode-muted hover:text-vscode-fg text-xs"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              {/* AVD Name */}
              <div>
                <label className="block text-xs font-medium text-vscode-fg mb-1">
                  Virtual Device Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Pixel_7_API_34"
                  value={newAvdName}
                  onChange={(e) => setNewAvdName(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded border border-vscode-border bg-vscode-input-bg text-vscode-input-fg text-xs font-mono"
                />
                <p className="text-[10px] text-vscode-muted mt-0.5">
                  Letters, numbers, and underscores only.
                </p>
              </div>

              {/* System Image */}
              <div>
                <label className="block text-xs font-medium text-vscode-fg mb-1">
                  System Image Package
                </label>
                {systemImages.length > 0 ? (
                  <select
                    value={selectedSystemImage}
                    onChange={(e) => setSelectedSystemImage(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded border border-vscode-border bg-vscode-input-bg text-vscode-input-fg text-xs"
                  >
                    {systemImages.map((img) => (
                      <option key={img.id} value={img.id}>
                        {img.description}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="space-y-2">
                    <div className="p-3 rounded border border-amber-500/30 bg-amber-500/10 space-y-2">
                      <div className="flex items-start space-x-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-semibold text-amber-300">
                            No System Images Installed
                          </p>
                          <p className="text-[11px] text-amber-200/80 mt-0.5 leading-relaxed">
                            Virtual devices require an Android OS image and the emulator binary.
                            Click below to download the recommended Android 14 image automatically.
                          </p>
                        </div>
                      </div>

                      <div className="pt-1 flex flex-wrap items-center justify-between gap-2 border-t border-amber-500/20">
                        <code className="text-[10px] font-mono text-amber-300/90 truncate">
                          system-images;android-34;google_apis;x86_64
                        </code>
                        <button
                          type="button"
                          onClick={handleDownloadRecommendedImage}
                          disabled={isDownloadingImage}
                          className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center space-x-1.5 transition-colors disabled:opacity-50"
                        >
                          {isDownloadingImage ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Downloading (~1.4 GB)...</span>
                            </>
                          ) : (
                            <>
                              <DownloadCloud className="w-3.5 h-3.5" />
                              <span>Download & Install Image</span>
                            </>
                          )}
                        </button>
                      </div>

                      {isDownloadingImage && (
                        <p className="text-[10px] text-vscode-muted animate-pulse">
                          {downloadProgressMsg || 'Downloading package via sdkmanager. Please wait a few moments...'}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-[11px] text-vscode-muted mb-0.5">
                        Or enter manual package identifier:
                      </label>
                      <input
                        type="text"
                        placeholder="system-images;android-34;google_apis;x86_64"
                        value={selectedSystemImage}
                        onChange={(e) => setSelectedSystemImage(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded border border-vscode-border bg-vscode-input-bg text-vscode-input-fg text-xs font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Device Hardware Profile */}
              <div>
                <label className="block text-xs font-medium text-vscode-fg mb-1">
                  Device Hardware Profile
                </label>
                <select
                  value={selectedProfile}
                  onChange={(e) => setSelectedProfile(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded border border-vscode-border bg-vscode-input-bg text-vscode-input-fg text-xs"
                >
                  <option value="pixel_7">Pixel 7 (6.3" 1080x2400 420dpi)</option>
                  <option value="pixel_6">Pixel 6 (6.4" 1080x2400 411dpi)</option>
                  <option value="pixel_5">Pixel 5 (6.0" 1080x2340 432dpi)</option>
                  <option value="nexus_5">Nexus 5 (4.95" 1080x1920 445dpi)</option>
                  <option value="pixel_tablet">Pixel Tablet (10.95" 2560x1600 276dpi)</option>
                </select>
              </div>
            </div>

            {/* Modal Buttons */}
            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-vscode-border/50">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-3 py-1.5 rounded border border-vscode-border hover:bg-vscode-bg text-xs text-vscode-fg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateAvd}
                disabled={isCreatingAvd || isDownloadingImage || !newAvdName.trim() || !selectedSystemImage.trim()}
                className="px-4 py-1.5 rounded bg-vscode-button-bg text-vscode-button-fg hover:bg-vscode-button-hover text-xs font-semibold flex items-center space-x-1.5 transition-colors disabled:opacity-50"
              >
                {isCreatingAvd ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Creating AVD...</span>
                  </>
                ) : (
                  <>
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>Create Device</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
