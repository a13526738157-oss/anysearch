param([switch]$Apply)
$ErrorActionPreference = 'Stop'

$project = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$directory = [System.IO.Path]::GetFullPath((Join-Path $project '.local\codex-connection'))
if ($directory -ne (Join-Path $project '.local\codex-connection')) { throw 'Unexpected connection directory.' }

$ancestor = $directory
while ($ancestor) {
  if (Test-Path -LiteralPath $ancestor) {
    $item = Get-Item -LiteralPath $ancestor -Force
    if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) { throw 'Reparse points are not allowed for credential storage.' }
  }
  $ancestor = [System.IO.Path]::GetDirectoryName($ancestor)
}

$userSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$systemSid = [System.Security.Principal.SecurityIdentifier]::new('S-1-5-18')
$allowed = @($userSid.Value, $systemSid.Value)

if ($Apply) {
  [void][System.IO.Directory]::CreateDirectory($directory)
  $acl = [System.Security.AccessControl.DirectorySecurity]::new()
  $acl.SetOwner($userSid)
  $acl.SetAccessRuleProtection($true, $false)
  foreach ($sid in @($userSid, $systemSid)) {
    $rule = [System.Security.AccessControl.FileSystemAccessRule]::new(
      $sid, [System.Security.AccessControl.FileSystemRights]::FullControl,
      ([System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit),
      [System.Security.AccessControl.PropagationFlags]::None, [System.Security.AccessControl.AccessControlType]::Allow)
    $acl.AddAccessRule($rule)
  }
  Set-Acl -LiteralPath $directory -AclObject $acl
}

if (-not (Test-Path -LiteralPath $directory -PathType Container)) { throw 'Protected connection directory has not been prepared.' }
$targets = @((Get-Item -LiteralPath $directory -Force)) + @(Get-ChildItem -LiteralPath $directory -Force)
foreach ($target in $targets) {
  if ($target.Attributes -band [System.IO.FileAttributes]::ReparsePoint) { throw 'Unexpected credential target.' }
  if ($target.FullName -ne $directory -and $target.PSIsContainer) { throw 'Unexpected credential subdirectory.' }
  $acl = Get-Acl -LiteralPath $target.FullName
  if ($allowed -notcontains $acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value) { throw 'Credential owner is not trusted.' }
  $rules = @($acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
  if ($rules.Count -eq 0) { throw 'Credential ACL is empty.' }
  $userHasRead = $false
  foreach ($rule in $rules) {
    if ($rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow -or $allowed -notcontains $rule.IdentityReference.Value) {
      throw 'Credential ACL contains unexpected access.'
    }
    if ($rule.IdentityReference.Value -eq $userSid.Value -and
      -not ($rule.PropagationFlags -band [System.Security.AccessControl.PropagationFlags]::InheritOnly) -and
      ($rule.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::ReadData)) { $userHasRead = $true }
  }
  if (-not $userHasRead) { throw 'Current user cannot read credential storage.' }
  if ($target.FullName -eq $directory -and -not $acl.AreAccessRulesProtected) { throw 'Credential directory still inherits broad access.' }
}
Write-Output 'Credential directory ACL verified: current user and SYSTEM only. Same-user processes remain trusted.'
