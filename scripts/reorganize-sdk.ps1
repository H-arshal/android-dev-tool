$source = "C:\Android_Tools\sdk\sdk"
$targetSdk = "C:\Android_Tools\sdk"
$targetTools = "C:\Android_Tools"

Write-Host "Reorganizing SDK directories..."

# 1. Move config, downloads, logs from C:\Android_Tools\sdk to C:\Android_Tools if present
if (Test-Path "$targetSdk\config") {
    Move-Item -Path "$targetSdk\config" -Destination "$targetTools\config" -Force -ErrorAction SilentlyContinue
}
if (Test-Path "$targetSdk\downloads") {
    Move-Item -Path "$targetSdk\downloads" -Destination "$targetTools\downloads" -Force -ErrorAction SilentlyContinue
}
if (Test-Path "$targetSdk\logs") {
    Move-Item -Path "$targetSdk\logs" -Destination "$targetTools\logs" -Force -ErrorAction SilentlyContinue
}

# 2. Move SDK packages from C:\Android_Tools\sdk\sdk up to C:\Android_Tools\sdk
if (Test-Path $source) {
    $items = Get-ChildItem -Path $source -Force -ErrorAction SilentlyContinue
    foreach ($item in $items) {
        if ($item.Name -in @('sdk', 'config', 'downloads', 'logs')) {
            continue
        }
        $destPath = Join-Path $targetSdk $item.Name
        Write-Host "Moving $($item.Name) -> $destPath..."
        if (Test-Path $destPath) {
            # Merge / replace
            Copy-Item -Path $item.FullName -Destination $targetSdk -Recurse -Force
            Remove-Item -Path $item.FullName -Recurse -Force -ErrorAction SilentlyContinue
        } else {
            Move-Item -Path $item.FullName -Destination $targetSdk -Force
        }
    }

    # 3. Remove nested source directory
    Remove-Item -Path $source -Recurse -Force -ErrorAction SilentlyContinue
}

# 4. Update installation.json manifest
$installJson = "$targetTools\config\installation.json"
if (Test-Path $installJson) {
    try {
        $content = Get-Content $installJson -Raw | ConvertFrom-Json
        $content.sdkRoot = "C:\Android_Tools\sdk"
        $content | ConvertTo-Json -Depth 5 | Set-Content $installJson
        Write-Host "Updated installation manifest sdkRoot to C:\Android_Tools\sdk"
    } catch {
        Write-Warning "Could not update installation.json: $_"
    }
}

Write-Host "SDK files successfully reorganized into $targetSdk."

