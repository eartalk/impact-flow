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
$LocalEnvFile = Join-Path $ProjectDir ".env"
$RemoteEnvUpload = "/tmp/impact-flow-env-$([guid]::NewGuid().ToString('N'))"

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
if (-not (Test-Path -LiteralPath $LocalEnvFile)) {
    throw "Local environment file does not exist: $LocalEnvFile"
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

Write-Host "Uploading .env without adding it to Git..."
scp -i $IdentityFile $LocalEnvFile "${Target}:$RemoteEnvUpload"
if ($LASTEXITCODE -ne 0) { throw "Failed to upload .env" }

$RemoteScript = @"
set -Eeuo pipefail
trap "rm -f '$RemoteEnvUpload'" EXIT
chmod 600 ~/.ssh/codeup_ed25519
chmod 600 '$RemoteEnvUpload'
touch ~/.ssh/known_hosts
chmod 600 ~/.ssh/known_hosts
if ! ssh-keygen -F '$GitHubHostPattern' -f ~/.ssh/known_hosts >/dev/null || ! ssh-keygen -F 'codeup.aliyun.com' -f ~/.ssh/known_hosts >/dev/null; then
  printf '%s' '$TrustedHostsEncoded' | base64 -d >> ~/.ssh/known_hosts
fi
export GIT_SSH_COMMAND="ssh -i `$HOME/.ssh/codeup_ed25519 -o IdentitiesOnly=yes -o UserKnownHostsFile=`$HOME/.ssh/known_hosts"

if [[ -d '$RemoteDir/.git' ]]; then
  cd '$RemoteDir'
  git config core.fileMode false
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
  if [[ -d "`$backup_dir/secrets" ]]; then
    cp -a "`$backup_dir/secrets" '$RemoteDir/secrets'
  fi
  cd '$RemoteDir'
else
  git clone --branch '$Branch' --single-branch '$Repository' '$RemoteDir'
  cd '$RemoteDir'
fi

git config core.fileMode false

# Preserve the server-generated encryption key so existing encrypted data
# remains readable, while synchronizing all other settings from local .env.
existing_encryption_key=''
for existing_env in '$RemoteDir/.env' '$RemoteDir/.env.production' "`${backup_dir:-}/.env" "`${backup_dir:-}/.env.production"; do
  if [[ -f "`$existing_env" ]]; then
    candidate="`$(sed -n 's/^AI_CONFIG_ENCRYPTION_KEY=//p' "`$existing_env" | tail -1)"
    if [[ -n "`$candidate" ]]; then
      existing_encryption_key="`$candidate"
      break
    fi
  fi
done
install -m 600 '$RemoteEnvUpload' '$RemoteDir/.env'
if [[ -n "`$existing_encryption_key" ]]; then
  if grep -q '^AI_CONFIG_ENCRYPTION_KEY=' '$RemoteDir/.env'; then
    sed -i "s|^AI_CONFIG_ENCRYPTION_KEY=.*|AI_CONFIG_ENCRYPTION_KEY=`$existing_encryption_key|" '$RemoteDir/.env'
  else
    printf 'AI_CONFIG_ENCRYPTION_KEY=%s\n' "`$existing_encryption_key" >> '$RemoteDir/.env'
  fi
fi

# Keep production infrastructure settings only. Workspace business settings
# live in the database, while local values are ignored or overridden by Compose.
sed -i -E '/^(API_PORT|VITE_PORT|VITE_HOST|VITE_API_TARGET|REPOSITORY_CACHE_DIR|DATABASE_HOST|DATABASE_PORT|DATABASE_NAME|DATABASE_USER|DATABASE_PASSWORD_BASE64|VERSION_CHECK_ENABLED|VERSION_CHECK_INTERVAL_MS|INSPECTION_LOG_RETENTION_DAYS|SYMBOL_ANALYSIS_MAX_FILES|SYMBOL_ANALYSIS_MAX_RELATED_PROJECTS|SYMBOL_ANALYSIS_RELATED_MAX_FILES|AI_ANALYSIS_ENABLED|AI_API_BASE_URL|AI_API_FORMAT|AI_API_KEY|AI_MODEL|AI_ANALYSIS_TIMEOUT_MS|AI_ANALYSIS_MAX_FILES|AI_ANALYSIS_MAX_SYMBOLS|ANALYSIS_WORKER_ENABLED|ANALYSIS_WORKER_CONCURRENCY|ANALYSIS_WORKER_POLL_INTERVAL_MS|ANALYSIS_TASK_TIMEOUT_MS|ANALYSIS_RETRY_BASE_MS|WORKSPACE_CREATION_MODE)=/d' '$RemoteDir/.env'

deployed_commit="`$(git rev-parse --short HEAD)"
APP_PORT='$AppPort' PUBLIC_ORIGIN='$Origin' bash scripts/deploy.sh
printf 'Deployed commit: %s\n' "`$deployed_commit"
"@

Write-Host "Pulling origin/$Branch and deploying on the server..."
$RemoteScript | ssh -i $IdentityFile $Target "bash -s"
if ($LASTEXITCODE -ne 0) { throw "Remote deployment failed" }

Write-Host "Deployment completed: $Origin"
