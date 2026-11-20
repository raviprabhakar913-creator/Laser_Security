param(
    [string]$RepoName = "Laser_Security",
    [string]$GitHubUser = "raviprabhakar913-creator",
    [string]$Token = ""
)

# Ensure TLS 1.2 is enabled for GitHub API connections in PowerShell 5.1
try {
    [System.Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls11 -bor [Net.SecurityProtocolType]::Tls
} catch {}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Push Project to GitHub: $GitHubUser/$RepoName" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

$filesToUpload = @(
    "index.html",
    "style.css",
    "app.js",
    "README.md",
    ".gitignore",
    "launch_simulator.bat",
    "start_server.bat"
)

# Check if git command exists
$gitCmd = Get-Command git -ErrorAction SilentlyContinue

if ($gitCmd) {
    Write-Host "[✓] Git detected on system: $($gitCmd.Source)" -ForegroundColor Green
    Write-Host "Initializing git repository..." -ForegroundColor Yellow
    
    git init
    git branch -M main
    foreach ($f in $filesToUpload) {
        if (Test-Path $f) { git add $f }
    }
    git commit -m "Initial commit: Laser Security Alarm System Simulator & Monitoring Dashboard"
    
    $remoteUrl = "https://github.com/$GitHubUser/$RepoName.git"
    git remote remove origin -ErrorAction SilentlyContinue
    git remote add origin $remoteUrl
    
    Write-Host "Pushing to $remoteUrl..." -ForegroundColor Cyan
    git push -u origin main
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "[✓] Successfully pushed to https://github.com/$GitHubUser/$RepoName" -ForegroundColor Green
        Start-Process "https://github.com/$GitHubUser/$RepoName"
        exit 0
    } else {
        Write-Host "Git push encountered an error (likely authentication required)." -ForegroundColor Yellow
        Write-Host "Falling back to GitHub REST API direct upload..." -ForegroundColor Cyan
    }
} else {
    Write-Host "[!] Git executable is not installed on system." -ForegroundColor Yellow
    Write-Host "    Using GitHub REST API direct upload (no Git required)..." -ForegroundColor Cyan
}

Write-Host ""
if ([string]::IsNullOrWhiteSpace($Token)) {
    Write-Host "To upload directly to your GitHub profile ($GitHubUser)," -ForegroundColor White
    Write-Host "you need a GitHub Personal Access Token (classic with 'repo' scope)." -ForegroundColor White
    Write-Host "Generate one here: https://github.com/settings/tokens/new?scopes=repo" -ForegroundColor Cyan
    Write-Host ""
    $Token = Read-Host "Please paste your GitHub Personal Access Token (e.g. ghp_...)"
}

$Token = $Token.Trim().Trim('"').Trim("'")

if ([string]::IsNullOrWhiteSpace($Token)) {
    Write-Host "Token was empty. Aborting upload." -ForegroundColor Red
    exit 1
}

$headers = @{
    "Authorization" = "Bearer $Token"
    "Accept"        = "application/vnd.github+json"
    "User-Agent"    = "PowerShell-LaserSecurityUploader"
}

# Validate Token against GitHub API
Write-Host "Validating token with GitHub..." -ForegroundColor Yellow
try {
    $authCheck = Invoke-RestMethod -Uri "https://api.github.com/user" -Headers $headers -Method Get -ErrorAction Stop
    Write-Host "[✓] Authenticated as GitHub user: $($authCheck.login)" -ForegroundColor Green
} catch {
    Write-Host "[X] Authentication failed: Bad credentials or expired token." -ForegroundColor Red
    Write-Host "    Make sure you generated a classic token with 'repo' scope checked at:" -ForegroundColor Yellow
    Write-Host "    https://github.com/settings/tokens/new?scopes=repo" -ForegroundColor Cyan
    exit 1
}

# 1. Target Repository Confirmation
Write-Host "[✓] Target Repository: https://github.com/$GitHubUser/$RepoName" -ForegroundColor Green
$repoCheckUrl = "https://api.github.com/repos/$GitHubUser/$RepoName"

try {
    $existing = Invoke-RestMethod -Uri $repoCheckUrl -Headers $headers -Method Get -ErrorAction Stop
    Write-Host "[✓] Successfully connected to repository: $($existing.html_url)" -ForegroundColor Green
} catch {
    Write-Host "[!] Repository not found or private. Attempting to ensure repository exists..." -ForegroundColor Yellow
    $createBody = @{
        name        = $RepoName
        description = "Laser Security Alarm System Simulator & Monitoring Dashboard — Digital Electronics Mini-Project (Shahid Ali & Ravi Shankar, SRMU)"
        private     = $false
    } | ConvertTo-Json

    try {
        $created = Invoke-RestMethod -Uri "https://api.github.com/user/repos" -Headers $headers -Method Post -Body $createBody -ContentType "application/json"
        Write-Host "[✓] Created repository: $($created.html_url)" -ForegroundColor Green
    } catch {
        Write-Host "Proceeding with direct file upload..." -ForegroundColor Yellow
    }
}

# 2. Upload files via GitHub API
Write-Host ""
Write-Host "Uploading project files to https://github.com/$GitHubUser/$RepoName..." -ForegroundColor Cyan

foreach ($filename in $filesToUpload) {
    if (Test-Path $filename) {
        Write-Host " -> Uploading $filename..." -NoNewline
        $contentBytes = [System.IO.File]::ReadAllBytes((Resolve-Path $filename))
        $base64 = [Convert]::ToBase64String($contentBytes)

        # Check existing sha if updating
        $fileUrl = "https://api.github.com/repos/$GitHubUser/$RepoName/contents/$filename"
        $sha = $null
        try {
            $existingFile = Invoke-RestMethod -Uri $fileUrl -Headers $headers -Method Get -ErrorAction Stop
            $sha = $existingFile.sha
        } catch {}

        $putBody = @{
            message = "Add $filename for Laser Security Alarm System"
            content = $base64
        }
        if ($sha) { $putBody["sha"] = $sha }

        $jsonBody = $putBody | ConvertTo-Json

        try {
            Invoke-RestMethod -Uri $fileUrl -Headers $headers -Method Put -Body $jsonBody -ContentType "application/json" | Out-Null
            Write-Host " [OK]" -ForegroundColor Green
        } catch {
            Write-Host " [FAILED: $_]" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host " [✓] ALL FILES SUCCESSFULLY PUSHED TO GITHUB!" -ForegroundColor Green
Write-Host " Repository URL: https://github.com/$GitHubUser/$RepoName" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green

Start-Process "https://github.com/$GitHubUser/$RepoName"
