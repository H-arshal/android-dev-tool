import React, { useState } from 'react';
import { PackageInfo } from '../../shared/types';
import { Search, CheckCircle2, DownloadCloud, RefreshCw, Layers, Check } from 'lucide-react';

interface ComponentsPageProps {
  packages?: PackageInfo[];
  isRefreshing?: boolean;
  onRefresh?: () => void;
  onInstallPackages?: (packages: string[]) => Promise<unknown>;
}

export const ComponentsPage: React.FC<ComponentsPageProps> = ({
  packages = [],
  isRefreshing = false,
  onRefresh = () => {},
  onInstallPackages
}) => {
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'installed' | 'available'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [installingPkgId, setInstallingPkgId] = useState<string | null>(null);

  // Fallback default list if no packages have been loaded yet
  const defaultPackages: PackageInfo[] = [
    {
      id: 'cmdline-tools;latest',
      description: 'Android SDK Command-line Tools (latest)',
      version: '12.0',
      isInstalled: true,
      category: 'cmdline-tools'
    },
    {
      id: 'platform-tools',
      description: 'Android SDK Platform-Tools (ADB & Fastboot)',
      version: '35.0.1',
      isInstalled: true,
      category: 'platform-tools'
    },
    {
      id: 'build-tools;34.0.0',
      description: 'Android SDK Build-Tools 34.0.0',
      version: '34.0.0',
      isInstalled: true,
      category: 'build-tools'
    },
    {
      id: 'build-tools;35.0.0',
      description: 'Android SDK Build-Tools 35.0.0',
      version: '35.0.0',
      isInstalled: false,
      category: 'build-tools'
    },
    {
      id: 'platforms;android-34',
      description: 'Android SDK Platform 34 (UpsideDownCake)',
      version: '3',
      isInstalled: true,
      category: 'platforms'
    },
    {
      id: 'platforms;android-35',
      description: 'Android SDK Platform 35 (VanillaIceCream)',
      version: '1',
      isInstalled: false,
      category: 'platforms'
    },
    {
      id: 'emulator',
      description: 'Android Emulator',
      version: '34.2.14',
      isInstalled: true,
      category: 'emulator'
    },
    {
      id: 'system-images;android-34;google_apis;x86_64',
      description: 'Google APIs Intel x86_64 Atom System Image (API 34)',
      version: '14',
      isInstalled: true,
      category: 'system-images'
    }
  ];

  const packageList = packages.length > 0 ? packages : defaultPackages;

  const totalCount = packageList.length;
  const installedCount = packageList.filter(p => p.isInstalled).length;
  const availableCount = totalCount - installedCount;

  const filtered = packageList.filter((pkg) => {
    const matchesCat = filterCategory === 'all' || pkg.category === filterCategory;
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'installed' && pkg.isInstalled) ||
      (statusFilter === 'available' && !pkg.isInstalled);
    const matchesSearch =
      pkg.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pkg.id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesStatus && matchesSearch;
  });

  const handleInstall = async (pkgId: string) => {
    if (!onInstallPackages) return;
    setInstallingPkgId(pkgId);
    try {
      await onInstallPackages([pkgId]);
      onRefresh();
    } finally {
      setInstallingPkgId(null);
    }
  };

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-4">
      {/* Header and Summary Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-vscode-border pb-3">
        <div className="space-y-0.5">
          <div className="flex items-center space-x-2">
            <Layers className="w-5 h-5 text-vscode-button-bg" />
            <h1 className="text-sm font-semibold">SDK Package Manager</h1>
          </div>
          <p className="text-xs text-vscode-muted">
            Manage official Android SDK packages, build tools, platforms, and emulator images.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {/* Summary Stat Chips */}
          <div className="flex items-center space-x-1.5 text-[11px] font-mono">
            <span className="px-2 py-0.5 rounded bg-vscode-sidebar border border-vscode-border text-vscode-muted">
              Total: <strong className="text-vscode-fg">{totalCount}</strong>
            </span>
            <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              Installed: <strong>{installedCount}</strong>
            </span>
            <span className="px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/30 text-sky-400">
              Available: <strong>{availableCount}</strong>
            </span>
          </div>

          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="px-2.5 py-1 rounded border border-vscode-border hover:bg-vscode-sidebar text-xs text-vscode-fg flex items-center space-x-1.5 transition-colors disabled:opacity-50"
            title="Scan for installed and available packages"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Scan</span>
          </button>
        </div>
      </div>

      {/* Top Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-2 justify-between">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-vscode-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search packages by name or ID (e.g. build-tools, platforms)..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded bg-vscode-input-bg border border-vscode-input-border text-vscode-input-fg focus:outline-none focus:ring-1 focus:ring-vscode-button-bg"
          />
        </div>

        {/* Status Filter Toggle */}
        <div className="flex rounded border border-vscode-border overflow-hidden text-xs shrink-0">
          {(['all', 'installed', 'available'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 capitalize transition-colors ${
                statusFilter === s
                  ? 'bg-vscode-button-bg text-vscode-button-fg font-medium'
                  : 'bg-vscode-sidebar/60 hover:bg-vscode-sidebar text-vscode-fg/75'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Category Pills */}
      <div className="flex space-x-1 overflow-x-auto scrollbar-none pb-1">
        {['all', 'cmdline-tools', 'platform-tools', 'build-tools', 'platforms', 'emulator', 'system-images'].map((cat) => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            className={`px-2.5 py-1 text-xs rounded capitalize whitespace-nowrap transition-colors ${
              filterCategory === cat
                ? 'bg-vscode-button-bg text-vscode-button-fg font-medium'
                : 'bg-vscode-sidebar/60 border border-vscode-border hover:bg-vscode-border/30 text-vscode-fg/80'
            }`}
          >
            {cat.replace('-', ' ')}
          </button>
        ))}
      </div>

      {/* Package List Table */}
      <div className="border border-vscode-border rounded overflow-hidden shadow-sm">
        <div className="bg-vscode-sidebar px-3 py-2 border-b border-vscode-border grid grid-cols-12 text-[11px] font-semibold text-vscode-muted uppercase tracking-wider">
          <span className="col-span-6">Package Name & Identifier</span>
          <span className="col-span-2">Version</span>
          <span className="col-span-2">Status</span>
          <span className="col-span-2 text-right">Action</span>
        </div>

        <div className="divide-y divide-vscode-border/40">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-xs text-vscode-muted space-y-1">
              <p>No matching SDK packages found.</p>
              <p className="text-[11px] opacity-75">Try clearing the search query or status filter.</p>
            </div>
          ) : (
            filtered.map((pkg) => {
              const isInstalling = installingPkgId === pkg.id;

              return (
                <div
                  key={pkg.id}
                  className={`px-3 py-2.5 grid grid-cols-12 items-center text-xs transition-colors hover:bg-vscode-sidebar/20 ${
                    pkg.isInstalled ? 'bg-vscode-sidebar/5' : ''
                  }`}
                >
                  {/* Name and ID */}
                  <div className="col-span-6 space-y-0.5 pr-2 min-w-0">
                    <div className="font-medium truncate text-vscode-fg">{pkg.description}</div>
                    <div className="text-[10px] text-vscode-muted font-mono truncate">{pkg.id}</div>
                  </div>

                  {/* Version */}
                  <div className="col-span-2 font-mono text-[11px] text-vscode-muted">
                    {pkg.version || 'latest'}
                  </div>

                  {/* Status Badge */}
                  <div className="col-span-2">
                    {pkg.isInstalled ? (
                      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-medium">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span>Installed</span>
                      </span>
                    ) : (
                      <span className="text-[11px] text-vscode-muted px-2 py-0.5 rounded bg-vscode-sidebar/60 border border-vscode-border/40">
                        Available
                      </span>
                    )}
                  </div>

                  {/* Action Button */}
                  <div className="col-span-2 text-right">
                    {pkg.isInstalled ? (
                      <button
                        disabled
                        className="px-2.5 py-1 rounded text-[11px] font-medium inline-flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 cursor-default opacity-90"
                        title="This package is already installed and verified in your Android SDK"
                      >
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Already Installed</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleInstall(pkg.id)}
                        disabled={isInstalling || !onInstallPackages}
                        className="px-3 py-1 rounded text-[11px] font-medium inline-flex items-center gap-1.5 bg-vscode-button-bg text-vscode-button-fg hover:bg-vscode-button-hover transition-colors shadow-sm disabled:opacity-50"
                        title={`Install ${pkg.id} via sdkmanager`}
                      >
                        {isInstalling ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Installing...</span>
                          </>
                        ) : (
                          <>
                            <DownloadCloud className="w-3.5 h-3.5" />
                            <span>Install</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
