# Android SDK & JDK Technical Reference

This document serves as the technical reference for Google Android SDK command-line tools, directory layout constraints, `sdkmanager` CLI invocations, automated license acceptance, and Java Development Kit (JDK) compatibility.

---

## 1. Google Android SDK Directory Layout & The `latest/` Requirement

### 1.1 The Canonical SDK Layout
```
<SDK_ROOT>\
├── cmdline-tools\
│   └── latest\                    # MANDATORY NESTED DIRECTORY
│       ├── bin\
│       │   ├── sdkmanager.bat
│       │   └── avdmanager.bat
│       ├── lib\
│       └── source.properties
├── platform-tools\
│   ├── adb.exe
│   ├── fastboot.exe
│   └── source.properties
├── build-tools\
│   ├── 34.0.0\
│   │   ├── aapt2.exe
│   │   ├── zipalign.exe
│   │   └── d8.bat
│   └── 35.0.0\
├── platforms\
│   ├── android-34\
│   │   ├── android.jar
│   │   └── source.properties
│   └── android-35\
├── licenses\
│   ├── android-sdk-license
│   └── android-sdk-preview-license
└── system-images\ (Optional/Phase 2)
```

### 1.2 Critical Caveat: The `latest/` Nesting Constraint
When Google's official `commandlinetools-win-*_latest.zip` is downloaded and extracted, the zip contains an internal root directory named `cmdline-tools/`.

> [!CAUTION]
> If extracted directly into `<SDK_ROOT>/cmdline-tools/`, running `sdkmanager.bat` will crash with:
> ```
> Error: Could not determine SDK root.
> ```
> `sdkmanager.bat` assumes it is located inside `<SDK_ROOT>/cmdline-tools/<version>/bin/`. Therefore, the extraction pipeline **must** extract or relocate the contents into `<SDK_ROOT>/cmdline-tools/latest/`.

---

## 2. Command-Line Tools & CLI Invocations

All CLI tool invocations from the Extension Host must specify the explicit SDK root to prevent ambiguity.

### 2.1 `sdkmanager.bat`
Located at: `%ANDROID_HOME%\cmdline-tools\latest\bin\sdkmanager.bat`

| Operation | Command Pattern | Description |
|---|---|---|
| **List Packages** | `sdkmanager.bat --sdk_root="<SDK_ROOT>" --list --verbose` | Lists all installed, available, and updateable packages. |
| **Install Packages** | `sdkmanager.bat --sdk_root="<SDK_ROOT>" "platform-tools" "platforms;android-34" "build-tools;34.0.0"` | Installs one or more package identifiers. |
| **Update All** | `sdkmanager.bat --sdk_root="<SDK_ROOT>" --update` | Updates all currently installed packages. |
| **Accept Licenses** | `sdkmanager.bat --sdk_root="<SDK_ROOT>" --licenses` | Interactive CLI license prompt (prompts for `y/N`). |

### 2.2 `adb.exe`
Located at: `%ANDROID_HOME%\platform-tools\adb.exe`

| Operation | Command Pattern | Description |
|---|---|---|
| **Check Version** | `adb.exe version` | Returns version string (e.g. `Android Debug Bridge version 1.0.41`). |
| **Kill Server** | `adb.exe kill-server` | Terminates existing background adb daemon (releases locked files). |
| **Start Server** | `adb.exe start-server` | Restarts the adb background daemon. |
| **List Devices** | `adb.exe devices -l` | Returns connected physical hardware or running emulators. |

---

## 3. License Agreement Architecture & Direct Hash Writing

### 3.1 The Interactive CLI Problem
Running `sdkmanager.bat --licenses` launches an interactive console session requiring repeated `y` inputs. When spawned inside a headless Node.js process, stdin piping can hang, buffer, or fail if Google changes the prompt sequence.

### 3.2 The Direct License Hash Mechanism
Google's tools determine whether a license is accepted by checking for specific text files containing cryptographic SHA-1 hashes inside `<SDK_ROOT>/licenses/`.

When a user reviews and agrees to licenses in the extension UI, the extension can directly write the standard accepted license signatures to disk:

```
<SDK_ROOT>\licenses\android-sdk-license
```

**Known Google License Hashes:**
```text
24333f8a63b6825ea9c5514f83c2829b004d1fee
d56f5187479451eabf01fb78af6dfcb131a6481e
84831b9409646a53ee0f22618e2001670d613094
```

```
<SDK_ROOT>\licenses\android-sdk-preview-license
```
```text
84831b9409646a53ee0f22618e2001670d613094
```

> [!TIP]
> Writing these license files directly upon explicit user confirmation is completely accepted by Google SDK tools, runs in < 5ms, and eliminates hanging interactive CLI processes.

---

## 4. JDK & Android Gradle Plugin (AGP) Compatibility Matrix

Modern Android builds require specific Java Development Kit (JDK) versions depending on the Android Gradle Plugin (AGP) version used by the project:

| AGP Version Range | Minimum Java Version | Recommended Java Version | Default Gradle Version |
|---|---|---|---|
| **AGP 8.5.x - 8.8+** | Java 17 | **Java 17 (or 21)** | Gradle 8.7+ |
| **AGP 8.0.x - 8.4.x** | Java 17 | **Java 17** | Gradle 8.0 - 8.6 |
| **AGP 7.0.x - 7.4.x** | Java 11 | **Java 11** | Gradle 7.0 - 7.5 |
| **AGP 4.x (Legacy)** | Java 8 | **Java 8** | Gradle 6.x |

### Recommended Managed JDK Distribution
For the Managed JDK feature (`<install-root>\jdk\managed`), the extension targets:
- **Distribution:** Eclipse Temurin (Adoptium) OpenJDK 17 LTS (x64 Windows)
- **Rationale:** 
  - Meets all AGP 8.x requirements (current Android standard).
  - High performance, enterprise-grade, certified TCK compliant.
  - Available as a standalone `.zip` archive requiring zero installer execution.

---

## 5. Instant Package Version Detection via `source.properties`

Instead of executing `sdkmanager.bat --list_installed` on every startup (which can take 3 to 10 seconds due to JVM boot time), the extension uses instant direct filesystem probing:

Every installed SDK package directory contains a `source.properties` key-value text file.

### Example: `<SDK_ROOT>/platform-tools/source.properties`
```ini
Pkg.Desc=Android SDK Platform-Tools
Pkg.UserSrc=false
Pkg.Revision=35.0.1
```

### Fast Probing Algorithm
```typescript
import * as fs from 'fs/promises';
import * as path from 'path';

export async function readPackageVersion(pkgDir: string): Promise<string | null> {
  try {
    const propPath = path.join(pkgDir, 'source.properties');
    const content = await fs.readFile(propPath, 'utf-8');
    const match = content.match(/Pkg\.Revision\s*=\s*(.+)/);
    return match ? match[1].trim() : null;
  } catch {
    return null; // Directory or properties file does not exist
  }
}
```
*Performance:* Direct disk inspection takes < 10ms vs. 5,000ms for a JVM-spawned CLI query.

