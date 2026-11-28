import os, sys, subprocess, shutil, zipfile

appDir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "android", "app"))
rootDir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sdkRoot = r"C:\Users\DELL\AppData\Local\Android\Sdk"
buildTools = os.path.join(sdkRoot, "build-tools", "34.0.0")
platformJar = os.path.join(sdkRoot, "platforms", "android-34", "android.jar")
jdkBin = r"C:\Users\DELL\AppData\Local\Programs\Microsoft\jdk-17.0.10.7-hotspot\bin"

aapt2 = os.path.join(buildTools, "aapt2.exe")
d8 = os.path.join(buildTools, "d8.bat")
zipalign = os.path.join(buildTools, "zipalign.exe")
apksigner = os.path.join(buildTools, "apksigner.bat")
javac = os.path.join(jdkBin, "javac.exe")
keytool = os.path.join(jdkBin, "keytool.exe")
jar = os.path.join(jdkBin, "jar.exe")

buildDir = os.path.join(appDir, "build")
outputDir = os.path.join(buildDir, "outputs", "apk", "debug")

print("=== TravelMate AI Android APK Build Pipeline ===")
print("1/7. Cleaning and setting up build directories...")
if os.path.exists(buildDir):
    shutil.rmtree(buildDir)
os.makedirs(os.path.join(buildDir, "compiled_res"), exist_ok=True)
os.makedirs(os.path.join(buildDir, "gen"), exist_ok=True)
os.makedirs(os.path.join(buildDir, "classes"), exist_ok=True)
os.makedirs(os.path.join(buildDir, "dex"), exist_ok=True)
os.makedirs(outputDir, exist_ok=True)

print("2/7. Compiling Android resources with AAPT2...")
splash_res_dir = os.path.join(buildDir, "splash_res", "res")
os.makedirs(splash_res_dir, exist_ok=True)
aar_path = os.path.join(rootDir, "core-splashscreen-1.0.1.aar")
if not os.path.exists(aar_path):
    aar_path = os.path.join(appDir, "libs", "core-splashscreen-1.0.1.aar")

with zipfile.ZipFile(aar_path) as z:
    for info in z.infolist():
        if info.filename.startswith("res/"):
            z.extract(info, os.path.join(buildDir, "splash_res"))

splash_zip = os.path.join(buildDir, "splash_res.zip")
cmd = [aapt2, "compile", "--dir", splash_res_dir, "-o", splash_zip]
subprocess.run(cmd, check=True)

app_res_dir = os.path.join(appDir, "src", "main", "res")
app_zip = os.path.join(buildDir, "app_res.zip")
cmd = [aapt2, "compile", "--dir", app_res_dir, "-o", app_zip]
subprocess.run(cmd, check=True)

print("3/7. Linking resources & generating R.java...")
manifest = os.path.join(appDir, "src", "main", "AndroidManifest.xml")
packaged_apk = os.path.join(buildDir, "packaged_resources.apk")
assets_dir = os.path.join(appDir, "src", "main", "assets")

cmd = [
    aapt2, "link",
    "-I", platformJar,
    "--manifest", manifest,
    "--min-sdk-version", "24",
    "--target-sdk-version", "34",
    "--version-code", "4",
    "--version-name", "1.0.3",
    "--java", os.path.join(buildDir, "gen"),
    "--extra-packages", "androidx.core.splashscreen",
    "-o", packaged_apk,
    "-A", assets_dir,
    app_zip,
    splash_zip,
    "--auto-add-overlay"
]
subprocess.run(cmd, check=True)

print("4/7. Compiling Java source files (javac)...")
splash_jar = os.path.join(appDir, "libs", "core-splashscreen-1.0.1.jar")
kotlin_jar = os.path.join(appDir, "libs", "kotlin-stdlib-1.8.22.jar")
classpath = f"{platformJar};{splash_jar};{kotlin_jar}"

java_files = []
for root, _, files in os.walk(os.path.join(appDir, "src", "main", "java")):
    for f in files:
        if f.endswith(".java"):
            java_files.append(os.path.join(root, f))
for root, _, files in os.walk(os.path.join(buildDir, "gen")):
    for f in files:
        if f.endswith(".java"):
            java_files.append(os.path.join(root, f))

cmd = [javac, "-encoding", "UTF-8", "-cp", classpath, "-d", os.path.join(buildDir, "classes")] + java_files
subprocess.run(cmd, check=True)

print("5/7. Dexing bytecode with D8...")
class_files = []
for root, _, files in os.walk(os.path.join(buildDir, "classes")):
    for f in files:
        if f.endswith(".class"):
            class_files.append(os.path.join(root, f))

cmd = ["cmd.exe", "/c", d8, "--min-api", "24", "--lib", platformJar, "--output", os.path.join(buildDir, "dex")] + class_files + [splash_jar, kotlin_jar]
subprocess.run(cmd, check=True)

print("6/7. Packaging and aligning APK...")
unaligned_apk = os.path.join(buildDir, "unaligned.apk")
shutil.copyfile(packaged_apk, unaligned_apk)
cmd = [jar, "-uf", unaligned_apk, "-C", os.path.join(buildDir, "dex"), "classes.dex"]
subprocess.run(cmd, check=True)

aligned_apk = os.path.join(buildDir, "aligned.apk")
cmd = [zipalign, "-f", "-p", "4", unaligned_apk, aligned_apk]
subprocess.run(cmd, check=True)

print("7/7. Signing APK with apksigner...")
keystore = os.path.expanduser(r"~\.android\debug.keystore")
final_apk = os.path.join(outputDir, "app-debug.apk")
cmd = ["cmd.exe", "/c", apksigner, "sign", "--ks", keystore, "--ks-pass", "pass:android", "--key-pass", "pass:android", "--ks-key-alias", "androiddebugkey", "--out", final_apk, aligned_apk]
subprocess.run(cmd, check=True)

root_apk = os.path.join(rootDir, "TravelMate-AI-v1.0.0-debug.apk")
shutil.copyfile(final_apk, root_apk)
download_apk = os.path.join(rootDir, "download", "TravelMate-AI-v1.0.0-debug.apk")
if os.path.exists(os.path.join(rootDir, "download")):
    shutil.copyfile(final_apk, download_apk)


root_apk_v = os.path.join(rootDir, "TravelMate-AI-v1.0.3-debug.apk")
shutil.copyfile(final_apk, root_apk_v)
download_apk_v = os.path.join(rootDir, "download", "TravelMate-AI-v1.0.3-debug.apk")
if os.path.exists(os.path.join(rootDir, "download")):
    shutil.copyfile(final_apk, download_apk_v)

print("=================================================")
print("SUCCESS! DEBUG APK GENERATED SUCCESSFULLY!")
print(f"Output:  {final_apk}")
print(f"Root:    {root_apk}")
print(f"Size:    {os.path.getsize(final_apk)} bytes")

root_apk_v = os.path.join(rootDir, "TravelMate-AI-v1.0.3-debug.apk")
shutil.copyfile(final_apk, root_apk_v)
download_apk_v = os.path.join(rootDir, "download", "TravelMate-AI-v1.0.3-debug.apk")
if os.path.exists(os.path.join(rootDir, "download")):
    shutil.copyfile(final_apk, download_apk_v)

print("=================================================")
