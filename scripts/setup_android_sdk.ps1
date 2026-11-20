param(
    [string]$SdkRoot = "$env:LOCALAPPDATA\Android\Sdk"
)

$ErrorActionPreference = "Stop"

$cmdlineBase = "$SdkRoot\cmdline-tools"
$tempZip = "$env:TEMP\cmdline-tools.zip"

Write-Host "Creating directory: $cmdlineBase"
New-Item -ItemType Directory -Force -Path $cmdlineBase | Out-Null

Write-Host "Downloading Android Commandline Tools to $tempZip..."
curl.exe -L -o $tempZip "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip"

Write-Host "Extracting to $cmdlineBase using tar.exe..."
# Extract zip
tar.exe -xf $tempZip -C $cmdlineBase

$extractedDir = "$cmdlineBase\cmdline-tools"
$latestDir = "$cmdlineBase\latest"

if (Test-Path $latestDir) {
    Remove-Item -Recurse -Force $latestDir
}

if (Test-Path $extractedDir) {
    Rename-Item -Path $extractedDir -NewName "latest"
}

Remove-Item -Force $tempZip

Write-Host "Android Commandline Tools successfully installed at: $latestDir"
