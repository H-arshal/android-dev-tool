import React from 'react';
import { SystemHealthReport } from '../../shared/types';
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw, Folder, Terminal, Coffee, FileCheck, ArrowRight } from 'lucide-react';
import { TabType } from '../components/Navbar';

interface OverviewProps {
  report: SystemHealthReport | null;
  onRefresh: () => void;
  onNavigate: (tab: TabType) => void;
  isLoading: boolean;
}

export const Overview: React.FC<OverviewProps> = ({ report, onRefresh, onNavigate, isLoading }) => {
  if (isLoading || !report) {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-3 text-vscode-muted">
        <RefreshCw className="w-5 h-5 animate-spin text-vscode-button-bg" />
        <span className="text-xs">Inspecting Android environment...</span>
      </div>
    );
  }

  const isReady = report.overallStatus === 'ready';

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto">
      {/* Status Banner */}
      <div className={`p-3 rounded border flex items-start justify-between ${
        isReady
          ? 'bg-vscode-status-success/10 border-vscode-status-success/30 text-vscode-fg'
          : 'bg-vscode-status-warning/10 border-vscode-status-warning/30 text-vscode-fg'
      }`}>
        <div className="flex items-start space-x-2.5">
          {isReady ? (
            <CheckCircle2 className="w-5 h-5 text-vscode-status-success shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-vscode-status-warning shrink-0 mt-0.5" />
          )}
          <div>
            <h3 className="font-semibold text-xs leading-none">
              {isReady ? 'Environment Configured & Ready' : 'Environment Needs Attention'}
            </h3>
            <p className="text-xs text-vscode-muted mt-1">
              {isReady
                ? 'Your Android SDK, command-line tools, and Java runtime are ready for development.'
                : 'Android tools or environment variables need configuration before building.'}
            </p>
          </div>
        </div>
        <button
          onClick={onRefresh}
          className="p-1.5 rounded hover:bg-vscode-border/30 text-vscode-muted hover:text-vscode-fg transition-colors"
          title="Refresh inspection"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Directory Location Card */}
      <div className="p-3 rounded border border-vscode-border bg-vscode-sidebar/40 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-vscode-muted flex items-center gap-1.5">
            <Folder className="w-3.5 h-3.5" /> Active SDK Directory (ANDROID_HOME)
          </span>
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-vscode-badge-bg text-vscode-badge-fg font-mono">
            {report.isCustomSdk ? 'Custom / Detected' : 'Managed Default'}
          </span>
        </div>
        <div className="font-mono text-xs px-2.5 py-1.5 rounded bg-vscode-input-bg border border-vscode-input-border select-text overflow-x-auto">
          {report.sdkRoot || 'Not configured'}
        </div>
      </div>

      {/* Quick Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-2.5 rounded border border-vscode-border bg-vscode-sidebar/20 space-y-1">
          <span className="text-[11px] text-vscode-muted flex items-center gap-1">
            <Terminal className="w-3 h-3" /> ADB Status
          </span>
          <div className="flex items-center gap-1.5">
            {report.adbAvailableInPath ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-vscode-status-success" />
            ) : (
              <XCircle className="w-3.5 h-3.5 text-vscode-status-warning" />
            )}
            <span className="text-xs font-medium">
              {report.adbAvailableInPath ? 'Available' : 'Missing in PATH'}
            </span>
          </div>
        </div>

        <div className="p-2.5 rounded border border-vscode-border bg-vscode-sidebar/20 space-y-1">
          <span className="text-[11px] text-vscode-muted flex items-center gap-1">
            <Coffee className="w-3 h-3" /> Java Runtime
          </span>
          <div className="flex items-center gap-1.5">
            {report.javaDetected ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-vscode-status-success" />
            ) : (
              <XCircle className="w-3.5 h-3.5 text-vscode-status-warning" />
            )}
            <span className="text-xs font-medium">
              {report.javaDetected ? 'Detected' : 'Not Found'}
            </span>
          </div>
        </div>

        <div className="p-2.5 rounded border border-vscode-border bg-vscode-sidebar/20 space-y-1">
          <span className="text-[11px] text-vscode-muted flex items-center gap-1">
            <FileCheck className="w-3 h-3" /> SDK Licenses
          </span>
          <div className="flex items-center gap-1.5">
            {report.licensesAccepted ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-vscode-status-success" />
            ) : (
              <XCircle className="w-3.5 h-3.5 text-vscode-status-warning" />
            )}
            <span className="text-xs font-medium">
              {report.licensesAccepted ? 'Accepted' : 'Pending'}
            </span>
          </div>
        </div>

        <div className="p-2.5 rounded border border-vscode-border bg-vscode-sidebar/20 space-y-1">
          <span className="text-[11px] text-vscode-muted flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Issues
          </span>
          <span className="text-xs font-medium">
            {report.issues.length} {report.issues.length === 1 ? 'issue' : 'issues'} detected
          </span>
        </div>
      </div>

      {/* Component Health Breakdown */}
      <div className="border border-vscode-border rounded overflow-hidden">
        <div className="bg-vscode-sidebar px-3 py-2 border-b border-vscode-border font-medium text-xs flex justify-between items-center">
          <span>Component Health</span>
          <button
            onClick={() => onNavigate('components')}
            className="text-[11px] text-vscode-button-bg hover:underline flex items-center gap-0.5"
          >
            Manage Packages <ArrowRight className="w-3 h-3" />
          </button>
        </div>
        <div className="divide-y divide-vscode-border/50">
          {report.components.map((comp) => (
            <div key={comp.id} className="px-3 py-2 flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2">
                {comp.isInstalled ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-vscode-status-success" />
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full border border-vscode-muted flex items-center justify-center">
                    <span className="w-1 h-1 rounded-full bg-vscode-muted" />
                  </div>
                )}
                <span className="font-medium">{comp.name}</span>
              </div>
              <span className={`text-[11px] ${comp.isInstalled ? 'text-vscode-status-success' : 'text-vscode-muted'}`}>
                {comp.version ? `v${comp.version}` : comp.statusText}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Action Buttons */}
      <div className="flex flex-wrap gap-2 pt-2">
        <button
          onClick={() => onNavigate('setup')}
          className="px-3 py-1.5 rounded bg-vscode-button-bg text-vscode-button-fg hover:bg-vscode-button-hover font-medium text-xs flex items-center gap-1.5 transition-colors"
        >
          <ArrowRight className="w-3.5 h-3.5" /> Open Setup Wizard
        </button>
        {report.issues.length > 0 && (
          <button
            onClick={() => onNavigate('diagnostics')}
            className="px-3 py-1.5 rounded bg-vscode-button-secondaryBg text-vscode-button-secondaryFg hover:bg-vscode-button-secondaryHover text-xs flex items-center gap-1.5 transition-colors"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-vscode-status-warning" /> Review Diagnostics ({report.issues.length})
          </button>
        )}
      </div>
    </div>
  );
};

