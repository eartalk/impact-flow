[CmdletBinding()]
param(
    [string]$Server = "150.158.3.213",
    [string]$User = "ubuntu",
    [string]$IdentityFile = "$env:USERPROFILE\.ssh\id_ed25519",
    [string]$GitIdentityFile = "$env:USERPROFILE\.ssh\id_ed25519",
    [string]$Repository = "ssh://git@ssh.github.com:443/eartalk/impact-flow.git",
    [string]$Branch = "main",
    [string]$RemoteDir = "/home/ubuntu/impact-flow",
    [int]$AppPort = 80
)

$ErrorActionPreference = "Stop"
$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Target = "$User@$Server"
$Origin = if ($AppPort -eq 80) { "http://$Server" } else { "http://${Server}:$AppPort" }
$KnownHostsFile = Join-Path $env:USERPROFILE ".ssh\known_hosts"

if ($Branch -notmatch '^[A-Za-z0-9._/-]+$') {
    throw "Invalid Git branch name: $Branch"
}
if ($RemoteDir -notmatch '^/home/[A-Za-z0-9._-]+/[A-Za-z0-9._/-]+$') {
    throw "RemoteDir must be an absolute path below /home: $RemoteDir"
}
if (-not (Test-Path -LiteralPath $IdentityFile)) {
    throw "SSH login key does not exist: $IdentityFile"
}
if (-not (Test-Path -LiteralPath $GitIdentityFile)) {
    throw "Git SSH key does not exist: $GitIdentityFile"
}

Push-Location $ProjectDir
try {
    $DirtyFiles = @(git status --porcelain)
    if ($LASTEXITCODE -ne 0) { throw "Unable to read local Git status" }
    if ($DirtyFiles.Count -gt 0) {
        throw "Local working tree has uncommitted changes. Commit and push them before deployment."
    }

    git fetch origin $Branch
    if ($LASTEXITCODE -ne 0) { throw "Unable to fetch origin/$Branch" }

    $LocalHead = (git rev-parse HEAD).Trim()
    $RemoteHead = (git rev-parse "origin/$Branch").Trim()
    if ($LocalHead -ne $RemoteHead) {
        throw "Local HEAD does not match origin/$Branch. Push or pull before deployment."
    }
}
finally {
    Pop-Location
}

function Get-TrustedHostLines([string]$Pattern) {
    $Lines = @(ssh-keygen -F $Pattern -f $KnownHostsFile |
        Where-Object { $_ -and -not $_.StartsWith("#") })
    if ($Lines.Count -eq 0) {
        throw "Missing trusted host key for $Pattern in $KnownHostsFile"
    }
    return ($Lines -join "`n") + "`n"
}

$GitHubHostPattern = "[ssh.github.com]:443"
$TrustedHosts = (Get-TrustedHostLines $GitHubHostPattern) +
    (Get-TrustedHostLines "codeup.aliyun.com")
$TrustedHostsEncoded = [Convert]::ToBase64String(
    [Text.Encoding]::UTF8.GetBytes($TrustedHosts)
)

Write-Host "Uploading the Git deployment key to $Target..."
scp -i $IdentityFile $GitIdentityFile "${Target}:~/.ssh/codeup_ed25519"
if ($LASTEXITCODE -ne 0) { throw "Failed to upload the Git SSH key" }

$RemoteScript = @"
set -Eeuo pipefail
chmod 600 ~/.ssh/codeup_ed25519
touch ~/.ssh/known_hosts
chmod 600 ~/.ssh/known_hosts
if ! ssh-keygen -F '$GitHubHostPattern' -f ~/.ssh/known_hosts >/dev/null || ! ssh-keygen -F 'codeup.aliyun.com' -f ~/.ssh/known_hosts >/dev/null; then
  printf '%s' '$TrustedHostsEncoded' | base64 -d >> ~/.ssh/known_hosts
fi
export GIT_SSH_COMMAND="ssh -i `$HOME/.ssh/codeup_ed25519 -o IdentitiesOnly=yes -o UserKnownHostsFile=`$HOME/.ssh/known_hosts"

if [[ -d '$RemoteDir/.git' ]]; then
  cd '$RemoteDir'
  git remote set-url origin '$Repository'
  git fetch origin '$Branch'
  git checkout '$Branch'
  git pull --ff-only origin '$Branch'
elif [[ -e '$RemoteDir' ]]; then
  backup_dir="${RemoteDir}.legacy-`$(date +%Y%m%d%H%M%S)"
  mv '$RemoteDir' "`$backup_dir"
  if ! git clone --branch '$Branch' --single-branch '$Repository' '$RemoteDir'; then
    mv "`$backup_dir" '$RemoteDir'
    exit 1
  fi
  if [[ -f "`$backup_dir/.env.production" ]]; then
    cp "`$backup_dir/.env.production" '$RemoteDir/.env.production'
  fi
  if [[ -d "`$backup_dir/secrets" ]]; then
    cp -a "`$backup_dir/secrets" '$RemoteDir/secrets'
  fi
  cd '$RemoteDir'
else
  git clone --branch '$Branch' --single-branch '$Repository' '$RemoteDir'
  cd '$RemoteDir'
fi

chmod +x scripts/deploy.sh
APP_PORT='$AppPort' PUBLIC_ORIGIN='$Origin' ./scripts/deploy.sh
printf 'Deployed commit: '
git rev-parse --short HEAD
"@

Write-Host "Pulling origin/$Branch and deploying on the server..."
$RemoteScript | ssh -i $IdentityFile $Target "bash -s"
if ($LASTEXITCODE -ne 0) { throw "Remote deployment failed" }

Write-Host "Deployment completed: $Origin"
