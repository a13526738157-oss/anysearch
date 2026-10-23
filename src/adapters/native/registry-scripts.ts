import { NATIVE_HOST_NAME } from '../../connectors/protocol.ts';

export const registryKey = `Software\\Google\\Chrome\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`;

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function registryScript(manifestPath: string, action: 'install' | 'uninstall'): string {
  const operation = action === 'install' ? installBody : uninstallBody;
  return `param([switch]$Apply)
$ErrorActionPreference = 'Stop'
$keyPath = ${quote(registryKey)}
$manifestPath = ${quote(manifestPath)}
Write-Output '${action}: HKCU Registry32 NativeMessagingHosts/${NATIVE_HOST_NAME}'
Write-Output $manifestPath
if (-not $Apply) { Write-Output 'Preview only. Review the generated files before using -Apply.'; return }
$base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser, [Microsoft.Win32.RegistryView]::Registry32)
$key = $null
try {
  $key = $base.OpenSubKey($keyPath, $true)
${operation}
} finally {
  if ($null -ne $key) { $key.Dispose() }
  $base.Dispose()
}
`;
}

const installBody = `  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw 'Native host manifest is missing.' }
  if ($null -ne $key) {
    if ($key.ValueCount -ne 1 -or $key.SubKeyCount -ne 0 -or $key.GetValue('') -ne $manifestPath) {
      throw 'An existing registration differs. Refusing to overwrite it.'
    }
    Write-Output 'The same host is already registered.'
    return
  }
  $key = $base.CreateSubKey($keyPath)
  $key.SetValue('', $manifestPath, [Microsoft.Win32.RegistryValueKind]::String)
  Write-Output 'Registered for the current Windows user. No HKLM, Codex configuration, or Chrome profile was changed.'`;

const uninstallBody = `  if ($null -eq $key) { Write-Output 'No registration exists.'; return }
  if ($key.ValueCount -ne 1 -or $key.SubKeyCount -ne 0 -or $key.GetValue('') -ne $manifestPath) {
    throw 'The registration no longer matches. Refusing to remove it.'
  }
  $key.Dispose()
  $key = $null
  $base.DeleteSubKey($keyPath, $false)
  Write-Output 'Removed only this host registration. Extension, database, and source bookmarks remain unchanged.'`;
