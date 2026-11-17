# Change Log

All notable changes to the "android-dev-tools" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-11-12

### Phase 2 Release : Device Manager and Emulator Hub

Major feature release introducing comprehensive physical Android device management, hardware diagnostics, quick actions, APK sideloading, and Android Virtual Device (AVD) emulator orchestration.

#### Added
- **ADB Device Discovery:** Real-time discovery and state tracking of USB hardware, Wi-Fi connected devices, and local emulators.
- **Hardware Inspector:** Live telemetry dashboard displaying battery charge level and temperature, physical and override screen resolution and DPI density, user data storage capacity, and ABI architecture.
- **Device Quick Actions:** High-resolution binary screenshot capture with automatic editor preview, dedicated interactive ADB terminal shell, reboot controls (system, bootloader, recovery), and wireless TCP/IP pairing.
- **APK Sideloading Engine:** Streamlined APK installer supporting reinstall (`-r`), grant permissions (`-g`), allow downgrade (`-d`), and allow test-only (`-t`) with human-friendly failure code resolution.
- **Android Virtual Device (AVD) Orchestration:** Full lifecycle management for local emulators, including configuration inspection (`config.ini`), cold-boot and headless launch modes, graceful shutdown, and virtual device creation.
- **System Image Discovery:** Automated scanning of installed SDK system images for streamlined AVD creation.

## [0.1.0] - 2026-11-09

### Initial MVP Release : Environment Manager

Initial release of Android Dev Tools for Windows, providing automated Android SDK installation, JDK management, environment variable configuration, and real-time diagnostics.

#### Added
- **Automated Setup Wizard:** Guided step-by-step setup to install command-line tools, platform-tools, build-tools, and platforms without manual terminal work.
- **Official Google SDK Integration:** Streaming archive downloader with on-the-fly SHA-256 verification and directory layout extraction into canonical `cmdline-tools/latest` structure.
- **Automated License Agreement Signing:** Certified cryptographic license hash generation eliminating interactive license prompts during CLI or Gradle execution.
- **JDK Detection and Management:** Detection of installed JDK runtimes with AGP 8.x compatibility verification, plus one-click managed installation of Eclipse Temurin OpenJDK 17 LTS.
- **Windows User Environment Synchronization:** Surgical, non-destructive mutation of User `ANDROID_HOME` and User `PATH` via HKCU registry with broadcast notification, requiring zero Administrator/UAC elevation.
- **Diagnostics Engine and One-Click Auto-Repair:** Probes verifying ADB in PATH, `ANDROID_HOME` integrity, JDK compatibility, and license acceptance with instant automated remediation.
- **Dual-View Interface:** Fast collapsible sidebar summary view with "Open in Main Editor" action that reveals the full dashboard and minimizes auxiliary and terminal panels.

