Add-Type -AssemblyName System.Drawing

$OutDir = "D:\Dropbox\Claude Code\NGP\ngp-map\public"

# Shape definitions in 64-unit design space (must match public/favicon.svg)
$Mainland = @(
  @(28.0,8.2),@(31.0,4.9),@(37.0,4.0),@(44.0,4.9),@(50.0,4.0),@(52.0,18.6),@(50.0,25.2),
  @(53.5,35.5),@(53.0,43.0),@(49.0,48.6),@(43.0,51.5),@(38.0,51.9),@(35.5,55.2),@(33.5,52.5),
  @(34.0,47.7),@(32.5,42.1),@(33.5,35.5),@(32.0,28.0),@(33.0,22.3),@(30.5,18.6),@(31.5,13.9),@(29.0,12.0)
)
$Highland = @(
  @(41.0,33.5),@(47.5,32.0),@(53.4,36.5),@(52.9,43.2),@(48.8,48.4),@(43.2,51.2),@(40.2,46.5),@(41.0,39.5)
)
$Ridge = @(
  @(44.0,34.8),@(48.0,36.0),@(50.8,39.0),@(51.4,43.0),@(50.0,46.8),@(46.6,50.0),
  @(44.6,48.2),@(47.4,45.6),@(48.6,42.8),@(48.2,39.8),@(46.2,37.8),@(43.2,37.0)
)
$IslandMain = @(
  @(15.47,25.15),@(18.92,27.45),@(17.77,31.48),@(20.88,35.5),@(19.27,39.53),@(20.65,43.55),
  @(16.62,46.2),@(12.83,44.7),@(11.22,40.1),@(13.17,36.08),@(10.06,32.05),@(12.37,27.45)
)

$ColLand     = [System.Drawing.Color]::FromArgb(255,147,209,120)  # #93D178
$ColHighland = [System.Drawing.Color]::FromArgb(255,212,154,85)   # #D49A55
$ColRidge    = [System.Drawing.Color]::FromArgb(230,169,104,47)   # #A9682F @ 0.9
$ColSeaTop   = [System.Drawing.Color]::FromArgb(255,42,124,176)   # #2A7CB0
$ColSeaBot   = [System.Drawing.Color]::FromArgb(255,19,78,121)    # #134E79

# Design-space -> pixel transform. Mirrors the "translate(-0.76 0.92) scale(1.05)"
# group transform in public/favicon.svg, which nudges the composition to fill the tile.
# $script:CS then shrinks the artwork about the tile centre; the maskable icon uses
# it to keep every landmass inside the 80% safe zone Android crops to.
$script:CS = 1.0
function Tx([double]$X, [double]$S) { return [float]((((($X * 1.05 - 0.76) - 32) * $script:CS + 32)) * $S) }
function Ty([double]$Y, [double]$S) { return [float]((((($Y * 1.05 + 0.92) - 32) * $script:CS + 32)) * $S) }

function New-Poly([object[]]$Pts, [double]$S) {
  $arr = New-Object 'System.Drawing.PointF[]' $Pts.Count
  for ($i = 0; $i -lt $Pts.Count; $i++) {
    $arr[$i] = New-Object System.Drawing.PointF((Tx $Pts[$i][0] $S), (Ty $Pts[$i][1] $S))
  }
  return $arr
}

# Axis-aligned ellipse in design space -> pixel bounding box
function New-EllipseRect([double]$Cx, [double]$Cy, [double]$Rx, [double]$Ry, [double]$S) {
  return New-Object System.Drawing.RectangleF(
    (Tx ($Cx - $Rx) $S), (Ty ($Cy - $Ry) $S),
    [float]($Rx * 2 * 1.05 * $script:CS * $S), [float]($Ry * 2 * 1.05 * $script:CS * $S))
}

