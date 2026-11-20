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

# 2. AAPT2 Compile Resources
Write-Host "1/6. Compiling Android Resources with AAPT2..."
& $aapt2 compile --dir "$appDir\src\main\res" -o "$buildDir\compiled_res.zip"
if ($LASTEXITCODE -ne 0) { throw "AAPT2 compile failed" }

# 3. AAPT2 Link Resources, Manifest & Assets
Write-Host "2/6. Linking Resources & Generating R.java..."
& $aapt2 link -I $platformJar `
    --manifest "$appDir\src\main\AndroidManifest.xml" `
    --java "$buildDir\gen" `
    -o "$buildDir\packaged_resources.apk" `
    -A "$appDir\src\main\assets" `
    "$buildDir\compiled_res.zip" `
    --auto-add-overlay
if ($LASTEXITCODE -ne 0) { throw "AAPT2 link failed" }

# 4. Java Compilation (javac)
Write-Host "3/6. Compiling Java Source Files (javac)..."
$javaFiles = Get-ChildItem -Path "$appDir\src\main\java", "$buildDir\gen" -Filter "*.java" -Recurse | ForEach-Object { $_.FullName }
& $javac -encoding UTF-8 -cp $platformJar -d "$buildDir\classes" $javaFiles
if ($LASTEXITCODE -ne 0) { throw "Java compilation failed" }

# 5. D8 Dexing to classes.dex
Write-Host "4/6. Compiling Bytecode to Dalvik Executable (D8)..."
$classFiles = Get-ChildItem -Path "$buildDir\classes" -Filter "*.class" -Recurse | ForEach-Object { $_.FullName }
& $d8 --min-api 24 --lib $platformJar --output "$buildDir\dex" $classFiles
if ($LASTEXITCODE -ne 0) { throw "D8 dexing failed" }

# 6. Add classes.dex into APK
Write-Host "5/6. Packaging classes.dex into APK..."
Copy-Item "$buildDir\packaged_resources.apk" "$buildDir\unaligned.apk"

# Using Java's jar tool to update APK with classes.dex cleanly
& "$jdkBin\jar.exe" -uf "$buildDir\unaligned.apk" -C "$buildDir\dex" "classes.dex"
if ($LASTEXITCODE -ne 0) { throw "Packaging classes.dex failed" }

# 7. Zipalign (4-byte alignment)
Write-Host "6/6. 4-Byte ZipAligning APK..."
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

# Also sync to workspace root artifact
$rootApk = "$PSScriptRoot\..\TravelMate-AI-v1.0.0-debug.apk"
Copy-Item -Force $finalApk $rootApk

Write-Host "================================================="
Write-Host "SUCCESS! DEBUG APK GENERATED SUCCESSFULLY!"
Write-Host "Output:  $finalApk"
Write-Host "Root:    $rootApk"
Write-Host "Size:    $([math]::Round($apkItem.Length / 1MB, 2)) MB ($($apkItem.Length) bytes)"
Write-Host "SHA-256: $sha256"
Write-Host "================================================="
