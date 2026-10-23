export const RELEASE_FORMAT = 1;
export const MANIFEST_NAME = 'release-manifest.json';
export const DATA_APPLICATION_ID = 0x41535931;
export const DATA_SCHEMA_VERSION = 4;

export interface PayloadFile { path: string; size: number; sha256: string }
export interface SourceFile { source: string; path: string }
export interface ComponentNotice {
  id: string;
  name: string;
  version: string;
  license: string;
  source: string;
  files: string[];
  provenance: 'installed-package' | 'explicit-input';
}
export interface ReleaseManifest {
  format: 1;
  product: 'AnySearch';
  version: string;
  platform: 'win32';
  arch: 'x64';
  payload: 'full';
  data: { applicationId: number; schemaVersion: number; rollback: 'program-only' };
  runtime: { node: string; electron: string; dependencies: string[] };
  models: { embedding: string; reranker: string };
  notices: ComponentNotice[];
  files: PayloadFile[];
}
export interface LicenseInput {
  id: string;
  name: string;
  version: string;
  license: string;
  source: string;
  files: string[];
}
export interface PackageOptions { projectDirectory: string; outputDirectory: string; licenseInputPath: string; apply: boolean }
export interface InstallOptions { packageDirectory: string; installRoot: string; apply: boolean }

export function fail(code: string): never { throw new Error(code); }
export function releaseVersion(value: unknown): string {
  if (typeof value !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/u.test(value)
    || value.length > 80) fail('RELEASE_VERSION_INVALID');
  return value;
}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('RELEASE_METADATA_INVALID');
  return value as Record<string, unknown>;
}
export function textValue(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048 || /[\u0000-\u001f\u007f]/u.test(value)) {
    fail('RELEASE_METADATA_INVALID');
  }
  return value;
}
export function stringArray(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 100_000) fail('RELEASE_METADATA_INVALID');
  return value.map(textValue);
}
