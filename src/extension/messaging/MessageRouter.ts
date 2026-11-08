import * as vscode from 'vscode';
import { BridgeMessage, SettingsConfig, SystemHealthReport, StartInstallPayload } from '../../shared/types';
import { MessageTypes, createErrorMessage, createMessage } from '../../shared/messages';
import { DEFAULT_SETTINGS } from '../../shared/constants';
import { SdkDiscovery } from '../../core/sdk/sdk-discovery';
import { Installer } from '../../core/installer/installer';
import { CmdlineToolsAdapter } from '../../core/sdk/package-manager-adapter';

export class MessageRouter {
  private webviews = new Set<vscode.Webview>();
  private settings: SettingsConfig = { ...DEFAULT_SETTINGS };
  private onOpenInMainView?: () => void;
  private installer = new Installer();

  constructor(private readonly context: vscode.ExtensionContext) {
    this.loadSettings();
  }

  public setOnOpenInMainView(handler: () => void) {
    this.onOpenInMainView = handler;
  }

  public attachWebview(webview: vscode.Webview) {
    this.webviews.add(webview);
    webview.onDidReceiveMessage((message: BridgeMessage) => {
      this.handleMessage(message, webview);
    });
  }

  private async handleMessage(message: BridgeMessage, senderWebview: vscode.Webview) {
    const { id, type, payload } = message;

    try {
      switch (type) {
        case MessageTypes.UI_READY:
          await this.sendInitialState(senderWebview);
          break;

        case MessageTypes.OPEN_IN_MAIN_VIEW:
          if (this.onOpenInMainView) {
            this.onOpenInMainView();
          }
          break;

        case MessageTypes.GET_HEALTH_REPORT:
          const report = await this.getSystemHealthReport();
          this.postResponse(MessageTypes.HEALTH_REPORT, report, id, senderWebview);
          break;

        case MessageTypes.GET_SETTINGS:
          this.postResponse(MessageTypes.SETTINGS_DATA, this.settings, id, senderWebview);
          break;

        case MessageTypes.SAVE_SETTINGS:
          this.settings = payload as SettingsConfig;
          await this.persistSettings();
          this.postMessage(MessageTypes.SETTINGS_DATA, this.settings);
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
          this.postResponse(MessageTypes.DIRECTORY_SELECTED, { selectedPath }, id, senderWebview);
          break;

        case MessageTypes.START_INSTALLATION:
          const startPayload = payload as StartInstallPayload;
          try {
            const installRes = await this.installer.start(startPayload, (progress) => {
              this.postMessage(MessageTypes.INSTALL_PROGRESS_EVENT, progress);
            });
            this.postResponse(MessageTypes.INSTALL_COMPLETED, installRes, id, senderWebview);
            const freshReport = await this.getSystemHealthReport();
            this.postMessage(MessageTypes.HEALTH_REPORT, freshReport);
            vscode.window.showInformationMessage('Android Dev Tools: Installation completed successfully!');
          } catch (installErr: unknown) {
            const errorMsg = installErr instanceof Error ? installErr.message : String(installErr);
            this.postMessage(MessageTypes.INSTALL_FAILED, {
              phase: 'failed',
              error: { code: 'ERR_INSTALL_FAILED', message: errorMsg },
              canRetry: true,
              suggestedAction: 'Please check your internet connection and disk space, then retry.'
            });
            vscode.window.showErrorMessage(`Android Dev Tools Installation Error: ${errorMsg}`);
          }
          break;

        case MessageTypes.CANCEL_INSTALLATION:
          this.installer.cancel();
          vscode.window.showInformationMessage('Android Dev Tools: Cancelling installation...');
          break;

        case MessageTypes.ACCEPT_LICENSES:
          const targetSdk = this.settings.sdk.root || process.env['ANDROID_HOME'];
          if (targetSdk) {
            const adapter = new CmdlineToolsAdapter(targetSdk);
            const res = await adapter.acceptLicenses();
            vscode.window.showInformationMessage(res.message);
            const freshReport = await this.getSystemHealthReport();
            this.postMessage(MessageTypes.HEALTH_REPORT, freshReport);
          }
          break;

        case MessageTypes.RUN_AUTO_REPAIR:
          vscode.window.showInformationMessage(`Auto-repair initiated for issue.`);
          this.postResponse(MessageTypes.AUTO_REPAIR_RESULT, {
            issueId: (payload as { issueId: string }).issueId,
            success: true,
            message: 'Auto-repair scheduled.'
          }, id, senderWebview);
          break;

        default:
          console.warn(`[MessageRouter] Unhandled message type: ${type}`);
          this.postError(type, 'UNHANDLED_COMMAND', `Command ${type} is not yet implemented.`, id, senderWebview);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.postError(type, 'INTERNAL_ERROR', errorMessage, id, senderWebview);
    }
  }

  private async sendInitialState(targetWebview?: vscode.Webview) {
    const report = await this.getSystemHealthReport();
    if (targetWebview) {
      targetWebview.postMessage(createMessage(MessageTypes.HEALTH_REPORT, report));
      targetWebview.postMessage(createMessage(MessageTypes.SETTINGS_DATA, this.settings));
    } else {
      this.postMessage(MessageTypes.HEALTH_REPORT, report);
      this.postMessage(MessageTypes.SETTINGS_DATA, this.settings);
    }
  }

  private async getSystemHealthReport(): Promise<SystemHealthReport> {
    return SdkDiscovery.scanEnvironment(this.settings.sdk.root);
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
    const msg = createMessage(type, payload);
    for (const webview of this.webviews) {
      try {
        webview.postMessage(msg);
      } catch {
        this.webviews.delete(webview);
      }
    }
  }

  private postResponse<T>(type: string, payload?: T, id?: string, senderWebview?: vscode.Webview) {
    const msg = createMessage(type, payload, id);
    if (senderWebview) {
      senderWebview.postMessage(msg);
    } else {
      this.postMessage(type, payload);
    }
  }

  private postError(type: string, code: string, message: string, id?: string, senderWebview?: vscode.Webview) {
    const msg = createErrorMessage(type, code, message, id);
    if (senderWebview) {
      senderWebview.postMessage(msg);
    } else {
      for (const webview of this.webviews) {
        webview.postMessage(msg);
      }
    }
  }
}

