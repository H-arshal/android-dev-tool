/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/ui/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        vscode: {
          bg: 'var(--vscode-editor-background)',
          fg: 'var(--vscode-editor-foreground)',
          muted: 'var(--vscode-descriptionForeground)',
          sidebar: 'var(--vscode-sideBar-background)',
          border: 'var(--vscode-widget-border, var(--vscode-editorWidget-border, rgba(128,128,128,0.2)))',
          input: {
            bg: 'var(--vscode-input-background)',
            fg: 'var(--vscode-input-foreground)',
            border: 'var(--vscode-input-border)'
          },
          button: {
            bg: 'var(--vscode-button-background)',
            fg: 'var(--vscode-button-foreground)',
            hover: 'var(--vscode-button-hoverBackground)',
            secondaryBg: 'var(--vscode-button-secondaryBackground)',
            secondaryFg: 'var(--vscode-button-secondaryForeground)',
            secondaryHover: 'var(--vscode-button-secondaryHoverBackground)'
          },
          badge: {
            bg: 'var(--vscode-badge-background)',
            fg: 'var(--vscode-badge-foreground)'
          },
          status: {
            success: 'var(--vscode-testing-iconPassed, #388e3c)',
            warning: 'var(--vscode-editorWarning-foreground, #cca700)',
            error: 'var(--vscode-editorError-foreground, #e53935)',
            info: 'var(--vscode-editorInfo-foreground, #1e88e5)'
          }
        }
      }
    }
  },
  plugins: []
};

