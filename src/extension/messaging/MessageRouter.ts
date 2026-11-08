import * as vscode from 'vscode';
import { BridgeMessage, SettingsConfig, SystemHealthReport } from '../../shared/types';
import { MessageTypes, createErrorMessage, createMessage } from '../../shared/messages';
import { DEFAULT_SETTINGS } from '../../shared/constants';

export class MessageRouter {
  private webview: vscode.Webview | null = null;
  private settings: SettingsConfig = { ...DEFAULT_SETTINGS };

  constructor(private readonly context: vscode.ExtensionContext) {
    this.loadSettings();
  }

  public attachWebview(webview: vscode.Webview) {
    this.webview = webview;
    this.webview.onDidReceiveMessage((message: BridgeMessage) => {
      this.handleMessage(message);
    });
  }

  private async handleMessage(message: BridgeMessage) {
    const { id, type, payload } = message;

    try {
      switch (type) {
        case MessageTypes.UI_READY:
          await this.sendInitialState();
          break;

        case MessageTypes.GET_HEALTH_REPORT:
          const report = await this.getSystemHealthReport();
          this.postResponse(MessageTypes.HEALTH_REPORT, report, id);
          break;

        case MessageTypes.GET_SETTINGS:
          this.postResponse(MessageTypes.SETTINGS_DATA, this.settings, id);
          break;

        case MessageTypes.SAVE_SETTINGS:
          this.settings = payload as SettingsConfig;
          await this.persistSettings();
          this.postResponse(MessageTypes.SETTINGS_DATA, this.settings, id);
          vscode.window.showInformationMessage('Android Dev Tools settings saved.');
          break;

        case MessageTypes.SELECT_DIRECTORY:
          const selectedUri = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Select SDK Directory'
          });
          const selectedPath = selectedUri && selectedUri.length > 0 ? selectedUri[0].fsPath : null;
          this.postResponse(MessageTypes.DIRECTORY_SELECTED, { selectedPath }, id);
          break;

        case MessageTypes.RUN_AUTO_REPAIR:
          vscode.window.showInformationMessage(`Auto-repair initiated for issue.`);
          this.postResponse(MessageTypes.AUTO_REPAIR_RESULT, {
            issueId: (payload as { issueId: string }).issueId,
            success: true,
            message: 'Auto-repair scheduled.'
          }, id);
          break;

        default:
          console.warn(`[MessageRouter] Unhandled message type: ${type}`);
          this.postError(type, 'UNHANDLED_COMMAND', `Command ${type} is not yet implemented.`, id);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.postError(type, 'INTERNAL_ERROR', errorMessage, id);
    }
  }

  private async sendInitialState() {
    const report = await this.getSystemHealthReport();
    this.postMessage(MessageTypes.HEALTH_REPORT, report);
    this.postMessage(MessageTypes.SETTINGS_DATA, this.settings);
  }

  private async getSystemHealthReport(): Promise<SystemHealthReport> {
    // Baseline detection snapshot for Milestone 1 (expanded in Milestone 2)
    const envAndroidHome = process.env['ANDROID_HOME'] || null;
    const envAndroidSdkRoot = process.env['ANDROID_SDK_ROOT'] || null;
    const envJavaHome = process.env['JAVA_HOME'] || null;

    const isInstalled = !!envAndroidHome;

    return {
      overallStatus: isInstalled ? 'ready' : 'warning',
      sdkRoot: envAndroidHome || this.settings.sdk.root,
      isCustomSdk: !!envAndroidHome,
      androidHome: envAndroidHome,
      androidSdkRoot: envAndroidSdkRoot,
      adbAvailableInPath: false,
      adbVersion: undefined,
      javaDetected: !!envJavaHome,
      javaVersion: envJavaHome ? 'Detected' : undefined,
      javaHome: envJavaHome,
      licensesAccepted: false,
      components: [
        {
          id: 'cmdline-tools',
          name: 'Command-line Tools',
          isInstalled: false,
          statusText: 'Not verified'
        },
        {
          id: 'platform-tools',
          name: 'Platform Tools (ADB)',
          isInstalled: false,
          statusText: 'Not verified'
        },
        {
          id: 'build-tools',
          name: 'Build Tools',
          isInstalled: false,
          statusText: 'Not verified'
        },
        {
          id: 'platforms',
          name: 'Android Platform',
          isInstalled: false,
          statusText: 'Not verified'
        },
        {
          id: 'emulator',
          name: 'Android Emulator',
          isInstalled: false,
          statusText: 'Not installed (Optional)'
        }
      ],
      issues: isInstalled ? [] : [
        {
          id: 'missing-sdk',
          severity: 'warning',
          title: 'Android SDK Not Configured',
          description: 'No existing ANDROID_HOME environment variable or active installation was detected.',
          solution: 'Run the Setup Manager wizard to install the required Android tools.',
          canAutoFix: false
        }
      ],
      lastChecked: new Date().toISOString()
    };
  }

  private loadSettings() {
    const stored = this.context.globalState.get<SettingsConfig>('androidDevTools.settings');
    if (stored) {
      this.settings = stored;
    }
  }

  private async persistSettings() {
    await this.context.globalState.update('androidDevTools.settings', this.settings);
  }

  public postMessage<T>(type: string, payload?: T) {
    if (this.webview) {
      this.webview.postMessage(createMessage(type, payload));
    }
  }

  private postResponse<T>(type: string, payload?: T, id?: string) {
    if (this.webview) {
      this.webview.postMessage(createMessage(type, payload, id));
    }
  }

  private postError(type: string, code: string, message: string, id?: string) {
    if (this.webview) {
      this.webview.postMessage(createErrorMessage(type, code, message, id));
    }
  }
}

