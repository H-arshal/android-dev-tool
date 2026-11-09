import { BridgeMessage } from './types';

export const MessageTypes = {
  // Webview -> Host
  UI_READY: 'UI_READY',
  GET_HEALTH_REPORT: 'GET_HEALTH_REPORT',
  GET_SETTINGS: 'GET_SETTINGS',
  SAVE_SETTINGS: 'SAVE_SETTINGS',
  SELECT_DIRECTORY: 'SELECT_DIRECTORY',
  START_INSTALLATION: 'START_INSTALLATION',
  CANCEL_INSTALLATION: 'CANCEL_INSTALLATION',
  GET_PACKAGES: 'GET_PACKAGES',
  INSTALL_PACKAGES: 'INSTALL_PACKAGES',
  ACCEPT_LICENSES: 'ACCEPT_LICENSES',
  RUN_AUTO_REPAIR: 'RUN_AUTO_REPAIR',
  SET_JDK_CONFIG: 'SET_JDK_CONFIG',
  GET_JDK_LIST: 'GET_JDK_LIST',
  INSTALL_MANAGED_JDK: 'INSTALL_MANAGED_JDK',
  OPEN_IN_MAIN_VIEW: 'OPEN_IN_MAIN_VIEW',

  // Host -> Webview
  HEALTH_REPORT: 'HEALTH_REPORT',
  SETTINGS_DATA: 'SETTINGS_DATA',
  JDK_LIST_DATA: 'JDK_LIST_DATA',
  MANAGED_JDK_INSTALLED: 'MANAGED_JDK_INSTALLED',
  DIRECTORY_SELECTED: 'DIRECTORY_SELECTED',
  INSTALL_PROGRESS_EVENT: 'INSTALL_PROGRESS_EVENT',
  INSTALL_COMPLETED: 'INSTALL_COMPLETED',
  INSTALL_FAILED: 'INSTALL_FAILED',
  PACKAGE_CATALOG: 'PACKAGE_CATALOG',
  AUTO_REPAIR_RESULT: 'AUTO_REPAIR_RESULT'
} as const;

export type MessageType = typeof MessageTypes[keyof typeof MessageTypes];

export function createMessage<T>(type: string, payload?: T, id?: string): BridgeMessage<T> {
  return { id, type, payload };
}

export function createErrorMessage(type: string, code: string, message: string, id?: string, details?: unknown): BridgeMessage {
  return {
    id,
    type,
    error: { code, message, details }
  };
}

