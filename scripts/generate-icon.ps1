Add-Type -AssemblyName System.Drawing

$iconPath = Join-Path $PSScriptRoot "..\resources\icons\icon.png"
$bmp = New-Object System.Drawing.Bitmap 256, 256
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)

# Rounded dark slate background squircle
$bgBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
$rect = New-Object System.Drawing.Rectangle 8, 8, 240, 240
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$r = 48
$path.AddArc($rect.X, $rect.Y, $r, $r, 180, 90)
$path.AddArc($rect.Right - $r, $rect.Y, $r, $r, 270, 90)
$path.AddArc($rect.Right - $r, $rect.Bottom - $r, $r, $r, 0, 90)
$path.AddArc($rect.X, $rect.Bottom - $r, $r, $r, 90, 90)
$path.CloseFigure()
$g.FillPath($bgBrush, $path)

# Subtle border
$borderPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(90, 61, 220, 132)), 3
$g.DrawPath($borderPen, $path)

# Android Green
$androidGreen = [System.Drawing.Color]::FromArgb(255, 61, 220, 132)
$greenBrush = New-Object System.Drawing.SolidBrush $androidGreen
$greenPen = New-Object System.Drawing.Pen $androidGreen, 8
$greenPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$greenPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

# Antennas
$g.DrawLine($greenPen, 88, 96, 68, 62)
$g.DrawLine($greenPen, 168, 96, 188, 62)

# Head (Dome)
$g.FillPie($greenBrush, 58, 92, 140, 130, 180, 180)

# Eyes (Dark)
$eyeBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
$g.FillEllipse($eyeBrush, 92, 126, 14, 14)
$g.FillEllipse($eyeBrush, 150, 126, 14, 14)

# Body
$bodyPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$br = 24
$bodyPath.AddLine(58, 166, 198, 166)
$bodyPath.AddArc(198 - $br, 218 - $br, $br, $br, 0, 90)
$bodyPath.AddLine(198 - $br, 218, 58 + $br, 218)
$bodyPath.AddArc(58, 218 - $br, $br, $br, 90, 90)
$bodyPath.CloseFigure()
$g.FillPath($greenBrush, $bodyPath)

# Wrench Accent (Cyan / Tool Accent)
$cyan = [System.Drawing.Color]::FromArgb(255, 56, 189, 248)
$accentPen = New-Object System.Drawing.Pen $cyan, 8
$accentPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$accentPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$g.DrawLine($accentPen, 152, 198, 184, 166)

$bmp.Save($iconPath, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
Write-Output "Icon generated at: $iconPath"

