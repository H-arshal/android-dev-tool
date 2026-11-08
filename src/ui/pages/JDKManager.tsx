import React from 'react';
import { Coffee, CheckCircle2, AlertCircle, Download, ExternalLink } from 'lucide-react';
import { SystemHealthReport } from '../../shared/types';

interface JDKManagerProps {
  report: SystemHealthReport | null;
}

export const JDKManagerPage: React.FC<JDKManagerProps> = ({ report }) => {
  const javaDetected = report?.javaDetected ?? false;
  const javaHome = report?.javaHome ?? null;

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
            <h3 className="text-xs font-semibold">Managed OpenJDK 17 LTS</h3>
            <p className="text-[11px] text-vscode-muted mt-0.5">
              Eclipse Temurin OpenJDK 17, installed into your managed Android Tools folder.
            </p>
          </div>
          <button className="px-3 py-1.5 rounded bg-vscode-button-bg text-vscode-button-fg hover:bg-vscode-button-hover text-xs font-medium inline-flex items-center gap-1.5 transition-colors">
            <Download className="w-3.5 h-3.5" /> Install Managed JDK 17
          </button>
        </div>
      </div>

      {/* AGP Compatibility Reference */}
      <div className="border border-vscode-border rounded overflow-hidden">
        <div className="bg-vscode-sidebar px-3 py-2 border-b border-vscode-border font-medium text-xs">
          Android Gradle Plugin (AGP) & Java Compatibility Matrix
        </div>
        <div className="divide-y divide-vscode-border/40 text-xs">
          <div className="px-3 py-2 flex justify-between">
            <span className="font-medium">AGP 8.0 — 8.8+</span>
            <span className="text-vscode-status-success font-semibold">Requires Java 17+ (Standard)</span>
          </div>
          <div className="px-3 py-2 flex justify-between">
            <span className="font-medium">AGP 7.0 — 7.4</span>
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

