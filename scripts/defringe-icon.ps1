Add-Type -AssemblyName System.Drawing

$srcPath = Join-Path (Get-Location) "resources\icons\new-icon.png"
$destPath = Join-Path (Get-Location) "resources\icons\icon.png"

$src = [System.Drawing.Bitmap]::FromFile($srcPath)
$dest = New-Object System.Drawing.Bitmap $src.Width, $src.Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

# The squircle dark background color is approx RGB(17, 20, 26)
$squircleR = 17
$squircleG = 20
$squircleB = 26

$defringedCount = 0

for ($y = 0; $y -lt $src.Height; $y++) {
    for ($x = 0; $x -lt $src.Width; $x++) {
        $p = $src.GetPixel($x, $y)

        # Detect white/light fringe on semi-transparent pixels near edges
        if ($p.A -gt 0 -and $p.A -lt 245) {
            # If the pixel is washed out with white (R > 120 and G > 120 and B > 120, but not green)
            if ($p.R -gt 130 -and $p.B -gt 130 -and [Math]::Abs($p.G - $p.R) -lt 40) {
                # Defringe by setting color to dark squircle base with preserved alpha
                $newColor = [System.Drawing.Color]::FromArgb($p.A, $squircleR, $squircleG, $squircleB)
                $dest.SetPixel($x, $y, $newColor)
                $defringedCount++
                continue
            }
        }
        $dest.SetPixel($x, $y, $p)
    }
}

$dest.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output ("Defringed pixels: " + $defringedCount)
Write-Output ("Saved clean icon to: " + $destPath)

$src.Dispose()
$dest.Dispose()

