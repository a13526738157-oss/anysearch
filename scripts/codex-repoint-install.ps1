#requires -Version 5.1
param(
  [Parameter(Mandatory = $true)][string]$PlanPath,
  [switch]$Apply
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$utf8 = [System.Text.UTF8Encoding]::new($false, $true)
$maximumConfigBytes = 1048576
$jsonString = '"(?:[^"\\\x00-\x1f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"'

function Get-Sha256([byte[]]$Bytes) {
  $algorithm = [System.Security.Cryptography.SHA256]::Create()
  try { return ([System.BitConverter]::ToString($algorithm.ComputeHash($Bytes))).Replace('-', '').ToLowerInvariant() }
  finally { $algorithm.Dispose() }
}

function Get-LocalPath([string]$Path) {
  if ($Path -cnotmatch '^[A-Za-z]:[\\/]' -or $Path.Substring(2).Contains(':') -or $Path -match '[\x00-\x1f\x7f]') {
    throw 'RELEASE_CODEX_INSTALL_INVALID_PATH'
  }
  return [System.IO.Path]::GetFullPath($Path)
}

function Get-CheckedFile([string]$Path) {
  $full = Get-LocalPath $Path
  $item = Get-Item -LiteralPath $full -Force
  if ($item.PSIsContainer) { throw 'RELEASE_CODEX_INSTALL_INVALID_PATH' }
  $ancestor = $item
  while ($null -ne $ancestor) {
    if (($ancestor.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw 'RELEASE_CODEX_INSTALL_INDIRECT_PATH'
    }
    if ($ancestor -is [System.IO.FileInfo]) { $ancestor = $ancestor.Directory }
    else { $ancestor = $ancestor.Parent }
  }
  return $full
}

function Read-Stream([System.IO.FileStream]$Stream, [long]$Maximum) {
  if ($Stream.Length -gt $Maximum) { throw 'RELEASE_CODEX_INSTALL_TOO_LARGE' }
  $bytes = [byte[]]::new([int]$Stream.Length)
  $Stream.Position = 0
  $offset = 0
  while ($offset -lt $bytes.Length) {
    $count = $Stream.Read($bytes, $offset, $bytes.Length - $offset)
    if ($count -le 0) { throw 'RELEASE_CODEX_INSTALL_SHORT_READ' }
    $offset += $count
  }
  return ,$bytes
}

function Read-Plan([string]$Path) {
  $file = [System.IO.File]::Open((Get-CheckedFile $Path), [System.IO.FileMode]::Open,
    [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
  try { $text = $utf8.GetString((Read-Stream $file 65536)) }
  finally { $file.Dispose() }
  # Only plans emitted by the bundled generator should be reviewed and applied.
  $document = ConvertFrom-Json -InputObject $text
  if ($null -eq $document -or $document -isnot [System.Management.Automation.PSCustomObject]) {
    throw 'RELEASE_CODEX_INSTALL_INVALID_PLAN'
  }
  $allowed = @('version', 'configPath', 'serverName', 'operation', 'originalSha256', 'resultSha256', 'beforeText', 'afterText')
  $names = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
  $plan = @{}
  foreach ($property in $document.PSObject.Properties) {
    $key = $property.Name
    if ($key -cnotin $allowed -or -not $names.Add($key)) { throw 'RELEASE_CODEX_INSTALL_INVALID_PLAN' }
    $value = $property.Value
    if ($key -ceq 'version') {
      if (($value -isnot [int] -and $value -isnot [long]) -or $value -ne 2) { throw 'RELEASE_CODEX_INSTALL_INVALID_PLAN' }
    } else {
      if ($value -isnot [string]) { throw 'RELEASE_CODEX_INSTALL_INVALID_PLAN' }
      $plan[$key] = $value
    }
  }
  if ($names.Count -ne $allowed.Count
    -or $plan.originalSha256 -cnotmatch '^[a-f0-9]{64}$' -or $plan.resultSha256 -cnotmatch '^[a-f0-9]{64}$'
    -or $plan.serverName -cnotin @('anysearch', 'anysearch_public_text')
    -or $plan.operation -cnotin @('append', 'repoint', 'unchanged')) { throw 'RELEASE_CODEX_INSTALL_INVALID_PLAN' }
  return $plan
}

function Read-CanonicalBlock([string]$Text, [string]$ServerName, [bool]$RequirePortable) {
  if ($utf8.GetByteCount($Text) -gt 32768) { throw 'RELEASE_CODEX_INSTALL_TOO_LARGE' }
  $header = [regex]::Escape('mcp_servers.' + $ServerName)
  $nl = '\r?\n'
  $pattern = '\A\[' + $header + '\]' + $nl + 'command = (?<command>' + $jsonString + ')' + $nl +
    'args = (?<args>\[ ' + $jsonString + '(?:, ' + $jsonString + ')* \])' + $nl +
    'cwd = (?<cwd>' + $jsonString + ')' + $nl + 'enabled = true' + $nl +
    'enabled_tools = \[ "search", "read" \]' + $nl + 'default_tools_approval_mode = "prompt"' + $nl + $nl +
    '\[' + $header + '\.tools.search\]' + $nl + 'approval_mode = "approve"' + $nl + $nl +
    '\[' + $header + '\.tools.read\]' + $nl + 'approval_mode = "approve"' + $nl +
    '(?<environment>' + $nl + '\[' + $header + '\.env\]' + $nl + 'NODE_OPTIONS = ""' + $nl + 'NODE_PATH = ""' + $nl + ')?\z'
  $match = [regex]::Match($Text, $pattern, [System.Text.RegularExpressions.RegexOptions]::None,
    [System.TimeSpan]::FromSeconds(1))
  if (-not $match.Success) { throw 'RELEASE_CODEX_INSTALL_UNSAFE_BLOCK' }
  $command = Get-LocalPath (ConvertFrom-Json -InputObject $match.Groups['command'].Value)
  $cwd = Get-LocalPath (ConvertFrom-Json -InputObject $match.Groups['cwd'].Value)
  $arguments = @(ConvertFrom-Json -InputObject $match.Groups['args'].Value)
  $legacy = $arguments.Count -eq 3 -and $arguments[1] -ceq '--connection'
  $portable = $arguments.Count -eq 4 -and $arguments[0] -ceq '--no-global-search-paths' -and $arguments[2] -ceq '--connection'
  if (-not ($legacy -or $portable) -or [System.IO.Path]::GetFileName($command) -ine 'node.exe'
    -or ($RequirePortable -and -not $portable)
    -or ($portable -and -not $match.Groups['environment'].Success)) { throw 'RELEASE_CODEX_INSTALL_UNSAFE_BLOCK' }
  if ($legacy) {
    $entry = Get-LocalPath $arguments[0]
    $connection = Get-LocalPath $arguments[2]
    $expectedEntry = [System.IO.Path]::Combine($cwd, 'dist\mcp\main.cjs')
  } else {
    $entry = Get-LocalPath $arguments[1]
    $connection = Get-LocalPath $arguments[3]
    $expectedEntry = [System.IO.Path]::Combine($cwd, 'dist\release\mcp-entry.cjs')
    if ($command -ine [System.IO.Path]::Combine($cwd, 'runtime\node\node.exe')) { throw 'RELEASE_CODEX_INSTALL_UNSAFE_BLOCK' }
  }
  if ($entry -ine $expectedEntry) { throw 'RELEASE_CODEX_INSTALL_UNSAFE_BLOCK' }
  return @{ connection = $connection }
}

function New-PrivateBackup([string]$Path, [byte[]]$Bytes) {
  $user = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
  $system = [System.Security.Principal.SecurityIdentifier]::new('S-1-5-18')
  $security = [System.Security.AccessControl.FileSecurity]::new()
  $security.SetOwner($user)
  $security.SetAccessRuleProtection($true, $false)
  foreach ($identity in @($user, $system)) {
    $security.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($identity,
      [System.Security.AccessControl.FileSystemRights]::FullControl, [System.Security.AccessControl.AccessControlType]::Allow))
  }
  if ($PSVersionTable.PSVersion.Major -ge 7) {
    $file = [System.IO.FileSystemAclExtensions]::Create([System.IO.FileInfo]::new($Path),
      [System.IO.FileMode]::CreateNew, [System.Security.AccessControl.FileSystemRights]::FullControl,
      [System.IO.FileShare]::None, 4096, [System.IO.FileOptions]::WriteThrough, $security)
  } else {
    $file = [System.IO.FileStream]::new($Path, [System.IO.FileMode]::CreateNew,
      [System.Security.AccessControl.FileSystemRights]::FullControl, [System.IO.FileShare]::None,
      4096, [System.IO.FileOptions]::WriteThrough, $security)
  }
  try {
    $file.Write($Bytes, 0, $Bytes.Length)
    $file.Flush($true)
    if ((Get-Sha256 (Read-Stream $file $maximumConfigBytes)) -cne (Get-Sha256 $Bytes)) {
      throw 'RELEASE_CODEX_INSTALL_BACKUP_FAILED'
    }
  } finally { $file.Dispose() }
}

$config = $null
try {
  if ([System.Environment]::OSVersion.Platform -ne [System.PlatformID]::Win32NT) { throw 'RELEASE_CODEX_INSTALL_WINDOWS_REQUIRED' }
  $plan = Read-Plan $PlanPath
  $configPath = Get-CheckedFile $plan.configPath
  if ([System.IO.Path]::GetFileName($configPath) -cne 'config.toml') { throw 'RELEASE_CODEX_INSTALL_INVALID_PATH' }
  $after = Read-CanonicalBlock ($plan.afterText.TrimStart([char[]]"`r`n")) $plan.serverName $true
  if ($plan.operation -ceq 'append') {
    if ($plan.beforeText -cne '' -or $plan.afterText -cnotmatch '\A(?:\r?\n){0,2}\[') {
      throw 'RELEASE_CODEX_INSTALL_INVALID_PLAN'
    }
  } else {
    $before = Read-CanonicalBlock $plan.beforeText $plan.serverName $false
    if ($before.connection -ine $after.connection -or ($plan.operation -ceq 'unchanged' -and $plan.beforeText -cne $plan.afterText)) {
      throw 'RELEASE_CODEX_INSTALL_CONNECTION_CHANGE'
    }
  }
  $access = if ($Apply) { [System.IO.FileAccess]::ReadWrite } else { [System.IO.FileAccess]::Read }
  $sharing = if ($Apply) { [System.IO.FileShare]::None } else { [System.IO.FileShare]::Read }
  $config = [System.IO.File]::Open($configPath, [System.IO.FileMode]::Open, $access, $sharing)
  $original = Read-Stream $config $maximumConfigBytes
  if ((Get-Sha256 $original) -cne $plan.originalSha256) { throw 'RELEASE_CODEX_INSTALL_CONCURRENT_CHANGE' }
  $originalText = $utf8.GetString($original)
  if ($plan.operation -ceq 'append') { $resultText = $originalText + $plan.afterText }
  else {
    $offset = $originalText.IndexOf($plan.beforeText, [System.StringComparison]::Ordinal)
    if ($offset -lt 0 -or ($offset -gt 0 -and $originalText[$offset - 1] -cne "`n")
      -or $originalText.IndexOf($plan.beforeText, $offset + $plan.beforeText.Length, [System.StringComparison]::Ordinal) -ge 0) {
      throw 'RELEASE_CODEX_INSTALL_SECTION_CHANGED'
    }
    $resultText = $originalText.Substring(0, $offset) + $plan.afterText + $originalText.Substring($offset + $plan.beforeText.Length)
  }
  $result = $utf8.GetBytes($resultText)
  if ($result.Length -gt $maximumConfigBytes -or (Get-Sha256 $result) -cne $plan.resultSha256) {
    throw 'RELEASE_CODEX_INSTALL_RESULT_MISMATCH'
  }
  if (-not $Apply -or $plan.operation -ceq 'unchanged') {
    @{ status = $(if ($Apply) { 'unchanged' } else { 'preview' }); configPath = $configPath;
      serverName = $plan.serverName; change = $plan.operation; configurationChanged = $false } | ConvertTo-Json -Compress
    return
  }
  $backupPath = [System.IO.Path]::Combine([System.IO.Path]::GetDirectoryName($configPath),
    ('config.toml.anysearch-portable-backup-' + [System.Guid]::NewGuid().ToString('N') + '.bak'))
  New-PrivateBackup $backupPath $original
  try {
    $config.Position = 0
    $config.Write($result, 0, $result.Length)
    $config.SetLength($result.Length)
    $config.Flush($true)
    if ((Get-Sha256 (Read-Stream $config $maximumConfigBytes)) -cne $plan.resultSha256) {
      throw 'RELEASE_CODEX_INSTALL_READBACK_MISMATCH'
    }
  } catch {
    try {
      $config.Position = 0
      $config.Write($original, 0, $original.Length)
      $config.SetLength($original.Length)
      $config.Flush($true)
      if ((Get-Sha256 (Read-Stream $config $maximumConfigBytes)) -cne $plan.originalSha256) {
        throw 'RELEASE_CODEX_INSTALL_ROLLBACK_FAILED'
      }
    } catch { throw 'RELEASE_CODEX_INSTALL_ROLLBACK_FAILED' }
    throw 'RELEASE_CODEX_INSTALL_WRITE_FAILED'
  }
  @{ status = 'installed'; configPath = $configPath; backupPath = $backupPath; serverName = $plan.serverName;
    change = $plan.operation; configurationChanged = $true; runtimeLoaded = $false; grantOperation = 'none' } | ConvertTo-Json -Compress
} catch {
  $code = $_.Exception.Message
  if ($code -cnotmatch '^RELEASE_CODEX_INSTALL_[A-Z_]+$') { $code = 'RELEASE_CODEX_INSTALL_IO_FAILED' }
  [Console]::Error.WriteLine($code)
  exit 1
} finally { if ($null -ne $config) { $config.Dispose() } }
