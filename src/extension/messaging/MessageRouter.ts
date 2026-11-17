import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import {
  BridgeMessage,
  SettingsConfig,
  SystemHealthReport,
  StartInstallPayload,
  JdkConfigPayload,
  InstallApkPayload,
  RebootPayload,
  WirelessConnectPayload,
  LaunchAvdPayload,
  StopAvdPayload,
  DeleteAvdPayload,
  CreateAvdPayload
} from '../../shared/types';
import { MessageTypes, createErrorMessage, createMessage } from '../../shared/messages';
import { DEFAULT_SETTINGS } from '../../shared/constants';
import { SdkDiscovery } from '../../core/sdk/sdk-discovery';
import { Installer } from '../../core/installer/installer';
import { CmdlineToolsAdapter } from '../../core/sdk/package-manager-adapter';
import { JdkManager } from '../../core/jdk/jdk-manager';
import { EnvironmentManager } from '../../core/environment/environment-manager';
import { DiagnosticsEngine } from '../../core/diagnostics/diagnostics';
import { DeviceManager } from '../../core/device/device-manager';
import { EmulatorManager } from '../../core/device/emulator-manager';

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

            // Also refresh package catalog, system images, and AVDs
            try {
              const targetRoot = this.getEffectiveSdkRoot();
              const pkgAdapter = new CmdlineToolsAdapter(targetRoot);
              const [freshCatalog, freshImages, freshAvds] = await Promise.all([
                pkgAdapter.getPackageCatalog(),
                EmulatorManager.listInstalledSystemImages(targetRoot),
                EmulatorManager.listAvds(targetRoot)
              ]);
              this.postMessage(MessageTypes.PACKAGE_CATALOG, freshCatalog);
              this.postMessage(MessageTypes.SYSTEM_IMAGES_DATA, freshImages);
              this.postMessage(MessageTypes.AVDS_LIST_DATA, freshAvds);
            } catch {
              // ignore
            }

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

        case MessageTypes.INSTALL_PACKAGES:
          try {
            const pkgPayload = payload as { packages: string[] };
            if (!pkgPayload?.packages || pkgPayload.packages.length === 0) {
              throw new Error('No packages specified for installation.');
            }

            const targetRoot = this.getEffectiveSdkRoot();
            if (!targetRoot) {
              throw new Error('Android SDK root path is not configured.');
            }

            const pkgAdapter = new CmdlineToolsAdapter(targetRoot);

            await vscode.window.withProgress(
              {
                location: vscode.ProgressLocation.Notification,
                title: `Installing Android SDK Packages (${pkgPayload.packages.join(', ')})...`,
                cancellable: false
              },
              async (progress) => {
                return pkgAdapter.installPackages(pkgPayload.packages, (p) => {
                  progress.report({ message: p.message, increment: p.percentage });
                  this.postMessage(MessageTypes.INSTALL_PROGRESS_EVENT, p);
                });
              }
            );

            vscode.window.showInformationMessage(`Packages installed successfully: ${pkgPayload.packages.join(', ')}`);
            this.postResponse(MessageTypes.ACTION_FEEDBACK, { success: true, message: 'Packages installed successfully.' }, id, senderWebview);

            // Refresh system images, AVDs, package catalog, and health report
            const [freshReport, freshImages, freshAvds, freshCatalog] = await Promise.all([
              this.getSystemHealthReport(),
              EmulatorManager.listInstalledSystemImages(targetRoot),
              EmulatorManager.listAvds(targetRoot),
              pkgAdapter.getPackageCatalog()
            ]);
            this.postMessage(MessageTypes.HEALTH_REPORT, freshReport);
            this.postMessage(MessageTypes.SYSTEM_IMAGES_DATA, freshImages);
            this.postMessage(MessageTypes.AVDS_LIST_DATA, freshAvds);
            this.postMessage(MessageTypes.PACKAGE_CATALOG, freshCatalog);
          } catch (pkgErr: unknown) {
            const msg = pkgErr instanceof Error ? pkgErr.message : String(pkgErr);
            vscode.window.showErrorMessage(`Package installation failed: ${msg}`);
            this.postError(type, 'ERR_INSTALL_PACKAGES', msg, id, senderWebview);
          }
          break;

        case MessageTypes.GET_PACKAGES:
          try {
            const targetRoot = this.getEffectiveSdkRoot();
            const pkgAdapter = new CmdlineToolsAdapter(targetRoot);
            const catalog = await pkgAdapter.getPackageCatalog();
            this.postResponse(MessageTypes.PACKAGE_CATALOG, catalog, id, senderWebview);
          } catch (pkgErr: unknown) {
            const msg = pkgErr instanceof Error ? pkgErr.message : String(pkgErr);
            this.postError(type, 'ERR_GET_PACKAGES', msg, id, senderWebview);
          }
          break;

        case MessageTypes.GET_DEVICES:
          try {
            const devices = await DeviceManager.listDevices(this.getEffectiveSdkRoot());
            this.postResponse(MessageTypes.DEVICES_LIST_DATA, devices, id, senderWebview);
          } catch (devErr: unknown) {
            const errorMsg = devErr instanceof Error ? devErr.message : String(devErr);
            this.postError(type, 'ERR_GET_DEVICES', errorMsg, id, senderWebview);
          }
          break;

        case MessageTypes.GET_DEVICE_DETAILS:
          try {
            const serial = (payload as { serial: string })?.serial;
            if (!serial) {
              throw new Error('Device serial number is required.');
            }
            const details = await DeviceManager.getDeviceDetails(serial, this.getEffectiveSdkRoot());
            this.postResponse(MessageTypes.DEVICE_DETAILS_DATA, details, id, senderWebview);
          } catch (detailErr: unknown) {
            const errorMsg = detailErr instanceof Error ? detailErr.message : String(detailErr);
            this.postError(type, 'ERR_GET_DEVICE_DETAILS', errorMsg, id, senderWebview);
          }
          break;

        case MessageTypes.SELECT_APK_FILE:
          try {
            const uris = await vscode.window.showOpenDialog({
              canSelectFiles: true,
              canSelectFolders: false,
              canSelectMany: false,
              filters: {
                'Android Package Archive': ['apk']
              },
              openLabel: 'Select APK'
            });

            if (uris && uris.length > 0) {
              this.postResponse(MessageTypes.APK_FILE_SELECTED, { filePath: uris[0].fsPath }, id, senderWebview);
            }
          } catch (pickerErr: unknown) {
            const msg = pickerErr instanceof Error ? pickerErr.message : String(pickerErr);
            this.postError(type, 'ERR_SELECT_APK', msg, id, senderWebview);
          }
          break;

        case MessageTypes.INSTALL_APK:
          try {
            const apkPayload = payload as InstallApkPayload;
            if (!apkPayload || !apkPayload.serial || !apkPayload.apkPath) {
              throw new Error('Device serial and APK file path are required.');
            }

            vscode.window.showInformationMessage(`Installing ${path.basename(apkPayload.apkPath)} onto ${apkPayload.serial}...`);
            const installRes = await DeviceManager.installApk(
              apkPayload.serial,
              apkPayload.apkPath,
              apkPayload.options,
              this.getEffectiveSdkRoot()
            );

            if (installRes.success) {
              vscode.window.showInformationMessage(`Successfully installed ${path.basename(apkPayload.apkPath)}`);
            } else {
              vscode.window.showErrorMessage(`APK Installation failed: ${installRes.message}`);
            }

            this.postResponse(MessageTypes.APK_INSTALL_RESULT, installRes, id, senderWebview);
          } catch (installErr: unknown) {
            const msg = installErr instanceof Error ? installErr.message : String(installErr);
            vscode.window.showErrorMessage(`APK Installation error: ${msg}`);
            this.postError(type, 'ERR_INSTALL_APK', msg, id, senderWebview);
          }
          break;

        case MessageTypes.REBOOT_DEVICE:
          try {
            const rebootPayload = payload as RebootPayload;
            if (!rebootPayload?.serial) {
              throw new Error('Device serial is required.');
            }

            const rebootRes = await DeviceManager.reboot(
              rebootPayload.serial,
              rebootPayload.mode || 'system',
              this.getEffectiveSdkRoot()
            );

            if (rebootRes.success) {
              vscode.window.showInformationMessage(rebootRes.message);
            } else {
              vscode.window.showErrorMessage(rebootRes.message);
            }

            this.postResponse(MessageTypes.ACTION_FEEDBACK, rebootRes, id, senderWebview);
          } catch (rebootErr: unknown) {
            const msg = rebootErr instanceof Error ? rebootErr.message : String(rebootErr);
            this.postError(type, 'ERR_REBOOT', msg, id, senderWebview);
          }
          break;

        case MessageTypes.TAKE_SCREENSHOT:
          try {
            const serial = (payload as { serial: string })?.serial;
            if (!serial) throw new Error('Device serial is required.');

            // Use workspace folder or temp directory
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            const destDir = workspaceFolder
              ? path.join(workspaceFolder, 'screenshots')
              : path.join(os.tmpdir(), 'android-dev-tool-screenshots');

            vscode.window.showInformationMessage(`Capturing screenshot from ${serial}...`);
            const savedPath = await DeviceManager.captureScreenshot(serial, destDir, this.getEffectiveSdkRoot());

            vscode.window.showInformationMessage(`Screenshot saved: ${path.basename(savedPath)}`);

            // Automatically open captured screenshot in VS Code editor
            await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(savedPath));

            this.postResponse(MessageTypes.SCREENSHOT_RESULT, { success: true, filePath: savedPath }, id, senderWebview);
          } catch (screenErr: unknown) {
            const msg = screenErr instanceof Error ? screenErr.message : String(screenErr);
            vscode.window.showErrorMessage(`Screenshot failed: ${msg}`);
            this.postError(type, 'ERR_SCREENSHOT', msg, id, senderWebview);
          }
          break;

        case MessageTypes.OPEN_DEVICE_SHELL:
          try {
            const serial = (payload as { serial: string })?.serial;
            if (!serial) throw new Error('Device serial is required.');

            const adbPath = await DeviceManager.resolveAdbPath(this.getEffectiveSdkRoot());
            const terminal = vscode.window.createTerminal({
              name: `Android: ${serial}`,
              shellPath: adbPath,
              shellArgs: ['-s', serial, 'shell']
            });
            terminal.show();
            this.postResponse(MessageTypes.ACTION_FEEDBACK, { success: true, message: 'Terminal opened' }, id, senderWebview);
          } catch (shellErr: unknown) {
            const msg = shellErr instanceof Error ? shellErr.message : String(shellErr);
            vscode.window.showErrorMessage(`Failed to open terminal shell: ${msg}`);
            this.postError(type, 'ERR_OPEN_SHELL', msg, id, senderWebview);
          }
          break;

        case MessageTypes.CONNECT_WIRELESS:
          try {
            const wirePayload = payload as WirelessConnectPayload;
            if (!wirePayload?.ip) throw new Error('IP address is required.');

            const connectRes = await DeviceManager.connectWireless(
              wirePayload.ip,
              wirePayload.port || 5555,
              this.getEffectiveSdkRoot()
            );

            if (connectRes.success) {
              vscode.window.showInformationMessage(connectRes.message);
              // Refresh devices after wireless connect
              const freshDevices = await DeviceManager.listDevices(this.getEffectiveSdkRoot());
              this.postMessage(MessageTypes.DEVICES_LIST_DATA, freshDevices);
            } else {
              vscode.window.showErrorMessage(connectRes.message);
            }

            this.postResponse(MessageTypes.ACTION_FEEDBACK, connectRes, id, senderWebview);
          } catch (wireErr: unknown) {
            const msg = wireErr instanceof Error ? wireErr.message : String(wireErr);
            this.postError(type, 'ERR_CONNECT_WIRELESS', msg, id, senderWebview);
          }
          break;

        case MessageTypes.ENABLE_TCPIP:
          try {
            const tcpPayload = payload as { serial: string; port?: number };
            if (!tcpPayload?.serial) throw new Error('Serial is required.');

            const tcpRes = await DeviceManager.enableWireless(
              tcpPayload.serial,
              tcpPayload.port || 5555,
              this.getEffectiveSdkRoot()
            );

            if (tcpRes.success) {
              vscode.window.showInformationMessage(tcpRes.message);
            } else {
              vscode.window.showErrorMessage(tcpRes.message);
            }

            this.postResponse(MessageTypes.ACTION_FEEDBACK, tcpRes, id, senderWebview);
          } catch (tcpErr: unknown) {
            const msg = tcpErr instanceof Error ? tcpErr.message : String(tcpErr);
            this.postError(type, 'ERR_ENABLE_TCPIP', msg, id, senderWebview);
          }
          break;

        case MessageTypes.GET_AVDS:
          try {
            const avds = await EmulatorManager.listAvds(this.getEffectiveSdkRoot());
            this.postResponse(MessageTypes.AVDS_LIST_DATA, avds, id, senderWebview);
          } catch (avdErr: unknown) {
            const msg = avdErr instanceof Error ? avdErr.message : String(avdErr);
            this.postError(type, 'ERR_GET_AVDS', msg, id, senderWebview);
          }
          break;

        case MessageTypes.LAUNCH_AVD:
          try {
            const launchPayload = payload as LaunchAvdPayload;
            if (!launchPayload?.name) throw new Error('AVD name is required to launch emulator.');

            vscode.window.showInformationMessage(`Starting Android emulator "${launchPayload.name}"...`);
            const launchRes = await EmulatorManager.launchAvd(
              launchPayload.name,
              launchPayload.options,
              this.getEffectiveSdkRoot()
            );

            this.postResponse(MessageTypes.AVD_ACTION_RESULT, launchRes, id, senderWebview);

            // Progressive status refreshes while emulator initializes and registers in ADB
            const intervals = [1500, 3500, 6000, 10000];
            intervals.forEach(delay => {
              setTimeout(async () => {
                try {
                  const [refreshedAvds, refreshedDevices] = await Promise.all([
                    EmulatorManager.listAvds(this.getEffectiveSdkRoot()),
                    DeviceManager.listDevices(this.getEffectiveSdkRoot())
                  ]);
                  this.postMessage(MessageTypes.AVDS_LIST_DATA, refreshedAvds);
                  this.postMessage(MessageTypes.DEVICES_LIST_DATA, refreshedDevices);
                } catch {
                  // ignore
                }
              }, delay);
            });
          } catch (launchErr: unknown) {
            const msg = launchErr instanceof Error ? launchErr.message : String(launchErr);
            vscode.window.showErrorMessage(`Failed to launch emulator: ${msg}`);
            this.postError(type, 'ERR_LAUNCH_AVD', msg, id, senderWebview);
          }
          break;

        case MessageTypes.STOP_AVD:
          try {
            const stopPayload = payload as StopAvdPayload;
            if (!stopPayload?.name) throw new Error('AVD name is required to stop emulator.');

            const stopRes = await EmulatorManager.stopAvd(
              stopPayload.name,
              stopPayload.serial,
              this.getEffectiveSdkRoot()
            );

            if (stopRes.success) {
              vscode.window.showInformationMessage(stopRes.message);
            } else {
              vscode.window.showErrorMessage(stopRes.message);
            }

            this.postResponse(MessageTypes.AVD_ACTION_RESULT, stopRes, id, senderWebview);

            // Progressive status refreshes while emulator shuts down
            const stopIntervals = [1000, 2500, 5000];
            stopIntervals.forEach(delay => {
              setTimeout(async () => {
                try {
                  const [refreshedAvds, refreshedDevices] = await Promise.all([
                    EmulatorManager.listAvds(this.getEffectiveSdkRoot()),
                    DeviceManager.listDevices(this.getEffectiveSdkRoot())
                  ]);
                  this.postMessage(MessageTypes.AVDS_LIST_DATA, refreshedAvds);
                  this.postMessage(MessageTypes.DEVICES_LIST_DATA, refreshedDevices);
                } catch {
                  // ignore
                }
              }, delay);
            });
          } catch (stopErr: unknown) {
            const msg = stopErr instanceof Error ? stopErr.message : String(stopErr);
            vscode.window.showErrorMessage(`Failed to stop emulator: ${msg}`);
            this.postError(type, 'ERR_STOP_AVD', msg, id, senderWebview);
          }
          break;

        case MessageTypes.DELETE_AVD:
          try {
            const delPayload = payload as DeleteAvdPayload;
            if (!delPayload?.name) throw new Error('AVD name is required to delete emulator.');

            const confirm = await vscode.window.showWarningMessage(
              `Are you sure you want to permanently delete virtual device "${delPayload.name}"?`,
              { modal: true },
              'Delete'
            );

            if (confirm !== 'Delete') {
              this.postResponse(MessageTypes.AVD_ACTION_RESULT, { success: false, message: 'Cancelled' }, id, senderWebview);
              break;
            }

            const delRes = await EmulatorManager.deleteAvd(delPayload.name, this.getEffectiveSdkRoot());
            if (delRes.success) {
              vscode.window.showInformationMessage(delRes.message);
            } else {
              vscode.window.showErrorMessage(delRes.message);
            }

            this.postResponse(MessageTypes.AVD_ACTION_RESULT, delRes, id, senderWebview);

            const freshAvds = await EmulatorManager.listAvds(this.getEffectiveSdkRoot());
            this.postMessage(MessageTypes.AVDS_LIST_DATA, freshAvds);
          } catch (delErr: unknown) {
            const msg = delErr instanceof Error ? delErr.message : String(delErr);
            vscode.window.showErrorMessage(`Failed to delete emulator: ${msg}`);
            this.postError(type, 'ERR_DELETE_AVD', msg, id, senderWebview);
          }
          break;

        case MessageTypes.CREATE_AVD:
          try {
            const createPayload = payload as CreateAvdPayload;
            if (!createPayload?.name || !createPayload?.packagePath) {
              throw new Error('AVD name and system image package path are required.');
            }

            const createRes = await vscode.window.withProgress(
              {
                location: vscode.ProgressLocation.Notification,
                title: `Creating Android Virtual Device "${createPayload.name}"...`,
                cancellable: false
              },
              async () => {
                return EmulatorManager.createAvd(createPayload, this.getEffectiveSdkRoot());
              }
            );

            if (createRes.success) {
              vscode.window.showInformationMessage(createRes.message);
            } else {
              vscode.window.showErrorMessage(createRes.message);
            }

            this.postResponse(MessageTypes.AVD_ACTION_RESULT, createRes, id, senderWebview);

            const freshAvds = await EmulatorManager.listAvds(this.getEffectiveSdkRoot());
            this.postMessage(MessageTypes.AVDS_LIST_DATA, freshAvds);
          } catch (createErr: unknown) {
            const msg = createErr instanceof Error ? createErr.message : String(createErr);
            vscode.window.showErrorMessage(`Failed to create emulator: ${msg}`);
            this.postError(type, 'ERR_CREATE_AVD', msg, id, senderWebview);
          }
          break;

        case MessageTypes.GET_SYSTEM_IMAGES:
          try {
            const images = await EmulatorManager.listInstalledSystemImages(this.getEffectiveSdkRoot());
            this.postResponse(MessageTypes.SYSTEM_IMAGES_DATA, images, id, senderWebview);
          } catch (sysErr: unknown) {
            const msg = sysErr instanceof Error ? sysErr.message : String(sysErr);
            this.postError(type, 'ERR_GET_SYSTEM_IMAGES', msg, id, senderWebview);
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
    const effectiveSdk = this.getEffectiveSdkRoot();
    let images: any[] = [];
    let avds: any[] = [];
    let devices: any[] = [];
    let packages: any[] = [];
    try {
      const pkgAdapter = new CmdlineToolsAdapter(effectiveSdk);
      [images, avds, devices, packages] = await Promise.all([
        EmulatorManager.listInstalledSystemImages(effectiveSdk),
        EmulatorManager.listAvds(effectiveSdk),
        DeviceManager.listDevices(effectiveSdk),
        pkgAdapter.getPackageCatalog()
      ]);
    } catch {
      // ignore
    }

    if (targetWebview) {
      targetWebview.postMessage(createMessage(MessageTypes.HEALTH_REPORT, report));
      targetWebview.postMessage(createMessage(MessageTypes.SETTINGS_DATA, this.settings));
      targetWebview.postMessage(createMessage(MessageTypes.SYSTEM_IMAGES_DATA, images));
      targetWebview.postMessage(createMessage(MessageTypes.AVDS_LIST_DATA, avds));
      targetWebview.postMessage(createMessage(MessageTypes.DEVICES_LIST_DATA, devices));
      targetWebview.postMessage(createMessage(MessageTypes.PACKAGE_CATALOG, packages));
    } else {
      this.postMessage(MessageTypes.HEALTH_REPORT, report);
      this.postMessage(MessageTypes.SETTINGS_DATA, this.settings);
      this.postMessage(MessageTypes.SYSTEM_IMAGES_DATA, images);
      this.postMessage(MessageTypes.AVDS_LIST_DATA, avds);
      this.postMessage(MessageTypes.DEVICES_LIST_DATA, devices);
      this.postMessage(MessageTypes.PACKAGE_CATALOG, packages);
    }
  }

  private getEffectiveSdkRoot(): string {
    return CmdlineToolsAdapter.resolveSdkRoot(this.settings.sdk.root);
  }

  private async getSystemHealthReport(): Promise<SystemHealthReport> {
    return SdkDiscovery.scanEnvironment(this.getEffectiveSdkRoot());
  }

  private loadSettings() {
    const stored = this.context.globalState.get<SettingsConfig>('androidDevTools.settings');
    if (stored) {
      this.settings = stored;
    }
    const canonical = CmdlineToolsAdapter.resolveSdkRoot(this.settings.sdk.root);
    if (canonical && canonical !== this.settings.sdk.root) {
      this.settings.sdk.root = canonical;
      this.persistSettings();
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

