#requires -Version 5.1

param(
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $ProjectRoot

$LogDirectory = Join-Path $ProjectRoot "scripts\deploy-logs"
New-Item -ItemType Directory -Force -Path $LogDirectory | Out-Null

$StartedAt = Get-Date
$Stamp = $StartedAt.ToString("yyyyMMdd-HHmmss")
$LogFile = Join-Path $LogDirectory "deploy-$Stamp.log"
$script:FailedStep = ""
$script:CurrentCommand = ""
$script:DeployResult = "FAILED"

function Write-DeployLog {
    param(
        [AllowEmptyString()][Parameter(Mandatory = $true)][string]$Message,
        [ConsoleColor]$Color
    )

    $line = "$(Get-Date -Format "yyyy-MM-dd HH:mm:ss") $Message"
    Add-Content -LiteralPath $LogFile -Value $line

    if ($PSBoundParameters.ContainsKey("Color")) {
        Write-Host $Message -ForegroundColor $Color
    } else {
        Write-Host $Message
    }
}

function Write-DeploySection {
    param([Parameter(Mandatory = $true)][string]$Title)

    Write-DeployLog ""
    Write-DeployLog "============================================================" Cyan
    Write-DeployLog $Title Cyan
    Write-DeployLog "============================================================" Cyan
}

function Fail-Deploy {
    param(
        [Parameter(Mandatory = $true)][string]$Step,
        [Parameter(Mandatory = $true)][string]$Message
    )

    $script:FailedStep = $Step
    throw $Message
}

function ConvertTo-ProcessArgument {
    param([AllowEmptyString()][Parameter(Mandatory = $true)][string]$Argument)

    if ($Argument -notmatch '[\s"]') {
        return $Argument
    }

    return '"' + ($Argument -replace '(\\*)"', '$1$1\"' -replace '(\\+)$', '$1$1') + '"'
}

function Resolve-CommandPath {
    param([Parameter(Mandatory = $true)][string]$Name)

    $command = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $command) {
        $command = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
    }

    if (-not $command) {
        return $Name
    }

    if ($command.Source) {
        return $command.Source
    }

    return $command.Path
}

function Require-Command {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$InstallHint
    )

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        Fail-Deploy "Environment validation" "$Name was not found. $InstallHint"
    }

    Write-DeployLog "[OK] $Name found" Green
}

function Invoke-LoggedCommand {
    param(
        [Parameter(Mandatory = $true)][string]$Step,
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$Arguments = @()
    )

    $commandText = "$FilePath $($Arguments -join ' ')".Trim()
    $script:CurrentCommand = $commandText
    Write-DeployLog "Command: $commandText"

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = Resolve-CommandPath $FilePath
    $psi.Arguments = ($Arguments | ForEach-Object { ConvertTo-ProcessArgument $_ }) -join " "
    $psi.WorkingDirectory = $ProjectRoot
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $psi

    try {
        [void]$process.Start()
    } catch {
        Fail-Deploy $Step "Failed to start command: $commandText. $($_.Exception.Message)"
    }

    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    $exitCode = $process.ExitCode

    if ($stdout) {
        foreach ($line in ($stdout -split "\r?\n")) {
            if ($line.Length -gt 0) {
                Write-DeployLog "  [stdout] $line"
            }
        }
    }

    if ($stderr) {
        foreach ($line in ($stderr -split "\r?\n")) {
            if ($line.Length -gt 0) {
                Write-DeployLog "  [stderr] $line"
            }
        }
    }

    Write-DeployLog "Exit code: $exitCode"
    $script:CurrentCommand = ""

    if ($exitCode -ne 0) {
        Fail-Deploy $Step "$Step failed with exit code $exitCode. Command: $commandText"
    }
}

