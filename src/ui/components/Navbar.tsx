import React from 'react';
import { LayoutDashboard, Wrench, Layers, Coffee, AlertCircle, Settings } from 'lucide-react';
import { HealthStatus } from '../../shared/types';

export type TabType = 'overview' | 'setup' | 'components' | 'jdk' | 'diagnostics' | 'settings';

interface NavbarProps {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
  status?: HealthStatus;
  issueCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, onSelectTab, status = 'ready', issueCount = 0 }) => {
  const tabs = [
    { id: 'overview' as TabType, label: 'Overview', icon: LayoutDashboard },
    { id: 'setup' as TabType, label: 'Setup Manager', icon: Wrench },
    { id: 'components' as TabType, label: 'SDK Packages', icon: Layers },
    { id: 'jdk' as TabType, label: 'JDK Manager', icon: Coffee },
    { id: 'diagnostics' as TabType, label: 'Diagnostics', icon: AlertCircle, badge: issueCount },
    { id: 'settings' as TabType, label: 'Settings', icon: Settings },
  ];

  const getStatusColor = () => {
    switch (status) {
      case 'ready': return 'bg-vscode-status-success';
      case 'warning': return 'bg-vscode-status-warning';
      case 'error': return 'bg-vscode-status-error';
    }
  };

  return (
    <header className="border-b border-vscode-border bg-vscode-sidebar sticky top-0 z-30">
      <div className="flex items-center justify-between px-3 py-2 border-b border-vscode-border/40">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 flex items-center justify-center rounded bg-vscode-button-bg text-vscode-button-fg">
            <span className="font-bold text-xs">AD</span>
          </div>
          <div>
            <span className="font-semibold text-xs tracking-wide">Android Dev Tools</span>
            <span className="ml-1.5 text-[10px] px-1 py-0.2 rounded bg-vscode-badge-bg text-vscode-badge-fg font-mono">v0.1.0</span>
          </div>
        </div>
        <div className="flex items-center space-x-1.5 text-xs text-vscode-muted">
          <span className={`w-2 h-2 rounded-full ${getStatusColor()}`}></span>
          <span className="capitalize text-[11px]">{status}</span>
        </div>
      </div>

      <nav className="flex space-x-1 px-2 overflow-x-auto py-1 scrollbar-none">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={`flex items-center space-x-1.5 px-2.5 py-1.5 text-xs rounded transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-vscode-button-bg text-vscode-button-fg font-medium'
                  : 'text-vscode-fg/75 hover:bg-vscode-border/30 hover:text-vscode-fg'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {typeof tab.badge === 'number' && tab.badge > 0 && (
                <span className="ml-1 px-1 py-0.1 text-[10px] rounded-full bg-vscode-status-warning text-black font-semibold">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </header>
  );
};

