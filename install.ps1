# AI Sidebar: one-line setup for the companion app on Windows.
#
#   irm https://raw.githubusercontent.com/Juan337492/aisidebar/main/install.ps1 | iex
#
# Or double-click AI-Sidebar-Setup.cmd from the latest release, which runs this script.
#
# What it does:
#   1. Checks for Node.js 20+ (installs it with winget if it's missing).
#   2. Installs the AI Sidebar companion from the latest GitHub Release.
#   3. Starts it now and every time you sign in to Windows.
#   4. Checks which AI tools are installed (Claude Code, Antigravity, Codex, Ollama).
#
# It never asks for passwords, doesn't need administrator rights, and doesn't touch your projects.
# Written for Windows PowerShell 5.1 (built into Windows 10/11) as well as PowerShell 7.

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$Repo = "Juan337492/aisidebar"
# AISIDEBAR_TGZ lets CI test a locally built package instead of the published one.
$Tgz = if ($env:AISIDEBAR_TGZ) { $env:AISIDEBAR_TGZ } else { "https://github.com/$Repo/releases/latest/download/aisidebar-companion.tgz" }
$Releases = "https://github.com/$Repo/releases/latest"

function Say($msg)  { Write-Host $msg -ForegroundColor White }
function Ok($msg)   { Write-Host "  [ok] $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "  [!]  $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Host ""; Write-Host "  [x]  $msg" -ForegroundColor Red; throw $msg }

# Pick up PATH changes from installers that ran in this session.
function Refresh-Path {
  $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $user = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machine;$user"
}

Say "AI Sidebar setup"
Write-Host ""

# 1. Node.js -------------------------------------------------------------------
Say "1/4  Node.js"
if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
  if (Get-Command winget.exe -ErrorAction SilentlyContinue) {
    Warn "Node.js not found. Installing it with winget (this can take a minute)..."
    winget.exe install --id OpenJS.NodeJS.LTS --exact --silent --accept-source-agreements --accept-package-agreements | Out-Null
    Refresh-Path
  }
  if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
    Fail "Node.js 20 or newer is required. Install it from https://nodejs.org, then run this again."
  }
}
$nodeMajor = [int](& node.exe -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt 20) { Fail "Node.js 20 or newer is required (you have $(& node.exe -v)). Update it from https://nodejs.org." }
Ok "Node.js $(& node.exe -v)"

# 2. Companion -----------------------------------------------------------------
Write-Host ""
Say "2/4  Companion app"
# Call npm.cmd directly: npm.ps1 can be blocked by PowerShell's script execution policy.
& npm.cmd install -g --silent --no-fund --no-audit $Tgz
if ($LASTEXITCODE -ne 0) { Fail "Installing the companion failed (npm exit code $LASTEXITCODE)." }
$prefix = (& npm.cmd prefix -g).Trim()
$bin = Join-Path $prefix "aisidebar-companion.cmd"
if (-not (Test-Path $bin)) { Fail "The companion didn't install correctly (expected $bin)." }
Ok "Installed: $bin"

# 3. Start it ------------------------------------------------------------------
Write-Host ""
Say "3/4  Start the companion"
if ($env:AISIDEBAR_SKIP_SERVICE -eq "1") {
  Warn "Skipping auto-start (AISIDEBAR_SKIP_SERVICE=1)."
} else {
  & $bin install | Out-Null
  if ($LASTEXITCODE -ne 0) { Fail "Couldn't set up auto-start (exit code $LASTEXITCODE)." }
  Ok "Running now, and it will start automatically when you sign in to Windows."
}

# 4. AI tools ------------------------------------------------------------------
Write-Host ""
Say "4/4  AI tools (you need at least one)"
$claude = (Get-Command claude -ErrorAction SilentlyContinue) -or (Test-Path "$env:USERPROFILE\.local\bin\claude.exe")
if ($claude) { Ok "Claude Code found (for Claude)" }
else { Warn "Claude Code not found. For Claude, install it: https://claude.com/product/claude-code" }

$found = [bool]$claude
$agy = (Get-Command antigravity -ErrorAction SilentlyContinue) -or (Get-Command agy -ErrorAction SilentlyContinue) -or (Test-Path "$env:USERPROFILE\.t3\tools\antigravity-acp")
if ($agy) { Ok "Antigravity found (for Gemini)"; $found = $true }
else { Warn "Antigravity not found. For Gemini, install it: https://antigravity.google/download" }

if (Get-Command codex -ErrorAction SilentlyContinue) { Ok "Codex found (for ChatGPT)"; $found = $true }
else { Warn "Codex not found (optional). For ChatGPT: npm install -g @openai/codex" }

if ((Get-Command ollama -ErrorAction SilentlyContinue) -or (Test-Path "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe")) { Ok "Ollama found (for local models)"; $found = $true }
else { Warn "Ollama not found (optional). For free local models: https://ollama.com/download" }
if (-not $found) { Warn "Install at least one of the tools above to chat." }

# Done -------------------------------------------------------------------------
Write-Host ""
Say "Done! Last steps:"
Write-Host "  1. Get the browser extension (step-by-step guide: https://juan337492.github.io/aisidebar/)"
Write-Host "     from $Releases"
Write-Host "       - Chrome or Edge: download ai-sidebar-chrome.zip, unzip it, open chrome://extensions"
Write-Host "         (edge://extensions in Edge), turn on Developer mode, click 'Load unpacked',"
Write-Host "         and pick the unzipped folder."
Write-Host "       - Firefox: see the instructions on that page."
Write-Host "  2. Open the sidebar (toolbar icon, or Alt+Shift+A) and click Connect."
Write-Host "     Click Yes in the popup."
Write-Host "  3. Sign in to Claude, Google or ChatGPT from the sidebar (Ollama needs no sign-in)."