function Get-GitValue {
    param(
        [Parameter(Mandatory = $true)][string]$Step,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    $value = (& git @Arguments 2>&1)
    if ($LASTEXITCODE -ne 0) {
        Fail-Deploy $Step "git $($Arguments -join ' ') failed: $value"
    }

    return ($value | Select-Object -First 1).ToString().Trim()
}

function Test-FirebaseLogin {
    Write-DeployLog "Checking Firebase login..."

    $loginOutput = (& firebase login:list 2>&1)
    $exitCode = $LASTEXITCODE
    foreach ($line in $loginOutput) {
        Write-DeployLog "  $line"
    }

    if ($exitCode -ne 0) {
        Fail-Deploy "Environment validation" "Firebase login check failed. Run: firebase login"
    }

    $combined = ($loginOutput -join "`n")
    if ($combined -match "No authorized accounts|not logged in|login required") {
        Fail-Deploy "Environment validation" "No active Firebase login found. Run: firebase login"
    }

    Write-DeployLog "[OK] Firebase login appears active" Green
}

function Test-ProjectRoot {
    $requiredFiles = @("package.json", "firebase.json", "firestore.rules", "firestore.indexes.json", ".firebaserc")

    foreach ($file in $requiredFiles) {
        $path = Join-Path $ProjectRoot $file
        if (-not (Test-Path -LiteralPath $path)) {
            Fail-Deploy "Environment validation" "Current directory is not a valid ASG Leads Firebase app root. Missing: $file"
        }
    }

    Invoke-LoggedCommand "Environment validation" "git" @("rev-parse", "--is-inside-work-tree")
    Write-DeployLog "[OK] Project root validated: $ProjectRoot" Green
}

function Confirm-DirtyTree {
    $status = (& git status --porcelain 2>&1)
    if ($LASTEXITCODE -ne 0) {
        Fail-Deploy "Working tree safety" "Unable to read git working tree status."
    }

    if (-not $status) {
        Write-DeployLog "[OK] No uncommitted changes detected" Green
        return
    }

    Write-DeployLog "[WARNING] Uncommitted changes detected." Yellow
    Write-DeployLog "The rollback tag will point to the latest commit only; uncommitted files are not captured by git tags." Yellow
    foreach ($line in $status) {
        Write-DeployLog "  $line" Yellow
    }

    $confirmation = Read-Host "Type DEPLOY to continue anyway, or press Enter to cancel"
    if ($confirmation -ne "DEPLOY") {
        Fail-Deploy "Working tree safety" "Deployment cancelled by operator because the working tree has uncommitted changes."
    }
}

function Invoke-DeployTarget {
    param(
        [Parameter(Mandatory = $true)][string]$Step,
        [Parameter(Mandatory = $true)][string[]]$FirebaseArguments
    )

    if ($DryRun) {
        Write-DeployLog "[DRY RUN] Would run: firebase $($FirebaseArguments -join ' ')" Yellow
        return
    }

    Invoke-LoggedCommand $Step "firebase" $FirebaseArguments
}

try {
    Write-DeployLog "ASG Leads Web App deployment started"
    Write-DeployLog "Project root: $ProjectRoot"
    Write-DeployLog "Log file: $LogFile"
    if ($DryRun) {
        Write-DeployLog "Mode: DRY RUN. Build and snapshot steps run, Firebase deploy commands are printed but not executed." Yellow
    }

    Write-DeploySection "PHASE 1 - ENVIRONMENT VALIDATION"
    Require-Command "git" "Install Git for Windows and ensure git.exe is on PATH."
    Require-Command "firebase" "Install the Firebase CLI with: npm install -g firebase-tools"
    Require-Command "npm" "Install Node.js LTS, which includes npm."
    Test-ProjectRoot
    Test-FirebaseLogin

    Write-DeploySection "PHASE 2 - WORKING TREE SAFETY"
    $branch = Get-GitValue "Working tree safety" @("rev-parse", "--abbrev-ref", "HEAD")
    $commit = Get-GitValue "Working tree safety" @("rev-parse", "HEAD")
    Write-DeployLog "Branch: $branch"
    Write-DeployLog "Commit: $commit"
    Confirm-DirtyTree

    Write-DeploySection "PHASE 3 - PRE-DEPLOY SNAPSHOT"
    $tagName = "pre-deploy-$Stamp"
    Invoke-LoggedCommand "Pre-deploy snapshot" "git" @("tag", $tagName)
    Write-DeployLog "Created rollback tag: $tagName" Green
    Write-DeployLog "Snapshot timestamp: $($StartedAt.ToString("yyyy-MM-dd HH:mm:ss zzz"))"
    Write-DeployLog "Snapshot branch: $branch"
    Write-DeployLog "Snapshot commit: $commit"

    Write-DeploySection "PHASE 4 - VALIDATION"
    if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot "node_modules"))) {
        Invoke-LoggedCommand "Dependency install" "npm" @("install")
    } else {
        Write-DeployLog "[OK] node_modules exists; skipping npm install" Green
    }

    Invoke-LoggedCommand "TypeScript validation" "npx" @("tsc", "--noEmit", "--noUnusedLocals", "false", "--noUnusedParameters", "false")
    Invoke-LoggedCommand "Production build" "npm" @("run", "build")

    Write-DeploySection "PHASE 5 - FIREBASE DEPLOY"
    Invoke-DeployTarget "Deploy Firestore rules" @("deploy", "--only", "firestore:rules")
    Invoke-DeployTarget "Deploy Firestore indexes" @("deploy", "--only", "firestore:indexes")
    Invoke-DeployTarget "Deploy hosting" @("deploy", "--only", "hosting")

    if (Test-Path -LiteralPath (Join-Path $ProjectRoot "functions")) {
        Invoke-DeployTarget "Deploy functions" @("deploy", "--only", "functions")
    } else {
        Write-DeployLog "No functions directory found; skipping functions deploy." Yellow
    }

    $script:DeployResult = if ($DryRun) { "DRY RUN SUCCESS" } else { "SUCCESS" }
    $duration = New-TimeSpan -Start $StartedAt -End (Get-Date)

    Write-DeploySection "DEPLOYMENT SUCCESS"
    Write-DeployLog "Result: $script:DeployResult" Green
    Write-DeployLog "Rollback tag: $tagName"
    Write-DeployLog "Duration: $($duration.ToString())"
    Write-DeployLog "Log file: $LogFile"

    Write-Host ""
    Write-Host "############################################################" -ForegroundColor Green
    Write-Host "#                 DEPLOYMENT SUCCESSFUL                    #" -ForegroundColor Green
    Write-Host "############################################################" -ForegroundColor Green
    exit 0
}
catch {
    $duration = New-TimeSpan -Start $StartedAt -End (Get-Date)
    if (-not $script:FailedStep) {
        $script:FailedStep = "Unexpected script error"
    }

    Write-DeploySection "DEPLOYMENT FAILED"
    Write-DeployLog "Result: FAILED" Red
    Write-DeployLog "Failed step: $script:FailedStep" Red
    if ($script:CurrentCommand) {
        Write-DeployLog "Active command: $script:CurrentCommand" Red
    }
    Write-DeployLog "Error: $($_.Exception.Message)" Red
    Write-DeployLog "Duration: $($duration.ToString())"
    Write-DeployLog "Log file: $LogFile"
    Write-DeployLog "No later deployment phases were run after the failure." Yellow

    Write-Host ""
    Write-Host "############################################################" -ForegroundColor Red
    Write-Host "#                   DEPLOYMENT FAILED                      #" -ForegroundColor Red
    Write-Host "############################################################" -ForegroundColor Red
    Write-Host "Failed step: $script:FailedStep" -ForegroundColor Red
    Write-Host "See log: $LogFile" -ForegroundColor Yellow
    exit 1
}
