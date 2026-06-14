Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$htmlFiles = Get-ChildItem -Path $root -File -Filter "*.html"
$failures = New-Object System.Collections.Generic.List[string]

foreach ($file in $htmlFiles) {
  $html = Get-Content -Raw -Encoding UTF8 -LiteralPath $file.FullName
  $relative = $file.FullName.Substring($root.Length + 1)

  if (-not [regex]::IsMatch($html, '<h1\b')) {
    $failures.Add("$relative has no h1")
  }

  if (-not [regex]::IsMatch($html, 'property="og:title"')) {
    $failures.Add("$relative has no OpenGraph title")
  }

  $hasPayPal = $html -match 'paypalobjects\.com/ncp/cart/cart\.js'
  if ($hasPayPal -and $file.Name -notin @("shop.html", "cart.html")) {
    $failures.Add("$relative loads PayPal outside shop/cart")
  }

  foreach ($match in [regex]::Matches($html, '(?:src|href|poster)="([^"]+)"')) {
    $ref = $match.Groups[1].Value
    if ($ref -match '^(https?:|mailto:|tel:|#|javascript:|data:)') { continue }

    $clean = ($ref -split '[?#]')[0]
    if ([string]::IsNullOrWhiteSpace($clean)) { continue }
    if ($clean.StartsWith("/")) { $clean = $clean.TrimStart("/") }

    $resolved = [System.IO.Path]::GetFullPath((Join-Path $file.DirectoryName $clean))
    if (-not $resolved.StartsWith($root)) { continue }
    if (-not (Test-Path -LiteralPath $resolved)) {
      $failures.Add("$relative references missing asset: $ref")
    }
  }
}

if ($failures.Count -gt 0) {
  $failures | ForEach-Object { Write-Error $_ }
  exit 1
}

Write-Host "Site checks passed."
