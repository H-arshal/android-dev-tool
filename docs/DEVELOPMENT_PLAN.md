# Phase 1: Development Plan & Milestone Roadmap

This document outlines the sequential, milestone-driven execution plan for the **Android Dev Tools** VS Code extension (Phase 1: Environment Manager MVP).

---

## 1. Milestone Overview

The development of Phase 1 is divided into 6 distinct milestones. Each milestone produces a testable deliverable and builds upon the preceding milestone without circular dependencies.

```mermaid
flowchart LR
    M1[M1: Extension Foundation] --> M2[M2: SDK Discovery]
    M2 --> M3[M3: Installation Engine]
    M3 --> M4[M4: JDK Management]
    M4 --> M5[M5: Environment Config]
    M5 --> M6[M6: Diagnostics & Testing]
```

---

## 2. Detailed Milestone Breakdown

### Milestone 1 : Extension Foundation & Webview Infrastructure
**Objective:** Initialize the project skeleton, configure the build toolchain, establish typed IPC between Extension Host and React Webview, and deliver the shell UI.

- [x] **Task 1.1: Project Toolchain & Build Setup**
  - Scaffold `package.json` with extension manifest (`contributes.viewsContainers`, `contributes.views`, `commands`).
  - Configure `tsconfig.json` with strict type checking.
  - Setup `vite.config.ts` for React + Tailwind CSS Webview bundling.
  - Setup `esbuild.js` for fast Extension Host compilation.
- [x] **Task 1.2: Activity Bar & View Container Registration**
  - Register `androidDevTools.mainView` in the VS Code Activity Bar.
  - Implement `WebviewViewProvider` (`DashboardViewProvider.ts`) with Content Security Policy and nonce generation.
- [x] **Task 1.3: Typed IPC Messaging Bridge**
  - Define message contracts in `src/shared/messages.ts` and `src/shared/types.ts`.
  - Implement `MessageRouter` in Extension Host and `useExtensionBridge` React hook in Webview.
- [x] **Task 1.4: Base UI Shell & Page Routing**
  - Build the React shell (`App.tsx`) with tabbed navigation: Overview, Setup Manager, Components, JDK Manager, Diagnostics, Settings.
  - Integrate Tailwind CSS styling aligned with VS Code theme variables.

**Deliverable:** A functional VS Code extension that loads in the Activity Bar with interactive, styled navigation tabs and verified bidirectional messaging. *(Completed & Verified)*

---

### Milestone 2 : SDK Discovery & Environment Detection
**Objective:** Implement non-destructive inspection of the host system to discover existing Android SDKs, tools, and Java installations before any installation actions are taken.

- [x] **Task 2.1: Environment Variable & Path Detection**
  - Probe `process.env.ANDROID_HOME` and legacy `process.env.ANDROID_SDK_ROOT`.
  - Read user environment variables from Windows Registry (`HKCU:\Environment`).
  - Inspect `PATH` for `platform-tools`, `cmdline-tools`, and `emulator` directories.
- [x] **Task 2.2: Binary Probe & Validation**
  - Probe `adb.exe` presence, version (`adb version`), and operational status.
  - Probe `sdkmanager.bat` presence and executable permissions.
  - Probe `java.exe` in `JAVA_HOME` and `PATH`, parsing `java -version`.
- [x] **Task 2.3: Installed Component Enumeration**
  - Scan SDK root directories (`platforms/`, `build-tools/`, `platform-tools/`).
  - Read package versions from `source.properties` files inside installed packages.
- [x] **Task 2.4: System Health Report Compilation**
  - Synthesize discovered paths, binary versions, and missing elements into a `SystemHealthReport`.
  - Push the report via IPC to the Webview to populate the Overview dashboard.

**Deliverable:** An accurate system inspection engine that displays existing tools and configurations on the Overview dashboard without writing any files. *(Completed & Verified)*

---

### Milestone 3 : SDK Installation Engine
**Objective:** Build a resilient, streaming installer capable of downloading official Google command-line tools, unpacking them into the required structure, installing base SDK packages, and managing licenses.

