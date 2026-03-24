$ErrorActionPreference = "Stop"

$emsdkPath = "$env:TEMP\emsdk"
Set-Location -Path $emsdkPath
. .\emsdk_env.ps1

Set-Location -Path "c:\Users\vivan\OneDrive\Desktop\p1"
Write-Host "Compiling attendance.c to WASM..."
emcc attendance.c -o attendance.js -s EXPORTED_FUNCTIONS="['_wasmAddStudent', '_wasmMarkAttendance', '_wasmGetStudentsJson', '_wasmGetRecordsJson', '_wasmGetSummaryJson', '_wasmLoadData', '_wasmDeleteStudent', '_wasmDeleteRecord', '_wasmDeleteRecordsByDate']" -s EXPORTED_RUNTIME_METHODS="['ccall', 'cwrap', 'FS']" -s WASM=1 -O3 -s NO_EXIT_RUNTIME=1 -s ALLOW_MEMORY_GROWTH=1 -s ENVIRONMENT=web

Write-Host "Compilation complete."
