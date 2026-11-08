import React, { useState, useEffect } from 'react';
import { SettingsConfig } from '../../shared/types';
import { Save, RotateCcw } from 'lucide-react';
import { DEFAULT_SETTINGS } from '../../shared/constants';

interface SettingsProps {
  settings: SettingsConfig;
  onSave: (newSettings: SettingsConfig) => void;
}

export const SettingsPage: React.FC<SettingsProps> = ({ settings, onSave }) => {
  const [form, setForm] = useState<SettingsConfig>(settings);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const handleSave = () => {
    onSave(form);
  };

  const handleReset = () => {
    setForm(DEFAULT_SETTINGS);
  };

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between pb-2 border-b border-vscode-border">
        <div>
          <h2 className="text-sm font-semibold">Extension Settings</h2>
          <p className="text-xs text-vscode-muted">
            Configure default directories, environment modification boundaries, and automation.
          </p>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={handleReset}
            className="px-2.5 py-1.5 rounded bg-vscode-button-secondaryBg text-vscode-button-secondaryFg hover:bg-vscode-button-secondaryHover text-xs flex items-center gap-1 transition-colors"
          >
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1.5 rounded bg-vscode-button-bg text-vscode-button-fg hover:bg-vscode-button-hover text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            <Save className="w-3.5 h-3.5" /> Save Changes
          </button>
        </div>
      </div>

      <div className="space-y-4 text-xs">
        {/* SDK Configuration */}
        <div className="p-3.5 rounded border border-vscode-border bg-vscode-sidebar/20 space-y-3">
          <h3 className="font-semibold text-xs">SDK Configuration</h3>
          <div className="space-y-1">
            <label className="text-vscode-muted">Default SDK Root Directory</label>
            <input
              type="text"
              value={form.sdk.root || ''}
              onChange={(e) => setForm({
                ...form,
                sdk: { ...form.sdk, root: e.target.value }
              })}
              className="w-full px-3 py-1.5 rounded bg-vscode-input-bg border border-vscode-input-border text-vscode-input-fg font-mono focus:outline-none focus:ring-1 focus:ring-vscode-button-bg"
            />
          </div>
        </div>

        {/* Environment Management */}
        <div className="p-3.5 rounded border border-vscode-border bg-vscode-sidebar/20 space-y-3">
          <h3 className="font-semibold text-xs">Environment Management</h3>
          <div className="space-y-2">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.environment.configureAndroidHome}
                onChange={(e) => setForm({
                  ...form,
                  environment: { ...form.environment, configureAndroidHome: e.target.checked }
                })}
              />
              <span>Automatically configure User ANDROID_HOME variable</span>
            </label>

            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.environment.configurePath}
                onChange={(e) => setForm({
                  ...form,
                  environment: { ...form.environment, configurePath: e.target.checked }
                })}
              />
              <span>Surgically append platform-tools and cmdline-tools to User PATH</span>
            </label>

            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.environment.preserveExistingVariables}
                onChange={(e) => setForm({
                  ...form,
                  environment: { ...form.environment, preserveExistingVariables: e.target.checked }
                })}
              />
              <span>Preserve existing ANDROID_SDK_ROOT if consistent</span>
            </label>
          </div>
        </div>

        {/* Preferences */}
        <div className="p-3.5 rounded border border-vscode-border bg-vscode-sidebar/20 space-y-3">
          <h3 className="font-semibold text-xs">Preferences</h3>
          <div className="space-y-2">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.preferences.autoValidate}
                onChange={(e) => setForm({
                  ...form,
                  preferences: { ...form.preferences, autoValidate: e.target.checked }
                })}
              />
              <span>Automatically validate environment health on extension startup</span>
            </label>

            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.preferences.showInstallationNotifications}
                onChange={(e) => setForm({
                  ...form,
                  preferences: { ...form.preferences, showInstallationNotifications: e.target.checked }
                })}
              />
              <span>Show status notifications upon installation milestones</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};