- [x] **Task 3.1: Directory Selection & Pre-flight Validation**
  - Provide an interactive drive/directory selector in the Setup Wizard.
  - Validate write permissions and query available disk space via Node.js/PowerShell.
- [x] **Task 3.2: Streaming Downloader with SHA-256 Checksum**
  - Implement HTTP streaming downloader with resume support for interrupted transfers.
  - Calculate SHA-256 hash incrementally and verify against known Google digests.
- [x] **Task 3.3: Canonical Archive Extraction**
  - Extract `commandlinetools-win-*.zip` into `<sdk-root>/cmdline-tools/latest/`.
  - Ensure correct nested directory structure expected by `sdkmanager.bat`.
- [x] **Task 3.4: Package Installation & License Flow**
  - Implement `AndroidPackageManager` adapter around `sdkmanager.bat`.
  - Install selected profile packages (`platform-tools`, `build-tools`, `platforms`).
  - Implement automated/explicit license acceptance (writing valid license hashes to `<sdk-root>/licenses/`).
  - Dispatch real-time progress events (bytes, current package, state) to the Webview.

**Deliverable:** A working installer that can prepare a fresh, functional Android SDK from scratch into a user-specified directory. *(Completed & Verified)*

---

### Milestone 4 : JDK Management
**Objective:** Guarantee a compatible Java Development Kit is available and configured for Android Gradle builds.

- [x] **Task 4.1: Java Version & AGP Compatibility Inspector**
  - Detect installed JDK versions on the machine.
  - Validate detected version against Android Gradle Plugin (AGP 8.x requires JDK 17).
- [x] **Task 4.2: Manual JDK Configuration**
  - Allow users to browse and link existing local JDK installations.
  - Validate that selected folder contains `bin/java.exe` and `bin/javac.exe`.
- [x] **Task 4.3: Managed JDK Installer**
  - Download official headless OpenJDK (e.g. Eclipse Temurin 17 for Windows x64).
  - Verify checksum and extract to `<install-root>/jdk/managed/`.
- [x] **Task 4.4: JAVA_HOME Orchestration**
  - Configure user-level `JAVA_HOME` to point to the selected or managed JDK.
  - Provide safety checks to preserve existing enterprise Java setups unless explicitly authorized.

**Deliverable:** Reliable Java detection, manual linking, or one-click managed JDK installation ensuring full Gradle build readiness. *(Completed & Verified)*

---

### Milestone 5 : Environment & PATH Configuration
**Objective:** Make the installed SDK and tools usable from any terminal or external development tool.

- [x] **Task 5.1: Canonical Variable Configuration**
  - Set `ANDROID_HOME` in `HKCU:\Environment` via safe registry methods.
  - Reconcile `ANDROID_SDK_ROOT` to avoid path conflicts.
- [x] **Task 5.2: Surgical PATH Mutation**
  - Retrieve current User `PATH`.
  - Parse, trim, normalize, and deduplicate entries.
  - Append `%ANDROID_HOME%\platform-tools` and `%ANDROID_HOME%\cmdline-tools\latest\bin`.
  - Enforce maximum PATH length limits to prevent registry truncation.
- [x] **Task 5.3: Process Environment Synchronization**
  - Update `process.env` in the current VS Code Extension Host.
  - Inform developer that external terminal sessions require a VS Code reload/restart.
- [x] **Task 5.4: Fresh Process Verification**
  - Spawn an independent child process (`cmd.exe /c "adb version"`) to verify real-world environment inheritance.

**Deliverable:** Fully configured Windows environment variables allowing `adb` and `sdkmanager` to execute in fresh command prompts. *(Completed & Verified)*

---

### Milestone 6 : Diagnostics, Auto-Repair & Verification
**Objective:** Provide diagnostic reporting and one-click remediation for broken environments, backed by comprehensive testing.

- [x] **Task 6.1: Diagnostic Engine & Probes**
  - Implement diagnostic rules for common errors:
    - ADB not found in PATH
    - `ANDROID_HOME` pointing to missing path
    - Incompatible Java version
    - Unaccepted licenses
- [x] **Task 6.2: One-Click Auto-Repair Actions**
  - Provide auto-repair handlers for detected issues (e.g., auto-add missing PATH entry, write missing licenses).
