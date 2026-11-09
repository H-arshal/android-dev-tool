import { SettingsConfig } from './types';

export const DEFAULT_SETTINGS: SettingsConfig = {
  schemaVersion: 1,
  sdk: {
    root: 'C:\\Android_Tools\\sdk',
    installationProfile: 'physical-device'
  },
  jdk: {
    mode: 'detect',
    path: null
  },
  environment: {
    configureAndroidHome: true,
    configurePath: true,
    preserveExistingVariables: true
  },
  preferences: {
    autoValidate: true,
    showInstallationNotifications: true
  }
};

export const GOOGLE_KNOWN_LICENSES = {
  SDK_LICENSE: 'android-sdk-license',
  PREVIEW_LICENSE: 'android-sdk-preview-license',
  HASHES: [
    '24333f8a63b6825ea9c5514f83c2829b004d1fee',
    'd56f5187479451eabf01fb78af6dfcb131a6481e',
    '84831b9409646a53ee0f22618e2001670d613094'
  ]
};

export const COMMON_WINDOWS_SDK_PATHS = [
  'C:\\Android_Tools\\sdk',
  'D:\\Android_Tools\\sdk',
  '%LOCALAPPDATA%\\Android\\Sdk'
];

export const GOOGLE_CMDLINE_TOOLS = {
  URL: 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip',
  FILE_NAME: 'commandlinetools-win-11076708_latest.zip',
  SHA256: '2d2d50bba3f463b6c169e60341eb4d71b3403fa8a3d89cf7388517770123687c'
};

export const PROFILE_DEFAULT_PACKAGES: Record<string, string[]> = {
  'physical-device': [
    'platform-tools',
    'build-tools;34.0.0',
    'platforms;android-34'
  ],
  'full-setup': [
    'platform-tools',
    'build-tools;34.0.0',
    'platforms;android-34',
    'emulator',
    'system-images;android-34;google_apis;x86_64'
  ]
};

export const MANAGED_JDK_CONFIG = {
  DISTRIBUTION: 'Eclipse Temurin OpenJDK 17 LTS',
  VERSION: '17.0.12',
  URL: 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.12%2B7/OpenJDK17U-jdk_x64_windows_hotspot_17.0.12_7.zip',
  FILE_NAME: 'OpenJDK17U-jdk_x64_windows_hotspot_17.0.12_7.zip',
  FOLDER_NAME: 'managed'
};

export const COMMON_WINDOWS_JDK_SEARCH_PATHS = [
  'C:\\Program Files\\Java',
  'C:\\Program Files\\Eclipse Adoptium',
  'C:\\Program Files\\Microsoft',
  'C:\\Program Files\\Amazon Corretto',
  'C:\\Program Files\\Zulu',
  'C:\\Program Files\\Android\\Android Studio\\jbr',
  '%LOCALAPPDATA%\\Programs\\Eclipse Adoptium',
  '%USERPROFILE%\\.jdks'
];

