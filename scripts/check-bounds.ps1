Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Bitmap]::FromFile((Join-Path (Get-Location) "resources\icons\new-icon.png"))

$minX = $img.Width
$maxX = 0
$minY = $img.Height
$maxY = 0

for ($y = 0; $y -lt $img.Height; $y++) {
    for ($x = 0; $x -lt $img.Width; $x++) {
        $p = $img.GetPixel($x, $y)
        if ($p.A -gt 10) {
            if ($x -lt $minX) { $minX = $x }
            if ($x -gt $maxX) { $maxX = $x }
            if ($y -lt $minY) { $minY = $y }
            if ($y -gt $maxY) { $maxY = $y }
        }
    }
}

Write-Output ("Width=" + $img.Width + ", Height=" + $img.Height)
Write-Output ("Content Bounds: X=" + $minX + ".." + $maxX + " (width=" + ($maxX - $minX + 1) + "), Y=" + $minY + ".." + $maxY + " (height=" + ($maxY - $minY + 1) + ")")
Write-Output ("Left Margin: " + $minX + ", Right Margin: " + ($img.Width - 1 - $maxX))
Write-Output ("Top Margin: " + $minY + ", Bottom Margin: " + ($img.Height - 1 - $maxY))

$img.Dispose()