- [x] **Task 6.3: Clean & Migration Installation Testing**
  - Verify clean installation on machine with no prior Android tools.
  - Verify detection and graceful reuse of existing Android SDK.
- [x] **Task 6.4: Interrupted Download & Fault Recovery Testing**
  - Test simulated network disconnect during archive download.
  - Verify recovery without corrupted file states or infinite retry loops.

**Deliverable:** Complete diagnostics interface with auto-repair and verified test suites for clean, migration, and failure scenarios. *(Completed & Verified)*

---

## 3. Implementation Task Matrix (24 / 24 Completed - 100% Phase 1 MVP Done)

| # | Milestone | Task Name | Status |
|---|---|---|---|
| 1 | M1: Foundation | 1.1 Project Toolchain & Build Setup | [x] Completed |
| 2 | M1: Foundation | 1.2 Activity Bar & View Container Registration | [x] Completed |
| 3 | M1: Foundation | 1.3 Typed IPC Messaging Bridge | [x] Completed |
| 4 | M1: Foundation | 1.4 Base UI Shell & Page Routing | [x] Completed |
| 5 | M2: Discovery | 2.1 Environment Variable & Path Detection | [x] Completed |
| 6 | M2: Discovery | 2.2 Binary Probe & Validation | [x] Completed |
| 7 | M2: Discovery | 2.3 Installed Component Enumeration | [x] Completed |
| 8 | M2: Discovery | 2.4 System Health Report Compilation | [x] Completed |
| 9 | M3: Installer | 3.1 Directory Selection & Pre-flight Validation | [x] Completed |
| 10 | M3: Installer | 3.2 Streaming Downloader with SHA-256 Checksum | [x] Completed |
| 11 | M3: Installer | 3.3 Canonical Archive Extraction | [x] Completed |
| 12 | M3: Installer | 3.4 Package Installation & License Flow | [x] Completed |
| 13 | M4: JDK | 4.1 Java Version & AGP Compatibility Inspector | [x] Completed |
| 14 | M4: JDK | 4.2 Manual JDK Configuration | [x] Completed |
| 15 | M4: JDK | 4.3 Managed JDK Installer | [x] Completed |
| 16 | M4: JDK | 4.4 JAVA_HOME Orchestration | [x] Completed |
| 17 | M5: Environment | 5.1 Canonical Variable Configuration | [x] Completed |
| 18 | M5: Environment | 5.2 Surgical PATH Mutation | [x] Completed |
| 19 | M5: Environment | 5.3 Process Environment Synchronization | [x] Completed |
| 20 | M5: Environment | 5.4 Fresh Process Verification | [x] Completed |
| 21 | M6: Diagnostics | 6.1 Diagnostic Engine & Probes | [x] Completed |
| 22 | M6: Diagnostics | 6.2 One-Click Auto-Repair Actions | [x] Completed |
| 23 | M6: Diagnostics | 6.3 Clean & Migration Installation Testing | [x] Completed |
| 24 | M6: Diagnostics | 6.4 Interrupted Download & Fault Recovery Testing | [x] Completed |

---

## 4. Phase 1 MVP Acceptance Criteria

The MVP is considered complete when all the following criteria are validated on Windows 10/11:

1. **Clean Setup Flow:** A developer with zero prior Android/Java tools can select a destination directory (e.g. `C:\Android_Tools`), click "Install", and receive a fully functional physical-device Android development setup without manual terminal work.
2. **Brownfield Detection Flow:** A developer with an existing Android SDK installation can open the extension; it identifies the existing SDK, validates components, and avoids redundant downloads.
3. **Non-Admin Execution:** The entire installation, extraction, and user environment configuration succeeds without requiring an elevated Administrator command prompt.
4. **Valid Tool Execution:** After installation, opening a new terminal in VS Code and typing `adb version` and `sdkmanager --version` outputs correct version strings.
5. **Safe Registry Mutation:** The extension never clobbers or truncates existing PATH entries and never modifies System/Machine variables.
6. **Graceful Error Recovery:** An aborted download or interrupted installation cleans up temporary files and allows restart without manual directory purging.

