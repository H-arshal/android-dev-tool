import React, { useState } from 'react';
import { DiagnosticIssue } from '../../shared/types';
import { AlertCircle, AlertTriangle, CheckCircle2, Wrench, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

interface DiagnosticsProps {
  issues: DiagnosticIssue[];
  onRefresh: () => void;
  onRunAutoRepair: (issueId: string) => void;
  isLoading: boolean;
}

export const DiagnosticsPage: React.FC<DiagnosticsProps> = ({
  issues,
  onRefresh,
  onRunAutoRepair,
  isLoading
}) => {
  const [expandedIssue, setExpandedIssue] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedIssue(expandedIssue === id ? null : id);
  };

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      {/* Diagnostics Header */}
      <div className="flex items-center justify-between pb-2 border-b border-vscode-border">
        <div>
          <h2 className="text-sm font-semibold">Environment Diagnostics</h2>
          <p className="text-xs text-vscode-muted">
            Continuous health checks for PATH entries, SDK permissions, and tool compatibility.
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="px-3 py-1.5 rounded bg-vscode-button-bg text-vscode-button-fg hover:bg-vscode-button-hover text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Run Health Check
        </button>
      </div>

      {/* Issues List or Empty State */}
      {issues.length === 0 ? (
        <div className="p-8 border border-vscode-border rounded text-center space-y-2 bg-vscode-sidebar/20">
          <CheckCircle2 className="w-8 h-8 text-vscode-status-success mx-auto" />
          <h3 className="text-xs font-semibold">All Systems Operational</h3>
          <p className="text-xs text-vscode-muted max-w-sm mx-auto">
            No broken paths, unaccepted licenses, or conflicting environment variables were detected.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {issues.map((issue) => {
            const isExpanded = expandedIssue === issue.id;
            return (
              <div
                key={issue.id}
                className="border border-vscode-border rounded overflow-hidden bg-vscode-sidebar/20"
              >
                <div className="p-3 flex items-start justify-between gap-3">
                  <div className="flex items-start space-x-2.5">
                    {issue.severity === 'error' ? (
                      <AlertCircle className="w-4 h-4 text-vscode-status-error shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-vscode-status-warning shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs">{issue.title}</span>
                        <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-vscode-badge-bg text-vscode-badge-fg">
                          {issue.severity}
                        </span>
                      </div>
                      <p className="text-xs text-vscode-muted">{issue.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1.5 shrink-0">
                    {issue.canAutoFix && (
                      <button
                        onClick={() => onRunAutoRepair(issue.id)}
                        className="px-2.5 py-1 rounded bg-vscode-button-bg text-vscode-button-fg hover:bg-vscode-button-hover text-xs font-medium inline-flex items-center gap-1 transition-colors"
                      >
                        <Wrench className="w-3 h-3" /> Fix Automatically
                      </button>
                    )}
                    <button
                      onClick={() => toggleExpand(issue.id)}
                      className="p-1 rounded hover:bg-vscode-border/40 text-vscode-muted hover:text-vscode-fg"
                      title="Show details"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-3 pb-3 pt-1 border-t border-vscode-border/40 bg-vscode-bg/50 space-y-2 text-xs">
                    {issue.detectedPath && (
                      <div>
                        <span className="text-vscode-muted">Detected Path: </span>
                        <span className="font-mono text-[11px]">{issue.detectedPath}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-vscode-muted font-medium">Recommended Solution:</span>
                      <p className="text-xs mt-0.5 text-vscode-fg/90">{issue.solution}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

