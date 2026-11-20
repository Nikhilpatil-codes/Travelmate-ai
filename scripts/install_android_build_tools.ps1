$ErrorActionPreference = "Continue"

$env:JAVA_HOME = "C:\Users\DELL\AppData\Local\Programs\Microsoft\jdk-17.0.10.7-hotspot"
$sdkRoot = "C:\Users\DELL\AppData\Local\Android\Sdk"
$sdkManager = "$sdkRoot\cmdline-tools\latest\bin\sdkmanager.bat"

Write-Host "Accepting Android SDK licenses..."
cmd.exe /c "echo y | `"$sdkManager`" --sdk_root=`"$sdkRoot`" --licenses"

Write-Host "Installing platforms;android-34 and build-tools;34.0.0..."
cmd.exe /c "echo y | `"$sdkManager`" --sdk_root=`"$sdkRoot`" `"platforms;android-34`" `"build-tools;34.0.0`" `"platform-tools`""

Write-Host "Android SDK components installed successfully."
