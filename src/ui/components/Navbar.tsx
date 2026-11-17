import React from 'react';
import { LayoutDashboard, Wrench, Layers, Coffee, Smartphone, AlertCircle, Settings, Maximize2 } from 'lucide-react';
import { HealthStatus } from '../../shared/types';

export type TabType = 'overview' | 'setup' | 'components' | 'jdk' | 'devices' | 'diagnostics' | 'settings';

interface NavbarProps {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
  status?: HealthStatus;
  issueCount?: number;
  deviceCount?: number;
  onOpenInMainView?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onSelectTab,
  status = 'ready',
  issueCount = 0,
  deviceCount,
  onOpenInMainView
}) => {
  const tabs = [
    { id: 'overview' as TabType, label: 'Overview', icon: LayoutDashboard },
    { id: 'setup' as TabType, label: 'Setup Manager', icon: Wrench },
    { id: 'components' as TabType, label: 'SDK Manager', icon: Layers },
    { id: 'jdk' as TabType, label: 'JDK Manager', icon: Coffee },
    { id: 'devices' as TabType, label: 'Device Manager', icon: Smartphone, badge: deviceCount },
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
          <div className="w-6 h-6 flex items-center justify-center rounded bg-slate-900 border border-emerald-500/40 text-emerald-400 shrink-0">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 16a7 7 0 0 1 14 0Z" />
              <circle cx="9" cy="12.5" r="0.75" fill="currentColor" stroke="none" />
              <circle cx="15" cy="12.5" r="0.75" fill="currentColor" stroke="none" />
              <line x1="7.5" y1="8" x2="6" y2="5.5" />
              <line x1="16.5" y1="8" x2="18" y2="5.5" />
            </svg>
          </div>
          <div>
            <span className="font-semibold text-xs tracking-wide">Android Dev Tools</span>
            <span className="ml-1.5 text-[10px] px-1 py-0.2 rounded bg-vscode-badge-bg text-vscode-badge-fg font-mono">v0.1.0</span>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1.5 text-xs text-vscode-muted">
            <span className={`w-2 h-2 rounded-full ${getStatusColor()}`}></span>
            <span className="capitalize text-[11px]">{status}</span>
          </div>
          {onOpenInMainView && (
            <button
              onClick={onOpenInMainView}
              className="p-1 rounded hover:bg-vscode-border/40 text-vscode-muted hover:text-vscode-fg transition-colors"
              title="Open in Main Editor Tab (Full View)"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}
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

