<#
.SYNOPSIS
    Generates tests/fixtures/fixture.mp4 for local/manual testing.

.DESCRIPTION
    Thin wrapper around scripts/ffmpeg-fixture.mjs. Resolves FFmpeg via an explicit
    -FfmpegPath, the FFMPEG_PATH environment variable, or PATH -- no machine-specific
    path is hardcoded. Idempotent: skips generation if the fixture already exists,
    unless -Force is passed.

.PARAMETER FfmpegPath
    Optional explicit path to an ffmpeg executable. Defaults to FFMPEG_PATH env var or PATH.

.PARAMETER OutputPath
    Optional output path for the generated fixture. Defaults to tests/fixtures/fixture.mp4.

.PARAMETER Force
    Regenerate the fixture even if it already exists.
#>
param(
    [string]$FfmpegPath,
    [string]$OutputPath,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

$scriptsDir = Join-Path $PSScriptRoot '..'
$scriptsDir = Join-Path $scriptsDir 'scripts'
$scriptPath = Join-Path $scriptsDir 'ffmpeg-fixture.mjs'

$fixturesDir = Join-Path $PSScriptRoot 'fixtures'
$defaultOutput = Join-Path $fixturesDir 'fixture.mp4'

$resolvedOutput = $defaultOutput
if ($OutputPath) { $resolvedOutput = $OutputPath }

$nodeArgs = @($scriptPath, '--output', $resolvedOutput)
if ($FfmpegPath) { $nodeArgs += @('--ffmpeg-path', $FfmpegPath) }
if ($Force) { $nodeArgs += '--force' }

node @nodeArgs
if ($LASTEXITCODE -ne 0) {
    throw "ffmpeg-fixture.mjs failed with exit code $LASTEXITCODE"
}
