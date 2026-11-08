import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { MessageRouter } from '../messaging/MessageRouter';

export class DashboardViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'androidDevTools.mainView';
  private view?: vscode.WebviewView;
  private currentPanel?: vscode.WebviewPanel;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly messageRouter: MessageRouter
  ) {
    this.messageRouter.setOnOpenInMainView(() => {
      this.showOrRevealEditorPanel();
    });
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'dist'),
        vscode.Uri.joinPath(this.extensionUri, 'resources')
      ]
    };

    this.messageRouter.attachWebview(webviewView.webview);
    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);
  }

  public showOrRevealEditorPanel(): vscode.WebviewPanel {
    if (this.currentPanel) {
      this.currentPanel.reveal(vscode.ViewColumn.One);
      return this.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'androidDevTools.dashboardPanel',
      'Android Dev Tools',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, 'dist'),
          vscode.Uri.joinPath(this.extensionUri, 'resources')
        ]
      }
    );

    this.currentPanel = panel;
    panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'resources', 'icons', 'android.svg');
    this.messageRouter.attachWebview(panel.webview);
    panel.webview.html = this.getHtmlForWebview(panel.webview);

    panel.onDidDispose(() => {
      this.currentPanel = undefined;
    });

    return panel;
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = getNonce();

    // Check for production built assets in dist/ui
    const distUiPath = path.join(this.extensionUri.fsPath, 'dist', 'ui');
    let scriptUri: vscode.Uri | null = null;
    let styleUri: vscode.Uri | null = null;

    if (fs.existsSync(distUiPath)) {
      const assetsPath = path.join(distUiPath, 'assets');
      if (fs.existsSync(assetsPath)) {
        const files = fs.readdirSync(assetsPath);
        const jsFile = files.find(f => f.endsWith('.js'));
        const cssFile = files.find(f => f.endsWith('.css'));

        if (jsFile) {
          scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'ui', 'assets', jsFile));
        }
        if (cssFile) {
          styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'ui', 'assets', cssFile));
        }
      }
    }

    // Fallback if built assets are not yet compiled
    if (!scriptUri) {
      scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'ui', 'assets', 'index.js'));
    }
    if (!styleUri) {
      styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'ui', 'assets', 'index.css'));
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource}; img-src ${webview.cspSource} https: data:;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" type="text/css" href="${styleUri}">
  <title>Android Dev Tools</title>
</head>
<body class="bg-vscode-bg text-vscode-fg text-sm antialiased select-none overflow-x-hidden">
  <div id="root"></div>
  <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

