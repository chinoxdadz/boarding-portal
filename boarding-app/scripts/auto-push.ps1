$ErrorActionPreference = "Stop"
$repo = "C:\Users\kenan\Documents\BHouse\boarding-app"

Set-Location $repo

# Only proceed if there are changes
$status = git status --porcelain
if ([string]::IsNullOrWhiteSpace($status)) {
    exit 0
}

git add -A
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

git commit -m "Auto update $timestamp" | Out-Null

# Sync with remote then push
try {
    git pull --rebase origin main
} catch {
    # If rebase fails, stop to avoid conflicts
    exit 1
}

git push origin main
