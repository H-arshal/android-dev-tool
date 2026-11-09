// Inter-Process Communication & Domain Models

export type HealthStatus = 'ready' | 'warning' | 'error';

export interface ComponentHealth {
  id: 'cmdline-tools' | 'platform-tools' | 'build-tools' | 'platforms' | 'emulator';
  name: string;
  isInstalled: boolean;
  version?: string;
  path?: string;
  statusText: string;
}

export interface DiagnosticIssue {
  id: string;
  severity: 'error' | 'warning' | 'info';
  title: string;
  description: string;
  detectedPath?: string;
  solution: string;
  canAutoFix: boolean;
  autoFixAction?: 'ADD_PATH' | 'SET_ANDROID_HOME' | 'ACCEPT_LICENSES' | 'REPAIR_CMDLINE_TOOLS';
}

export interface SystemHealthReport {
  overallStatus: HealthStatus;
  sdkRoot: string | null;
  isCustomSdk: boolean;
  androidHome: string | null;
  androidSdkRoot: string | null;
  adbAvailableInPath: boolean;
  adbVersion?: string;
  javaDetected: boolean;
  javaVersion?: string;
  javaHome: string | null;
  licensesAccepted: boolean;
  components: ComponentHealth[];
  issues: DiagnosticIssue[];
  lastChecked: string;
}

export type InstallPhase =
  | 'idle'
  | 'validating'
  | 'downloading'
  | 'verifying'
  | 'extracting'
  | 'installing_packages'
  | 'accepting_licenses'
  | 'configuring_environment'
  | 'completed'
  | 'failed';

export interface InstallProgress {
  phase: InstallPhase;
  currentTask: string;
  percentage?: number; // 0-100 or undefined if indeterminate
  downloadedBytes?: number;
  totalBytes?: number;
  currentPackage?: string;
  message?: string;
}

export type InstallationProfile = 'physical-device' | 'full-setup' | 'custom';

export interface StartInstallPayload {
  rootDir: string;
  profile: InstallationProfile;
  customPackages?: string[];
  jdkChoice: 'detect' | 'managed' | 'manual';
  manualJdkPath?: string;
}

export interface InstallResult {
  success: boolean;
  sdkRoot: string;
  installedPackages: string[];
  requiresRestart: boolean;
  message: string;
}

export interface InstallFailurePayload {
  phase: InstallPhase;
  error: BridgeError;
  canRetry: boolean;
  partialPath?: string;
  suggestedAction: string;
}

export interface SettingsConfig {
  schemaVersion: number;
  sdk: {
    root: string | null;
    installationProfile: InstallationProfile;
  };
  jdk: {
    mode: 'detect' | 'managed' | 'manual';
    path: string | null;
  };
  environment: {
    configureAndroidHome: boolean;
    configurePath: boolean;
    preserveExistingVariables: boolean;
  };
  preferences: {
    autoValidate: boolean;
    showInstallationNotifications: boolean;
  };
}

export interface JdkInfo {
  path: string;
  version: string;
  majorVersion: number;
  vendor: string;
  isJdk: boolean;
  isCompatibleWithAgp8: boolean;
  isManaged: boolean;
}

export interface JdkConfigPayload {
  mode: 'detect' | 'managed' | 'manual';
  customPath?: string;
}

export interface PackageInfo {
  id: string; // e.g., 'platforms;android-34'
  description: string;
  version: string;
  isInstalled: boolean;
  category: 'cmdline-tools' | 'platform-tools' | 'build-tools' | 'platforms' | 'emulator' | 'system-images';
}

export interface PackageCatalog {
  installed: PackageInfo[];
  available: PackageInfo[];
  lastUpdated: string;
}

export interface BridgeError {
  code: string;
  message: string;
  details?: unknown;
}

export interface BridgeMessage<T = unknown> {
  id?: string;
  type: string;
  payload?: T;
  error?: BridgeError;
}

