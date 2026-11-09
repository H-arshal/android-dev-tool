import React, { useState } from 'react';
import { useExtensionBridge } from './hooks/useExtensionBridge';
import { Navbar, TabType } from './components/Navbar';
import { SidebarView } from './components/SidebarView';
import { Overview } from './pages/Overview';
import { SetupManager } from './pages/SetupManager';
import { ComponentsPage } from './pages/Components';
import { JDKManagerPage } from './pages/JDKManager';
import { DiagnosticsPage } from './pages/Diagnostics';
import { SettingsPage } from './pages/Settings';

declare global {
  interface Window {
    __VIEW_MODE__?: 'sidebar' | 'editor';
  }
}

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const viewMode = window.__VIEW_MODE__ || 'editor';
  const isSidebar = viewMode === 'sidebar';

  const {
    healthReport,
    settings,
    installProgress,
    selectedDirectory,
    availableJdks,
    isLoading,
    refreshHealthReport,
    fetchJdks,
    setJdkConfig,
    installManagedJdk,
    saveSettings,
    openDirectoryPicker,
    runAutoRepair,
    postMessage
  } = useExtensionBridge();

  const issueCount = healthReport?.issues.length ?? 0;
  const status = healthReport?.overallStatus ?? 'ready';

  // If running inside the narrow Activity Bar sidebar
  if (isSidebar) {
    return (
      <div className="min-h-screen bg-vscode-sidebar text-vscode-fg">
        <SidebarView
          report={healthReport}
          isLoading={isLoading}
          onOpenMainView={() => postMessage('OPEN_IN_MAIN_VIEW')}
          onRefresh={refreshHealthReport}
        />
      </div>
    );
  }

  // If running in the expansive Main Editor View
  return (
    <div className="min-h-screen flex flex-col bg-vscode-bg text-vscode-fg">
      <Navbar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        status={status}
        issueCount={issueCount}
      />

      <main className="flex-1 overflow-y-auto">
        {activeTab === 'overview' && (
          <Overview
            report={healthReport}
            onRefresh={refreshHealthReport}
            onNavigate={setActiveTab}
            isLoading={isLoading}
          />
        )}

        {activeTab === 'setup' && (
          <SetupManager
            initialPath={settings.sdk.root}
            selectedDirectory={selectedDirectory}
            onOpenDirectoryPicker={openDirectoryPicker}
            installProgress={installProgress}
            onStartInstall={(payload) => postMessage('START_INSTALLATION', payload)}
          />
        )}

        {activeTab === 'components' && (
          <ComponentsPage />
        )}

        {activeTab === 'jdk' && (
          <JDKManagerPage
            report={healthReport}
            availableJdks={availableJdks}
            onSelectJdk={(customPath) => setJdkConfig('manual', customPath)}
            onInstallManagedJdk={() => installManagedJdk()}
            onRefreshJdks={fetchJdks}
          />
        )}

        {activeTab === 'diagnostics' && (
          <DiagnosticsPage
            issues={healthReport?.issues || []}
            onRefresh={refreshHealthReport}
            onRunAutoRepair={runAutoRepair}
            isLoading={isLoading}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsPage
            settings={settings}
            onSave={saveSettings}
          />
        )}
      </main>
    </div>
  );
};

