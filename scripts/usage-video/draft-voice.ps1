# Draft narration with the Windows Korean voice (timing preview only). Same file names as tts.cjs.
param([string]$Out)
Add-Type -AssemblyName System.Speech
New-Item -ItemType Directory -Force $Out | Out-Null
$n = Get-Content (Join-Path $PSScriptRoot 'narration.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$sha = [System.Security.Cryptography.SHA256]::Create()
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SelectVoice('Microsoft Heami Desktop'); $s.Rate = 0
foreach ($p in $n.PSObject.Properties) { foreach ($t in $p.Value) {
  $h = ($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($t)) | % { $_.ToString('x2') }) -join ''
  $f = Join-Path $Out ($h.Substring(0,16) + '.wav')
  if (-not (Test-Path $f)) { $s.SetOutputToWaveFile($f); $s.Speak($t); $s.SetOutputToNull() }
}}
Write-Host 'draft voices done'