function New-RoundedPath([double]$Size, [double]$Radius) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = [float]($Radius * 2)
  $s = [float]$Size
  $p.AddArc(0, 0, $d, $d, 180, 90)
  $p.AddArc($s - $d, 0, $d, $d, 270, 90)
  $p.AddArc($s - $d, $s - $d, $d, $d, 0, 90)
  $p.AddArc(0, $s - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function Render-Icon([int]$Px, [bool]$Rounded, [double]$ContentScale = 1.0) {
  $S = $Px / 64.0
  $script:CS = $ContentScale
  $bmp = New-Object System.Drawing.Bitmap($Px, $Px, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)

  # Sea background (rounded tile, or full bleed for apple-touch-icon)
  $bgRect = New-Object System.Drawing.RectangleF(0, 0, [float]$Px, [float]$Px)
  $sea = New-Object System.Drawing.Drawing2D.LinearGradientBrush($bgRect, $ColSeaTop, $ColSeaBot, 90.0)
  if ($Rounded) {
    $bg = New-RoundedPath $Px (13.0 * $S)
    $g.FillPath($sea, $bg)
    $g.SetClip($bg)
    $bg.Dispose()
  } else {
    $g.FillRectangle($sea, $bgRect)
  }
  $sea.Dispose()

  $landBrush = New-Object System.Drawing.SolidBrush($ColLand)

  # Mainland
  $mlPts = New-Poly $Mainland $S
  $g.FillPolygon($landBrush, $mlPts)

  # Highlands + ridge, clipped to the mainland outline
  $mlPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $mlPath.AddPolygon($mlPts)
  $saved = $g.Save()
  $g.IntersectClip((New-Object System.Drawing.Region($mlPath)))
  $hlBrush = New-Object System.Drawing.SolidBrush($ColHighland)
  $g.FillPolygon($hlBrush, (New-Poly $Highland $S))
  $hlBrush.Dispose()
  # The mountain arc is ~1px wide at favicon sizes and just reads as mud there,
  # so it is drawn only for the large app-icon renders.
  if ($Px -ge 96) {
    $rgBrush = New-Object System.Drawing.SolidBrush($ColRidge)
    $g.FillPolygon($rgBrush, (New-Poly $Ridge $S))
    $rgBrush.Dispose()
  }
  $g.Restore($saved)
  $mlPath.Dispose()

  # Western archipelago
  $g.FillPolygon($landBrush, (New-Poly $IslandMain $S))
  $g.FillEllipse($landBrush, (New-EllipseRect 13.2 50.5 3.6 4.2 $S))
  if ($Px -ge 32) {
    $g.FillEllipse($landBrush, (New-EllipseRect 20.5 21.5 1.7 1.7 $S))
  }

  $landBrush.Dispose()
  $g.Dispose()
  return $bmp
}

function Save-Png([System.Drawing.Bitmap]$Bmp, [string]$Path) {
  $Bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Host "wrote $Path ($($Bmp.Width)x$($Bmp.Height))"
}

# ── PNG outputs ────────────────────────────────────────────────────────────
$b = Render-Icon 32  $true;  Save-Png $b (Join-Path $OutDir 'favicon-32.png');        $b.Dispose()
$b = Render-Icon 192 $true;  Save-Png $b (Join-Path $OutDir 'favicon-192.png');       $b.Dispose()
$b = Render-Icon 512 $true;  Save-Png $b (Join-Path $OutDir 'favicon-512.png');       $b.Dispose()
$b = Render-Icon 180 $false; Save-Png $b (Join-Path $OutDir 'apple-touch-icon.png');  $b.Dispose()
# Maskable: full-bleed square, artwork pulled into the centre 80% safe zone
$b = Render-Icon 512 $false 0.88; Save-Png $b (Join-Path $OutDir 'favicon-maskable-512.png'); $b.Dispose()

# ── favicon.ico (16/32/48) ─────────────────────────────────────────────────
# Entries use the classic BMP/DIB encoding rather than PNG-in-ICO: every
# consumer reads it, including legacy GDI+ and older Windows shell surfaces.
function Get-IcoBmpEntry([System.Drawing.Bitmap]$Bmp) {
  $w = $Bmp.Width; $h = $Bmp.Height
  $ms = New-Object System.IO.MemoryStream
  $bw = New-Object System.IO.BinaryWriter($ms)
  # BITMAPINFOHEADER — height is doubled to cover the XOR image + AND mask
  $bw.Write([UInt32]40)
  $bw.Write([Int32]$w)
  $bw.Write([Int32]($h * 2))
  $bw.Write([UInt16]1)
  $bw.Write([UInt16]32)
  $bw.Write([UInt32]0)                 # BI_RGB
  $bw.Write([UInt32]($w * $h * 4))
  $bw.Write([Int32]0); $bw.Write([Int32]0)
  $bw.Write([UInt32]0); $bw.Write([UInt32]0)
  # XOR image: BGRA, bottom-up
  for ($y = $h - 1; $y -ge 0; $y--) {
    for ($x = 0; $x -lt $w; $x++) {
      $c = $Bmp.GetPixel($x, $y)
      $bw.Write([Byte]$c.B); $bw.Write([Byte]$c.G); $bw.Write([Byte]$c.R); $bw.Write([Byte]$c.A)
    }
  }
  # AND mask: 1bpp, rows padded to 4 bytes. Left all-zero — the alpha channel governs.
  $rowBytes = [Math]::Floor(($w + 31) / 32) * 4
  $bw.Write((New-Object 'Byte[]' ($rowBytes * $h)))
  $bw.Flush()
  $bytes = $ms.ToArray()
  $bw.Dispose(); $ms.Dispose()
  # -NoEnumerate keeps the pipeline from unrolling the array into loose bytes
  Write-Output -NoEnumerate $bytes
}

$sizes = @(16, 32, 48)
$blobs = New-Object 'System.Collections.Generic.List[byte[]]'
foreach ($s in $sizes) {
  $bmp = Render-Icon $s $true
  $blobs.Add([byte[]](Get-IcoBmpEntry $bmp))
  $bmp.Dispose()
}

$icoPath = Join-Path $OutDir 'favicon.ico'
$fs = [System.IO.File]::Create($icoPath)
$bw = New-Object System.IO.BinaryWriter($fs)
$bw.Write([UInt16]0)                # reserved
$bw.Write([UInt16]1)                # type: icon
$bw.Write([UInt16]$sizes.Count)     # image count
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $bw.Write([Byte]$sizes[$i])       # width  (0 == 256)
  $bw.Write([Byte]$sizes[$i])       # height
  $bw.Write([Byte]0)                # palette colours
  $bw.Write([Byte]0)                # reserved
  $bw.Write([UInt16]1)              # colour planes
  $bw.Write([UInt16]32)             # bits per pixel
  $bw.Write([UInt32]$blobs[$i].Length)
  $bw.Write([UInt32]$offset)
  $offset += $blobs[$i].Length
}
foreach ($blob in $blobs) { $bw.Write($blob) }
$bw.Flush(); $bw.Dispose(); $fs.Dispose()
Write-Host "wrote $icoPath (16/32/48)"
