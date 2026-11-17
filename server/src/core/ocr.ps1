# Lecture du texte d'une image avec l'OCR intégré à Windows (Windows.Media.Ocr), dans la langue du profil.
# Ancien lecteur : plus appelé par défaut (le serveur lit avec tesseract.js) ; seulement si le serveur est lancé
# avec la variable d'environnement ELITE_OCR=windows (voir ocr.js).
# Usage : powershell -File ocr.ps1 <image.png> [<autre.png> ...]
# Sortie (UTF-8, JSON), une entrée par image : [{ "language": "fr-FR", "lines": [{ "text": "...", "x": 0, "y": 0, "w": 0, "h": 0 }] }]
param([Parameter(Mandatory = $true, ValueFromRemainingArguments = $true)][string[]]$Paths)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime]

# Les appels WinRT sont asynchrones : on attend leur résultat
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1
function Await($operation, [Type]$type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($operation))
  $task.Wait() | Out-Null
  $task.Result
}

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if (-not $engine) { throw 'NO_OCR_LANGUAGE' } # aucune langue d'OCR installée dans Windows

$results = foreach ($Path in $Paths) {
$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync((Resolve-Path $Path).Path)) ([Windows.Storage.StorageFile])
$stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
$result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
$stream.Dispose()

$lines = foreach ($line in $result.Lines) {
  $rects = $line.Words | ForEach-Object { $_.BoundingRect }
  $x = ($rects | Measure-Object -Property X -Minimum).Minimum
  $y = ($rects | Measure-Object -Property Y -Minimum).Minimum
  $right = ($rects | ForEach-Object { $_.X + $_.Width } | Measure-Object -Maximum).Maximum
  $bottom = ($rects | ForEach-Object { $_.Y + $_.Height } | Measure-Object -Maximum).Maximum
  [ordered]@{ text = $line.Text; x = [int]$x; y = [int]$y; w = [int]($right - $x); h = [int]($bottom - $y) }
}
[ordered]@{ language = $engine.RecognizerLanguage.LanguageTag; lines = @($lines) }
}
ConvertTo-Json -InputObject @($results) -Depth 5 -Compress
