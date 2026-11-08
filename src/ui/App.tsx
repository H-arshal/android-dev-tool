import React, { useState } from 'react';
import { useExtensionBridge } from './hooks/useExtensionBridge';
import { Navbar, TabType } from './components/Navbar';
import { Overview } from './pages/Overview';
import { SetupManager } from './pages/SetupManager';
import { ComponentsPage } from './pages/Components';
import { JDKManagerPage } from './pages/JDKManager';
import { DiagnosticsPage } from './pages/Diagnostics';
import { SettingsPage } from './pages/Settings';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const {
    healthReport,
    settings,
    installProgress,
    selectedDirectory,
    isLoading,
    refreshHealthReport,
    saveSettings,
    openDirectoryPicker,
    runAutoRepair,
    postMessage
  } = useExtensionBridge();

  const issueCount = healthReport?.issues.length ?? 0;
  const status = healthReport?.overallStatus ?? 'ready';

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
          <JDKManagerPage report={healthReport} />
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

