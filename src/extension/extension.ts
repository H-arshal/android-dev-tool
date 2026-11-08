import * as vscode from 'vscode';
import { DashboardViewProvider } from './providers/DashboardViewProvider';
import { MessageRouter } from './messaging/MessageRouter';

let dashboardProvider: DashboardViewProvider | undefined;

export function activate(context: vscode.ExtensionContext) {
  console.log('[Android Dev Tools] Activating extension...');

  const messageRouter = new MessageRouter(context);
  dashboardProvider = new DashboardViewProvider(context.extensionUri, messageRouter);

  // Register Webview View in Activity Bar
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      DashboardViewProvider.viewType,
      dashboardProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true
        }
      }
    )
  );

  // Command: Open Full Dashboard
  context.subscriptions.push(
    vscode.commands.registerCommand('androidDevTools.openDashboard', () => {
      if (dashboardProvider) {
        dashboardProvider.showOrRevealEditorPanel();
      }
    })
  );

  // Command: Run Diagnostics
  context.subscriptions.push(
    vscode.commands.registerCommand('androidDevTools.runDiagnostics', async () => {
      vscode.commands.executeCommand('androidDevTools.mainView.focus');
      messageRouter.postMessage('TRIGGER_DIAGNOSTICS');
      vscode.window.showInformationMessage('Android Dev Tools: Running system diagnostics...');
    })
  );

  console.log('[Android Dev Tools] Activated successfully.');
}

export function deactivate() {
  console.log('[Android Dev Tools] Deactivating extension.');
}

