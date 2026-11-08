import React, { useState, useEffect } from 'react';
import { InstallationProfile, InstallProgress } from '../../shared/types';
import { Folder, Check, ArrowRight, ArrowLeft, Download, ShieldCheck, HardDrive } from 'lucide-react';

interface SetupManagerProps {
  initialPath: string | null;
  selectedDirectory: string | null;
  onOpenDirectoryPicker: () => void;
  installProgress: InstallProgress | null;
  onStartInstall: (payload: {
    rootDir: string;
    profile: InstallationProfile;
    jdkChoice: 'detect' | 'managed' | 'manual';
  }) => void;
}

export const SetupManager: React.FC<SetupManagerProps> = ({
  initialPath,
  selectedDirectory,
  onOpenDirectoryPicker,
  installProgress,
  onStartInstall
}) => {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [rootDir, setRootDir] = useState<string>(initialPath || 'C:\\Android_Tools');
  const [profile, setProfile] = useState<InstallationProfile>('physical-device');
  const [jdkChoice, setJdkChoice] = useState<'detect' | 'managed' | 'manual'>('detect');

  useEffect(() => {
    if (selectedDirectory) {
      setRootDir(selectedDirectory);
    }
  }, [selectedDirectory]);

  const steps = [
    { num: 1, title: 'Welcome' },
    { num: 2, title: 'Location' },
    { num: 3, title: 'Profile' },
    { num: 4, title: 'JDK' },
    { num: 5, title: 'Summary' },
    { num: 6, title: 'Install' },
  ];

  const handleNext = () => {
    if (currentStep < 6) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleBeginInstallation = () => {
    setCurrentStep(6);
    onStartInstall({ rootDir, profile, jdkChoice });
  };

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-5">
      {/* Stepper Header */}
      <div className="flex items-center justify-between border-b border-vscode-border pb-3 overflow-x-auto scrollbar-none">
        {steps.map((s, idx) => {
          const isDone = currentStep > s.num;
          const isCurrent = currentStep === s.num;
          return (
            <div key={s.num} className="flex items-center space-x-1.5 shrink-0">
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  isDone
                    ? 'bg-vscode-status-success text-white'
                    : isCurrent
                    ? 'bg-vscode-button-bg text-vscode-button-fg'
                    : 'bg-vscode-border text-vscode-muted'
                }`}
              >
                {isDone ? <Check className="w-3 h-3" /> : s.num}
              </div>
              <span className={`text-xs ${isCurrent ? 'font-semibold text-vscode-fg' : 'text-vscode-muted'}`}>
                {s.title}
              </span>
              {idx < steps.length - 1 && (
                <div className="w-4 h-[1px] bg-vscode-border mx-1" />
              )}
            </div>
          );
        })}
      </div>

      {/* Step Content */}
      <div className="min-h-[260px] p-4 rounded border border-vscode-border bg-vscode-sidebar/20">
        {/* Step 1: Welcome */}
        {currentStep === 1 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold">Welcome to Android Dev Tools Setup</h2>
            <p className="text-xs text-vscode-muted leading-relaxed">
              This setup wizard prepares your local machine with official Google Android command-line tools, platform tools (ADB), build tools, and compatible Java environment.
            </p>
            <div className="space-y-2 pt-2">
              <div className="flex items-start space-x-2 text-xs">
                <Check className="w-4 h-4 text-vscode-status-success shrink-0 mt-0.5" />
                <span>Zero dependency on heavy full Android Studio installations.</span>
              </div>
              <div className="flex items-start space-x-2 text-xs">
                <Check className="w-4 h-4 text-vscode-status-success shrink-0 mt-0.5" />
                <span>Automatic User-scope environment configuration (no admin prompt required).</span>
              </div>
              <div className="flex items-start space-x-2 text-xs">
                <Check className="w-4 h-4 text-vscode-status-success shrink-0 mt-0.5" />
                <span>Surgical PATH updates that will never clobber existing developer tools.</span>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Location */}
        {currentStep === 2 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold">Select Installation Directory</h2>
            <p className="text-xs text-vscode-muted">
              Choose the root directory where the Android SDK, tools, and managed JDK will be organized.
            </p>
            <div className="flex space-x-2 pt-1">
              <input
                type="text"
                value={rootDir}
                onChange={(e) => setRootDir(e.target.value)}
                className="flex-1 px-3 py-1.5 text-xs rounded bg-vscode-input-bg border border-vscode-input-border text-vscode-input-fg font-mono focus:outline-none focus:ring-1 focus:ring-vscode-button-bg"
              />
              <button
                onClick={onOpenDirectoryPicker}
                className="px-3 py-1.5 rounded bg-vscode-button-secondaryBg text-vscode-button-secondaryFg hover:bg-vscode-button-secondaryHover text-xs flex items-center gap-1.5"
              >
                <Folder className="w-3.5 h-3.5" /> Browse
              </button>
            </div>
            <div className="flex items-center space-x-2 text-[11px] text-vscode-muted pt-1">
              <HardDrive className="w-3.5 h-3.5 text-vscode-status-info" />
              <span>Recommended: Root of C: or D: drive without spaces (e.g. C:\Android_Tools).</span>
            </div>
          </div>
        )}

        {/* Step 3: Profile */}
        {currentStep === 3 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold">Choose Installation Profile</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div
                onClick={() => setProfile('physical-device')}
                className={`p-3 rounded border cursor-pointer transition-all ${
                  profile === 'physical-device'
                    ? 'border-vscode-button-bg bg-vscode-button-bg/10'
                    : 'border-vscode-border hover:border-vscode-border/80'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs">Physical Device (Recommended)</span>
                  {profile === 'physical-device' && <Check className="w-4 h-4 text-vscode-button-bg" />}
                </div>
                <p className="text-[11px] text-vscode-muted mt-1">
                  Includes Command-line Tools, Platform Tools (ADB), Build Tools, and Android Platform.
                </p>
                <span className="inline-block mt-2 text-[10px] px-1.5 py-0.5 rounded bg-vscode-badge-bg text-vscode-badge-fg font-mono">
                  ~2.5 GB download
                </span>
              </div>

              <div
                onClick={() => setProfile('full-setup')}
                className={`p-3 rounded border cursor-pointer transition-all ${
                  profile === 'full-setup'
                    ? 'border-vscode-button-bg bg-vscode-button-bg/10'
                    : 'border-vscode-border hover:border-vscode-border/80'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs">Full Setup (with Emulator)</span>
                  {profile === 'full-setup' && <Check className="w-4 h-4 text-vscode-button-bg" />}
                </div>
                <p className="text-[11px] text-vscode-muted mt-1">
                  Adds Android Virtual Device (AVD) emulator binary and system images for PC emulation.
                </p>
                <span className="inline-block mt-2 text-[10px] px-1.5 py-0.5 rounded bg-vscode-badge-bg text-vscode-badge-fg font-mono">
                  ~12 GB download
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: JDK */}
        {currentStep === 4 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold">Java Development Kit (JDK) Configuration</h2>
            <div className="space-y-2 pt-1">
              <label className="flex items-start space-x-2.5 p-2 rounded border border-vscode-border cursor-pointer hover:bg-vscode-sidebar/40">
                <input
                  type="radio"
                  name="jdk"
                  checked={jdkChoice === 'detect'}
                  onChange={() => setJdkChoice('detect')}
                  className="mt-0.5"
                />
                <div>
                  <span className="text-xs font-medium">Detect Existing System Java</span>
                  <p className="text-[11px] text-vscode-muted">
                    Inspects JAVA_HOME and PATH. Recommended if you already have OpenJDK 17 installed.
                  </p>
                </div>
              </label>

              <label className="flex items-start space-x-2.5 p-2 rounded border border-vscode-border cursor-pointer hover:bg-vscode-sidebar/40">
                <input
                  type="radio"
                  name="jdk"
                  checked={jdkChoice === 'managed'}
                  onChange={() => setJdkChoice('managed')}
                  className="mt-0.5"
                />
                <div>
                  <span className="text-xs font-medium">Install Managed OpenJDK 17 (Recommended)</span>
                  <p className="text-[11px] text-vscode-muted">
                    Downloads Eclipse Temurin OpenJDK 17 into a private folder inside your Android Tools root.
                  </p>
                </div>
              </label>
            </div>
          </div>
        )}

        {/* Step 5: Summary */}
        {currentStep === 5 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold">Ready to Install</h2>
            <div className="space-y-1.5 text-xs divide-y divide-vscode-border/40">
              <div className="flex justify-between py-1">
                <span className="text-vscode-muted">Target Directory:</span>
                <span className="font-mono">{rootDir}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-vscode-muted">Profile:</span>
                <span className="capitalize">{profile.replace('-', ' ')}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-vscode-muted">JDK Strategy:</span>
                <span className="capitalize">{jdkChoice}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-vscode-muted">Environment Variables:</span>
                <span>User ANDROID_HOME & PATH</span>
              </div>
            </div>
          </div>
        )}

        {/* Step 6: Install */}
        {currentStep === 6 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Download className="w-4 h-4 animate-bounce text-vscode-button-bg" />
              Installation in Progress
            </h2>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span>{installProgress?.currentTask || 'Initializing installation tasks...'}</span>
                <span>{installProgress?.percentage ? `${installProgress.percentage}%` : 'Working...'}</span>
              </div>
              <div className="w-full bg-vscode-border h-2 rounded overflow-hidden">
                <div
                  className="bg-vscode-button-bg h-full transition-all duration-300"
                  style={{ width: `${installProgress?.percentage || 20}%` }}
                />
              </div>
              <p className="text-[11px] text-vscode-muted italic">
                {installProgress?.message || 'Validating drive space and preparing download pipeline.'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Wizard Footer Controls */}
      {currentStep < 6 && (
        <div className="flex justify-between items-center pt-2">
          <button
            onClick={handleBack}
            disabled={currentStep === 1}
            className={`px-3 py-1.5 rounded text-xs flex items-center gap-1.5 ${
              currentStep === 1
                ? 'opacity-40 cursor-not-allowed text-vscode-muted'
                : 'bg-vscode-button-secondaryBg text-vscode-button-secondaryFg hover:bg-vscode-button-secondaryHover'
            }`}
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>

          {currentStep < 5 ? (
            <button
              onClick={handleNext}
              className="px-3.5 py-1.5 rounded bg-vscode-button-bg text-vscode-button-fg hover:bg-vscode-button-hover text-xs font-medium flex items-center gap-1.5"
            >
              Next <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={handleBeginInstallation}
              className="px-4 py-1.5 rounded bg-vscode-status-success text-white font-medium text-xs flex items-center gap-1.5"
            >
              <ShieldCheck className="w-3.5 h-3.5" /> Start Installation
            </button>
          )}
        </div>
      )}
    </div>
  );
};

