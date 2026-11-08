import React, { useState } from 'react';
import { PackageInfo } from '../../shared/types';
import { Search, CheckCircle2, DownloadCloud, ArrowUpCircle, Filter } from 'lucide-react';

export const ComponentsPage: React.FC = () => {
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Initial catalog preview state
  const mockPackages: PackageInfo[] = [
    {
      id: 'cmdline-tools;latest',
      description: 'Android SDK Command-line Tools (latest)',
      version: '12.0',
      isInstalled: false,
      category: 'cmdline-tools'
    },
    {
      id: 'platform-tools',
      description: 'Android SDK Platform-Tools (ADB & Fastboot)',
      version: '35.0.1',
      isInstalled: false,
      category: 'platform-tools'
    },
    {
      id: 'build-tools;34.0.0',
      description: 'Android SDK Build-Tools 34.0.0',
      version: '34.0.0',
      isInstalled: false,
      category: 'build-tools'
    },
    {
      id: 'platforms;android-34',
      description: 'Android SDK Platform 34 (UpsideDownCake)',
      version: '3',
      isInstalled: false,
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
      isInstalled: false,
      category: 'emulator'
    }
  ];

  const filtered = mockPackages.filter((pkg) => {
    const matchesCat = filterCategory === 'all' || pkg.category === filterCategory;
    const matchesSearch = pkg.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          pkg.id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      {/* Top Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-2 justify-between">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-vscode-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search packages by name or ID..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded bg-vscode-input-bg border border-vscode-input-border text-vscode-input-fg focus:outline-none focus:ring-1 focus:ring-vscode-button-bg"
          />
        </div>
        <div className="flex space-x-1 overflow-x-auto scrollbar-none">
          {['all', 'cmdline-tools', 'platform-tools', 'build-tools', 'platforms', 'emulator'].map((cat) => (
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
      </div>

      {/* Package List Table */}
      <div className="border border-vscode-border rounded overflow-hidden">
        <div className="bg-vscode-sidebar px-3 py-2 border-b border-vscode-border grid grid-cols-12 text-[11px] font-semibold text-vscode-muted uppercase tracking-wider">
          <span className="col-span-6">Package Name & Identifier</span>
          <span className="col-span-2">Version</span>
          <span className="col-span-2">Status</span>
          <span className="col-span-2 text-right">Action</span>
        </div>
        <div className="divide-y divide-vscode-border/40">
          {filtered.map((pkg) => (
            <div key={pkg.id} className="px-3 py-2.5 grid grid-cols-12 items-center text-xs hover:bg-vscode-sidebar/20">
              <div className="col-span-6 space-y-0.5">
                <div className="font-medium">{pkg.description}</div>
                <div className="text-[10px] text-vscode-muted font-mono">{pkg.id}</div>
              </div>
              <div className="col-span-2 font-mono text-[11px] text-vscode-muted">
                {pkg.version}
              </div>
              <div className="col-span-2">
                {pkg.isInstalled ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-vscode-status-success font-medium">
                    <CheckCircle2 className="w-3 h-3" /> Installed
                  </span>
                ) : (
                  <span className="text-[11px] text-vscode-muted">Available</span>
                )}
              </div>
              <div className="col-span-2 text-right">
                <button
                  disabled={pkg.isInstalled}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium inline-flex items-center gap-1 transition-colors ${
                    pkg.isInstalled
                      ? 'opacity-40 cursor-not-allowed bg-transparent text-vscode-muted'
                      : 'bg-vscode-button-bg text-vscode-button-fg hover:bg-vscode-button-hover'
                  }`}
                >
                  <DownloadCloud className="w-3 h-3" /> Install
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

