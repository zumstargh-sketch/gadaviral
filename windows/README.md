# GADAVIRAL Windows App (WPF + WebView2)

Native Windows shell for the GADAVIRAL experience. Uses the same website SPA
and the same backend — nothing is duplicated, every action syncs across
platforms.

- Branded splash while loading (spec §1)
- Full app experience via Edge WebView2
- `GADAVIRAL_WEB_APP_URL` env var overrides the URL (dev: `http://localhost:5173`)
- App icon, single-file exe, self-contained runtime

## Build

```powershell
cd windows
dotnet build -c Release
dotnet publish -c Release -r win-x64 -o publish
# → publish\GADAVIRAL.exe  (self-contained, ~134 MB)
```

Requires the Microsoft Edge WebView2 Runtime (pre-installed on Windows 11;
evergreen installer: https://developer.microsoft.com/microsoft-edge/webview2/).

Dev run against a local stack:

```powershell
$env:GADAVIRAL_WEB_APP_URL = "http://localhost:5173"; .\publish\GADAVIRAL.exe
```
