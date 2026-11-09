import * as vscode from 'vscode';
import { BridgeMessage, SettingsConfig, SystemHealthReport, StartInstallPayload, JdkConfigPayload } from '../../shared/types';
import { MessageTypes, createErrorMessage, createMessage } from '../../shared/messages';
import { DEFAULT_SETTINGS } from '../../shared/constants';
import { SdkDiscovery } from '../../core/sdk/sdk-discovery';
import { Installer } from '../../core/installer/installer';
import { CmdlineToolsAdapter } from '../../core/sdk/package-manager-adapter';
import { JdkManager } from '../../core/jdk/jdk-manager';
import { EnvironmentManager } from '../../core/environment/environment-manager';
import { DiagnosticsEngine } from '../../core/diagnostics/diagnostics';

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
    if (!message || typeof message !== 'object') return;

    // Ignore internal Antigravity IDE / Jetski RPC probes
    if ((message as any).channel === 'agy-ext-antigravity-api' || message.type === 'postmessage-rpc') {
      return;
    }

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

        case MessageTypes.GET_JDK_LIST:
          const jdks = await JdkManager.getAvailableJdks(this.settings.sdk.root);
          this.postResponse(MessageTypes.JDK_LIST_DATA, jdks, id, senderWebview);
          break;

        case MessageTypes.SET_JDK_CONFIG:
          const jdkPayload = payload as JdkConfigPayload;
          try {
            const configRes = await JdkManager.setJdkConfiguration(
              jdkPayload.mode,
              this.settings.sdk.root,
              jdkPayload.customPath
            );
            this.settings.jdk.mode = jdkPayload.mode;
            this.settings.jdk.path = configRes.javaHome;
            await this.persistSettings();

            vscode.window.showInformationMessage(`JAVA_HOME configured to: ${configRes.javaHome}`);
            this.postResponse(MessageTypes.SETTINGS_DATA, this.settings, id, senderWebview);

            const freshHealth = await this.getSystemHealthReport();
            this.postMessage(MessageTypes.HEALTH_REPORT, freshHealth);
          } catch (jdkErr: unknown) {
            const msg = jdkErr instanceof Error ? jdkErr.message : String(jdkErr);
            vscode.window.showErrorMessage(`Failed to configure JDK: ${msg}`);
            this.postError(type, 'ERR_JDK_CONFIG', msg, id, senderWebview);
          }
          break;

        case MessageTypes.INSTALL_MANAGED_JDK:
          if (!this.settings.sdk.root) {
            throw new Error('Please select an SDK root directory before installing the Managed JDK.');
          }
          try {
            const installedJdk = await JdkManager.installManagedJdk(this.settings.sdk.root, (progress) => {
              this.postMessage(MessageTypes.INSTALL_PROGRESS_EVENT, progress);
            });
            await JdkManager.setJdkConfiguration('managed', this.settings.sdk.root);
            this.settings.jdk.mode = 'managed';
            this.settings.jdk.path = installedJdk.path;
            await this.persistSettings();

            vscode.window.showInformationMessage('Eclipse Temurin OpenJDK 17 LTS installed successfully!');
            this.postResponse(MessageTypes.MANAGED_JDK_INSTALLED, installedJdk, id, senderWebview);

            const freshReport = await this.getSystemHealthReport();
            this.postMessage(MessageTypes.HEALTH_REPORT, freshReport);
          } catch (installJdkErr: unknown) {
            const msg = installJdkErr instanceof Error ? installJdkErr.message : String(installJdkErr);
            vscode.window.showErrorMessage(`Managed JDK installation failed: ${msg}`);
            this.postError(type, 'ERR_JDK_INSTALL', msg, id, senderWebview);
          }
          break;

        case MessageTypes.RUN_AUTO_REPAIR:
          const { issueId } = payload as { issueId: string };
          const targetSdkRoot = this.settings.sdk.root || process.env['ANDROID_HOME'];

          try {
            if (!targetSdkRoot) {
              throw new Error('No SDK root directory configured.');
            }

            const repairResult = await DiagnosticsEngine.executeAutoRepair(issueId, {
              sdkRoot: targetSdkRoot,
              androidHome: process.env['ANDROID_HOME'] || null,
              androidSdkRoot: process.env['ANDROID_SDK_ROOT'] || null,
              javaHome: process.env['JAVA_HOME'] || null
            });

            vscode.window.showInformationMessage(`Android Dev Tools: ${repairResult.message}`);

            this.postResponse(MessageTypes.AUTO_REPAIR_RESULT, {
              issueId,
              success: true,
              message: repairResult.message
            }, id, senderWebview);

            const updatedReport = await this.getSystemHealthReport();
            this.postMessage(MessageTypes.HEALTH_REPORT, updatedReport);
          } catch (repairErr: unknown) {
            const errorMsg = repairErr instanceof Error ? repairErr.message : String(repairErr);
            vscode.window.showErrorMessage(`Auto-repair failed: ${errorMsg}`);
            this.postError(type, 'ERR_AUTO_REPAIR', errorMsg, id, senderWebview);
          }
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

