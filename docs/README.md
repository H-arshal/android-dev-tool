# Android Dev Tools — Technical Documentation

Welcome to the internal engineering documentation for **Android Dev Tools**, a Visual Studio Code extension engineered to streamline Android development environment setup, SDK management, JDK configuration, and system diagnostics on Windows.

This directory contains the technical blueprints, interface contracts, environmental guidelines, and implementation roadmaps required for building and maintaining the extension.

---

## Documentation Index

| Document | Purpose | Primary Audience |
|---|---|---|
| [**ARCHITECTURE.md**](./ARCHITECTURE.md) | High-level system design, subsystem boundaries, Extension Host vs. Webview separation, and core service abstractions. | Architects, Core Engineers |
| [**DEVELOPMENT_PLAN.md**](./DEVELOPMENT_PLAN.md) | Structured 6-milestone development roadmap, task checklist, acceptance criteria, and execution sequencing. | Project Leads, Developers |
| [**API_AND_MESSAGING_SPEC.md**](./API_AND_MESSAGING_SPEC.md) | Exhaustive IPC message contracts, payload schemas, request/response cycles, and event streams between Extension Host and React Webview. | Frontend & Backend Engineers |
| [**WINDOWS_ENVIRONMENT_GUIDE.md**](./WINDOWS_ENVIRONMENT_GUIDE.md) | In-depth technical reference for Windows Registry manipulation (`HKCU:\Environment`), atomic PATH editing, process sync, and permission rules. | Systems & Core Engineers |
| [**SDK_AND_JDK_REFERENCE.md**](./SDK_AND_JDK_REFERENCE.md) | Google Android SDK layout rules, `cmdline-tools/latest` directory constraints, `sdkmanager` CLI flags, license hash automation, and AGP/JDK compatibility matrix. | Android Tooling Engineers |
| [**UI_UX_SPECIFICATION.md**](./UI_UX_SPECIFICATION.md) | UI layout, view hierarchy, wizard step states, design tokens, VS Code theme integration, and user interaction patterns. | Frontend / UI Engineers |

---

## Core Philosophy & Guardrails

1. **Host-Owned Execution:** All native process execution, file I/O, download streams, and environment alterations run strictly within the VS Code Extension Host (Node.js). The React Webview operates solely as a presentation and telemetry surface.
2. **Standard CLI Wrapping:** Do not reimplement Google's package extraction or build mechanics. Wrap official Android CLI tools (`cmdline-tools`, `sdkmanager.bat`, `adb.exe`) via a decoupled interface (`AndroidPackageManager`).
3. **Non-Destructive Operations:** Never delete or alter existing Android installations or clobber system PATH variables without explicit user consent.
4. **Zero-Elevation MVP:** All initial operations target User-level scope (`HKCU:\Environment`), avoiding requirements for administrative privilege elevation.
5. **Deterministic Status Tracking:** Transparently reflect indeterminate or determinate progress with byte counters and state indicators without fabricating arbitrary percentage values.

---

## Project Quick Reference

- **Root Specification:** [`prd.txt`](../prd.txt)
- **Target OS:** Windows 10 / 11 (x64)
- **Host Runtime:** Node.js (VS Code Extension Host) + TypeScript
- **Webview UI:** React 18 + Tailwind CSS + Vite
- **Bundle Strategy:** `esbuild` (Extension Host) + `vite` (Webview bundle)

