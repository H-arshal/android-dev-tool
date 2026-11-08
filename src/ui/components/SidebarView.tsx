import React from 'react';
import { SystemHealthReport } from '../../shared/types';
import {
  Rocket,
  CheckCircle2,
  AlertTriangle,
  Folder,
  Terminal,
  Coffee,
  RefreshCw,
  ExternalLink,
  ShieldAlert
} from 'lucide-react';

interface SidebarViewProps {
  report: SystemHealthReport | null;
  isLoading: boolean;
  onOpenMainView: () => void;
  onRefresh: () => void;
}

export const SidebarView: React.FC<SidebarViewProps> = ({
  report,
  isLoading,
  onOpenMainView,
  onRefresh
}) => {
  const isReady = report?.overallStatus === 'ready';
  const issueCount = report?.issues.length ?? 0;

  return (
    <div className="p-3 space-y-4 max-w-full">
      {/* Extension Header */}
      <div className="flex items-center justify-between pb-2 border-b border-vscode-border/50">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded bg-vscode-button-bg text-vscode-button-fg flex items-center justify-center font-bold text-xs">
            AD
          </div>
          <div>
            <h1 className="text-xs font-semibold tracking-wide">Android Dev Tools</h1>
            <span className="text-[10px] text-vscode-muted font-mono">Environment Manager</span>
          </div>
        </div>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="p-1 rounded hover:bg-vscode-border/40 text-vscode-muted hover:text-vscode-fg transition-colors"
          title="Refresh environment status"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Status Card */}
      <div
        className={`p-3 rounded border flex items-start space-x-2.5 ${
          isReady
            ? 'bg-vscode-status-success/10 border-vscode-status-success/30 text-vscode-fg'
            : 'bg-vscode-status-warning/10 border-vscode-status-warning/30 text-vscode-fg'
        }`}
      >
        {isReady ? (
          <CheckCircle2 className="w-4 h-4 text-vscode-status-success shrink-0 mt-0.5" />
        ) : (
          <AlertTriangle className="w-4 h-4 text-vscode-status-warning shrink-0 mt-0.5" />
        )}
        <div className="space-y-0.5">
          <div className="text-xs font-semibold">
            {isReady ? 'Environment Ready' : 'Setup Required'}
          </div>
          <p className="text-[11px] text-vscode-muted leading-tight">
            {isReady
              ? 'SDK, Platform Tools, and Java are configured.'
              : 'Android SDK or environment variables need configuration.'}
          </p>
        </div>
      </div>

      {/* Primary Call to Action */}
      <div className="space-y-1.5 pt-1">
        <button
          onClick={onOpenMainView}
          className="w-full py-2.5 px-3 rounded bg-vscode-button-bg text-vscode-button-fg hover:bg-vscode-button-hover font-medium text-xs flex items-center justify-center gap-2 shadow-sm transition-all group"
        >
          <Rocket className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          <span>{isReady ? 'Open Full Dashboard' : 'Start Setup Now'}</span>
          <ExternalLink className="w-3 h-3 opacity-70" />
        </button>
        <p className="text-[10px] text-center text-vscode-muted">
          Opens full workspace &amp; minimizes right &amp; terminal panels
        </p>
      </div>

      {/* Brief Status Summary */}
      <div className="border border-vscode-border/60 rounded p-2.5 bg-vscode-sidebar/30 space-y-2 text-xs">
        <span className="text-[10px] uppercase font-semibold text-vscode-muted tracking-wider">
          Quick Status
        </span>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-vscode-muted flex items-center gap-1.5">
              <Folder className="w-3 h-3" /> SDK Root
            </span>
            <span className="font-mono text-[10px] truncate max-w-[140px]" title={report?.sdkRoot || 'None'}>
              {report?.sdkRoot ? 'Configured' : 'Missing'}
            </span>
          </div>

          <div className="flex items-center justify-between text-[11px]">
            <span className="text-vscode-muted flex items-center gap-1.5">
              <Terminal className="w-3 h-3" /> ADB Tool
            </span>
            <span className={`text-[10px] font-medium ${report?.adbAvailableInPath ? 'text-vscode-status-success' : 'text-vscode-status-warning'}`}>
              {report?.adbAvailableInPath ? 'In PATH' : 'Missing'}
            </span>
          </div>

          <div className="flex items-center justify-between text-[11px]">
            <span className="text-vscode-muted flex items-center gap-1.5">
              <Coffee className="w-3 h-3" /> Java Runtime
            </span>
            <span className={`text-[10px] font-medium ${report?.javaDetected ? 'text-vscode-status-success' : 'text-vscode-status-warning'}`}>
              {report?.javaDetected ? (report.javaVersion ? `v${report.javaVersion}` : 'Detected') : 'Missing'}
            </span>
          </div>
        </div>
      </div>

      {/* Issues Banner (if any) */}
      {issueCount > 0 && (
        <div
          onClick={onOpenMainView}
          className="p-2 rounded border border-vscode-status-warning/40 bg-vscode-status-warning/5 cursor-pointer hover:bg-vscode-status-warning/10 transition-colors flex items-center justify-between"
        >
          <div className="flex items-center space-x-2">
            <ShieldAlert className="w-3.5 h-3.5 text-vscode-status-warning shrink-0" />
            <span className="text-[11px] font-medium">
              {issueCount} {issueCount === 1 ? 'issue needs' : 'issues need'} review
            </span>
          </div>
          <span className="text-[10px] text-vscode-button-bg underline">Fix</span>
        </div>
      )}
    </div>
  );
};

