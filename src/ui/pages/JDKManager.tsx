import React, { useState } from 'react';
import { Coffee, CheckCircle2, AlertCircle, Download, Check, RefreshCw, FolderCheck, ShieldAlert } from 'lucide-react';
import { SystemHealthReport, JdkInfo } from '../../shared/types';

interface JDKManagerProps {
  report: SystemHealthReport | null;
  availableJdks: JdkInfo[];
  onSelectJdk: (path: string) => void;
  onInstallManagedJdk: () => void;
  onRefreshJdks: () => void;
}

export const JDKManagerPage: React.FC<JDKManagerProps> = ({
  report,
  availableJdks,
  onSelectJdk,
  onInstallManagedJdk,
  onRefreshJdks
}) => {
  const javaDetected = report?.javaDetected ?? false;
  const javaHome = report?.javaHome ?? null;
  const [isInstalling, setIsInstalling] = useState(false);

  const handleInstallManaged = async () => {
    setIsInstalling(true);
    try {
      await onInstallManagedJdk();
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      {/* Current Active Java Card */}
      <div className="p-3.5 rounded border border-vscode-border bg-vscode-sidebar/30 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Coffee className="w-4 h-4 text-vscode-button-bg" />
            <h2 className="text-xs font-semibold">Active Java Environment (JAVA_HOME)</h2>
          </div>
          {javaDetected ? (
            <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-vscode-status-success/20 text-vscode-status-success font-medium">
              <CheckCircle2 className="w-3 h-3" /> Detected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-vscode-status-warning/20 text-vscode-status-warning font-medium">
              <AlertCircle className="w-3 h-3" /> Not Configured
            </span>
          )}
        </div>
        <div className="font-mono text-xs px-2.5 py-1.5 rounded bg-vscode-input-bg border border-vscode-input-border text-vscode-input-fg overflow-x-auto select-text">
          {javaHome || 'No JAVA_HOME configured in user or process environment'}
        </div>
        <p className="text-[11px] text-vscode-muted">
          Android Gradle Plugin (AGP) 8.x requires JDK 17 or newer to assemble and compile Android projects.
        </p>
      </div>

      {/* Managed JDK Option */}
      <div className="p-3.5 rounded border border-vscode-border bg-vscode-sidebar/20 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-semibold">Managed OpenJDK 17 LTS (Eclipse Temurin)</h3>
            <p className="text-[11px] text-vscode-muted mt-0.5">
              Isolated, enterprise-grade OpenJDK 17 installed directly into your managed Android Tools folder.
            </p>
          </div>
          <button
            onClick={handleInstallManaged}
            disabled={isInstalling}
            className="px-3 py-1.5 rounded bg-vscode-button-bg text-vscode-button-fg hover:bg-vscode-button-hover text-xs font-medium inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <Download className={`w-3.5 h-3.5 ${isInstalling ? 'animate-bounce' : ''}`} />
            {isInstalling ? 'Installing...' : 'Install Managed JDK 17'}
          </button>
        </div>
      </div>

      {/* Detected Installed JDKs on System */}
      <div className="border border-vscode-border rounded overflow-hidden">
        <div className="bg-vscode-sidebar px-3 py-2 border-b border-vscode-border flex justify-between items-center text-xs">
          <div className="flex items-center space-x-1.5">
            <span className="font-semibold">Detected Java Installations</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-vscode-badge-bg text-vscode-badge-fg font-mono">
              {availableJdks.length} found
            </span>
          </div>
          <button
            onClick={onRefreshJdks}
            className="text-[11px] text-vscode-muted hover:text-vscode-fg flex items-center gap-1 transition-colors"
            title="Rescan system for JDKs"
          >
            <RefreshCw className="w-3 h-3" /> Rescan
          </button>
        </div>

        {availableJdks.length === 0 ? (
          <div className="p-4 text-center text-xs text-vscode-muted space-y-1">
            <p>No valid Java Development Kits were detected in standard Windows directories or PATH.</p>
            <p>Click "Install Managed JDK 17" above to download and configure OpenJDK 17 automatically.</p>
          </div>
        ) : (
          <div className="divide-y divide-vscode-border/40 text-xs">
            {availableJdks.map((jdk) => {
              const isActive = javaHome && (
                jdk.path.toLowerCase() === javaHome.toLowerCase() ||
                jdk.path.toLowerCase().replace(/[\\/]+$/, '') === javaHome.toLowerCase().replace(/[\\/]+$/, '')
              );

              return (
                <div key={jdk.path} className="p-3 flex items-center justify-between hover:bg-vscode-sidebar/20 gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="font-medium text-xs truncate">{jdk.vendor} {jdk.version}</span>
                      {jdk.isCompatibleWithAgp8 ? (
                        <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.2 rounded bg-vscode-status-success/20 text-vscode-status-success font-medium">
                          <CheckCircle2 className="w-2.5 h-2.5" /> AGP 8.x Ready
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.2 rounded bg-vscode-status-warning/20 text-vscode-status-warning font-medium">
                          <ShieldAlert className="w-2.5 h-2.5" /> &lt; Java 17
                        </span>
                      )}
                      {jdk.isManaged && (
                        <span className="text-[10px] px-1 py-0.2 rounded bg-vscode-badge-bg text-vscode-badge-fg">
                          Managed
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-[10px] text-vscode-muted truncate" title={jdk.path}>
                      {jdk.path}
                    </div>
                  </div>

                  <div className="shrink-0">
                    {isActive ? (
                      <span className="inline-flex items-center gap-1 text-xs text-vscode-status-success font-semibold px-2 py-1">
                        <Check className="w-3.5 h-3.5" /> Active
                      </span>
                    ) : (
                      <button
                        onClick={() => onSelectJdk(jdk.path)}
                        className="px-2.5 py-1 rounded bg-vscode-button-secondaryBg text-vscode-button-secondaryFg hover:bg-vscode-button-secondaryHover text-[11px] font-medium flex items-center gap-1 transition-colors"
                      >
                        <FolderCheck className="w-3 h-3" /> Use this JDK
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* AGP Compatibility Reference */}
      <div className="border border-vscode-border rounded overflow-hidden">
        <div className="bg-vscode-sidebar px-3 py-2 border-b border-vscode-border font-medium text-xs">
          Android Gradle Plugin (AGP) &amp; Java Compatibility Matrix
        </div>
        <div className="divide-y divide-vscode-border/40 text-xs">
          <div className="px-3 py-2 flex justify-between">
            <span className="font-medium">AGP 8.0 &ndash; 8.8+</span>
            <span className="text-vscode-status-success font-semibold">Requires Java 17+ (Standard)</span>
          </div>
          <div className="px-3 py-2 flex justify-between">
            <span className="font-medium">AGP 7.0 &ndash; 7.4</span>
            <span className="text-vscode-muted">Requires Java 11</span>
          </div>
          <div className="px-3 py-2 flex justify-between">
            <span className="font-medium">AGP 4.x (Legacy)</span>
            <span className="text-vscode-muted">Requires Java 8</span>
          </div>
        </div>
      </div>
    </div>
  );
};
