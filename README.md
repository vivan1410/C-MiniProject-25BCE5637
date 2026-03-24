# 📊 High-Performance Attendance Manager

A **100% Client-Side**, serverless Attendance Management system engineered with **WebAssembly (C)** for core physics and logic framing alongside **Supabase Storage** for resilient multi-device sync workflows.

---

### 🚀 **Key Features**
- **⚡ WebAssembly Core**: Calculations and storage formatting leverage C-compiled binary algorithms solving data heavy processing efficiently inside browsers.
- **☁️ Supabase Cloud Sync**: Preserves and backups records instantly over serverless cloud streams safely.
- **📈 Real-Time Analytics**: Built on **Chart.js** displaying visual Absence thresholds dashboard modules statically.
- **📋 Bulk Sheet Marking**: Custom tabs aiding prompt bulk date sweeps calculations cleanly.
- **🔍 Indexed Profiler Modals**: Click individual index cards viewing isolated history trace trackers natively.

---

### 🧩 **Architecture Structure**
- **Compute Layer**: `attendance.c` -> `attendance.wasm` *(Compiled via Emscripten)*
- **State Trigger Setup**: `script.js` bridges DOM components natively forwards buffering WebAssembly queries securely.
- **Style Overlap layers**: `style.css` (Fluid fully Dark Responsive Layout aesthetics).

---

### 🛠️ **Initial Environment Setups**

Since the application utilizes direct CDN integrations and address streams, **no node modules downloads are required**!

1. **Spin up a Local Server**:
   To prevent CORS issues triggering WASM files framing:
   ```bash
   # Python (Built-In)
   python -m http.server 8001
   ```
2. **Access Dashboard**:
   Visit `http://localhost:8001` or `http://127.0.0.1:8001` 

---

### ⚙️ **Compilation Workspace & Drivers (Developers Only)**
If modifying core calculations inside `attendance.c`:
1. Ensure **Emscripten SDK (`emcc`)** lives loaded inside your environment pathways accurately.
2. Execute target build PowerShell scripting triggers:
   ```powershell
   ./build_wasm.ps1
   ```
   *This outputs and recreates `attendance.js` and `attendance.wasm` updates securely.*

---

### 🚢 **Deployment & GitHub Pages Setup**
If using GitHub Pages, leave all static resources sitting at the **Root Index** configuration:
1. Push branch setups to your repository securely.
2. Go to **Settings -> Pages**.
3. Select `Deploy from branch` and choose `/ (root)`.
4. Done! Allow 2 minutes live serving propagation updates.
