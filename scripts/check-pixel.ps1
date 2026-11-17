Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Bitmap]::FromFile((Join-Path (Get-Location) "resources\icons\new-icon.png"))

Write-Output ("Dimensions: " + $img.Width + "x" + $img.Height)
$c00 = $img.GetPixel(0, 0)
$cTopMid = $img.GetPixel(250, 0)
$cCenter = $img.GetPixel(250, 250)

Write-Output ("Corner (0,0): A=" + $c00.A + " R=" + $c00.R + " G=" + $c00.G + " B=" + $c00.B)
Write-Output ("TopMid (250,0): A=" + $cTopMid.A + " R=" + $cTopMid.R + " G=" + $cTopMid.G + " B=" + $cTopMid.B)
Write-Output ("Center (250,250): A=" + $cCenter.A + " R=" + $cCenter.R + " G=" + $cCenter.G + " B=" + $cCenter.B)

$img.Dispose()

