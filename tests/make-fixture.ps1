<#
.SYNOPSIS
    Generates tests/fixtures/fixture.mp4 for local/e2e testing.

.DESCRIPTION
    Creates a 5-second, 1280x720, 30fps synthetic video (testsrc2) with a sine-wave
    audio track, encoded as H.264/AAC, using the ffmpeg binary from the sibling
    video-compressor project. Idempotent: skips generation if the fixture already
    exists, unless -Force is passed.

.PARAMETER Force
    Regenerate the fixture even if it already exists.
#>
param(
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

$ffmpeg = 'C:\Users\Cyril\Projects\video-compressor\ffmpeg.exe'
$fixturesDir = Join-Path $PSScriptRoot 'fixtures'
$fixturePath = Join-Path $fixturesDir 'fixture.mp4'

if (-not (Test-Path $ffmpeg)) {
    throw "ffmpeg.exe not found at $ffmpeg"
}

if ((Test-Path $fixturePath) -and -not $Force) {
    Write-Host "Fixture already exists at $fixturePath (use -Force to regenerate). Skipping."
    exit 0
}

if (-not (Test-Path $fixturesDir)) {
    New-Item -ItemType Directory -Path $fixturesDir | Out-Null
}

& $ffmpeg -y `
    -f lavfi -i "testsrc2=size=1280x720:rate=30:duration=5" `
    -f lavfi -i "sine=frequency=440:duration=5" `
    -c:v libx264 -b:v 3000k `
    -c:a aac `
    -shortest `
    $fixturePath

if ($LASTEXITCODE -ne 0) {
    throw "ffmpeg failed with exit code $LASTEXITCODE"
}

Write-Host "Fixture written to $fixturePath"
