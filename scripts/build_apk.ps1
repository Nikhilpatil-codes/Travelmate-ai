$ErrorActionPreference = "Stop"

$appDir = "c:\Users\DELL\.gemini\antigravity-ide\scratch\Travelmate AI\android\app"
$sdkRoot = "C:\Users\DELL\AppData\Local\Android\Sdk"
$buildTools = "$sdkRoot\build-tools\34.0.0"
$platformJar = "$sdkRoot\platforms\android-34\android.jar"
$jdkBin = "C:\Users\DELL\AppData\Local\Programs\Microsoft\jdk-17.0.10.7-hotspot\bin"

$env:JAVA_HOME = "C:\Users\DELL\AppData\Local\Programs\Microsoft\jdk-17.0.10.7-hotspot"
$env:PATH = "$jdkBin;$buildTools;$env:PATH"

$aapt2 = "$buildTools\aapt2.exe"
$d8 = "$buildTools\d8.bat"
$zipalign = "$buildTools\zipalign.exe"
$apksigner = "$buildTools\apksigner.bat"
$javac = "$jdkBin\javac.exe"
$keytool = "$jdkBin\keytool.exe"

$buildDir = "$appDir\build"
$outputDir = "$buildDir\outputs\apk\debug"

Write-Host "=== TravelMate AI Android APK Build Pipeline ==="

# 1. Clean & Setup output directories
if (Test-Path $buildDir) { Remove-Item -Recurse -Force $buildDir }
New-Item -ItemType Directory -Force -Path "$buildDir\compiled_res" | Out-Null
New-Item -ItemType Directory -Force -Path "$buildDir\gen" | Out-Null
New-Item -ItemType Directory -Force -Path "$buildDir\classes" | Out-Null
New-Item -ItemType Directory -Force -Path "$buildDir\dex" | Out-Null
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

# 2. Extract and compile AndroidX SplashScreen resources
$splashAar = "$appDir\libs\core-splashscreen-1.0.1.aar"
if (-not (Test-Path $splashAar)) { $splashAar = "$PSScriptRoot\..\core-splashscreen-1.0.1.aar" }
$splashResDir = "$buildDir\splash_res"
New-Item -ItemType Directory -Force -Path $splashResDir | Out-Null
tar.exe -xf $splashAar -C $splashResDir res/

Write-Host "1/7. Compiling Android Resources with AAPT2..."
& $aapt2 compile --dir "$splashResDir\res" -o "$buildDir\splash_res.zip"
if ($LASTEXITCODE -ne 0) { throw "AAPT2 splash compile failed" }

& $aapt2 compile --dir "$appDir\src\main\res" -o "$buildDir\app_res.zip"
if ($LASTEXITCODE -ne 0) { throw "AAPT2 app compile failed" }

# 3. AAPT2 Link Resources, Manifest & Assets
Write-Host "2/7. Linking Resources & Generating R.java..."
& $aapt2 link -I $platformJar `
    --manifest "$appDir\src\main\AndroidManifest.xml" `
    --min-sdk-version 24 `
    --target-sdk-version 34 `
    --version-code 4 `
    --version-name "1.0.3" `
    --java "$buildDir\gen" `
    --extra-packages "androidx.core.splashscreen" `
    -o "$buildDir\packaged_resources.apk" `
    -A "$appDir\src\main\assets" `
    "$buildDir\app_res.zip" `
    "$buildDir\splash_res.zip" `
    --auto-add-overlay
if ($LASTEXITCODE -ne 0) { throw "AAPT2 link failed" }

# 4. Java Compilation (javac)
Write-Host "3/7. Compiling Java Source Files (javac)..."
$splashJar = "$appDir\libs\core-splashscreen-1.0.1.jar"
$kotlinJar = "$appDir\libs\kotlin-stdlib-1.8.22.jar"
$classpath = "$platformJar;$splashJar;$kotlinJar"

$javaFiles = Get-ChildItem -Path "$appDir\src\main\java", "$buildDir\gen" -Filter "*.java" -Recurse | ForEach-Object { $_.FullName }
& $javac -encoding UTF-8 -cp $classpath -d "$buildDir\classes" $javaFiles
if ($LASTEXITCODE -ne 0) { throw "Java compilation failed" }

# 5. D8 Dexing to classes.dex
Write-Host "4/7. Compiling Bytecode to Dalvik Executable (D8)..."
$classFiles = Get-ChildItem -Path "$buildDir\classes" -Filter "*.class" -Recurse | ForEach-Object { $_.FullName }
& $d8 --min-api 24 --lib $platformJar --output "$buildDir\dex" $classFiles $splashJar $kotlinJar
if ($LASTEXITCODE -ne 0) { throw "D8 dexing failed" }

# 6. Add classes.dex into APK
Write-Host "5/7. Packaging classes.dex into APK..."
Copy-Item "$buildDir\packaged_resources.apk" "$buildDir\unaligned.apk"

# Using Java's jar tool to update APK with classes.dex cleanly
& "$jdkBin\jar.exe" -uf "$buildDir\unaligned.apk" -C "$buildDir\dex" "classes.dex"
if ($LASTEXITCODE -ne 0) { throw "Packaging classes.dex failed" }

# 7. Zipalign (4-byte alignment)
Write-Host "6/7. 4-Byte ZipAligning APK..."
$alignedApk = "$buildDir\aligned.apk"
& $zipalign -f -p 4 "$buildDir\unaligned.apk" $alignedApk
if ($LASTEXITCODE -ne 0) { throw "Zipalign failed" }

# 8. Create debug keystore if not exists
$keystorePath = "$env:USERPROFILE\.android\debug.keystore"
if (-not (Test-Path $keystorePath)) {
    New-Item -ItemType Directory -Force -Path (Split-Path $keystorePath) | Out-Null
    Write-Host "Generating debug signing keystore..."
    & $keytool -genkey -v -keystore $keystorePath -storepass android -alias androiddebugkey -keypass android -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US"
}

# 9. Sign APK with apksigner
$finalApk = "$outputDir\app-debug.apk"
Write-Host "Signing Debug APK with Apksigner..."
& $apksigner sign --ks $keystorePath --ks-pass "pass:android" --key-pass "pass:android" --ks-key-alias "androiddebugkey" --out $finalApk $alignedApk
if ($LASTEXITCODE -ne 0) { throw "Apksigner failed" }

# 10. Verify Final APK
Write-Host "Verifying APK signatures and package integrity..."
& $apksigner verify --verbose $finalApk

$apkItem = Get-Item $finalApk
$sha256 = (Get-FileHash -Path $finalApk -Algorithm SHA256).Hash

# Also sync to workspace root artifact and download
$rootApk = "$PSScriptRoot\..\TravelMate-AI-v1.0.0-debug.apk"
Copy-Item -Force $finalApk $rootApk
$downloadApk = "$PSScriptRoot\..\download\TravelMate-AI-v1.0.0-debug.apk"
if (Test-Path "$PSScriptRoot\..\download") {
    Copy-Item -Force $finalApk $downloadApk
}

Write-Host "================================================="
Write-Host "SUCCESS! DEBUG APK GENERATED SUCCESSFULLY!"
Write-Host "Output:  $finalApk"
Write-Host "Root:    $rootApk"
Write-Host "Size:    $([math]::Round($apkItem.Length / 1MB, 2)) MB ($($apkItem.Length) bytes)"
Write-Host "SHA-256: $sha256"
Write-Host "================================================="
