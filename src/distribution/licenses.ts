import { readdirSync } from 'node:fs';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { createHash } from 'node:crypto';
import type { ComponentNotice, LicenseInput, SourceFile } from './contracts.ts';
import { fail, record, stringArray, textValue } from './contracts.ts';
import type { LockedPackage } from './dependencies.ts';
import { readJson } from './files.ts';
import { localPath, payloadPath, regularFile } from './paths.ts';

function publicInputPath(path: string): string {
  const canonical = localPath(path);
  if (canonical.split(/[\\/]/u).some(part => /^(?:\.local|\.git|vault|obsidian|whb|tests?|verification|logs|reports)$/iu.test(part))) {
    fail('RELEASE_PRIVATE_LICENSE_INPUT_REJECTED');
  }
  return regularFile(canonical);
}

function publicSource(value: unknown): string {
  const source = textValue(value);
  let url: URL;
  try { url = new URL(source); } catch { return fail('RELEASE_LICENSE_SOURCE_INVALID'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    fail('RELEASE_LICENSE_SOURCE_INVALID');
  }
  return source;
}
export function readLicenseInputs(path: string): Map<string, LicenseInput> {
  const inputPath = publicInputPath(path);
  const input = readJson(inputPath, 1024 * 1024);
  if (input.version !== 1 || !Array.isArray(input.notices) || input.notices.length > 500) fail('RELEASE_LICENSE_INPUT_INVALID');
  const entries = new Map<string, LicenseInput>();
  for (const value of input.notices) {
    const notice = record(value);
    const id = textValue(notice.id);
    const files = stringArray(notice.files).map(file => {
      if (!/^(?:licen[cs]e|copying|notice|third[-_]?party)(?:[._-].*)?$/iu.test(basename(file))) {
        fail('RELEASE_LICENSE_FILENAME_REQUIRED');
      }
      return publicInputPath(isAbsolute(file) ? file : join(dirname(inputPath), payloadPath(file)));
    });
    if (entries.has(id) || files.length === 0 || files.length > 50) fail('RELEASE_LICENSE_INPUT_INVALID');
    entries.set(id, { id, name: textValue(notice.name), version: textValue(notice.version),
      license: textValue(notice.license), source: publicSource(notice.source), files });
  }
  return entries;
}
export class NoticeCollector {
  readonly notices: ComponentNotice[] = [];
  readonly files: SourceFile[] = [];
  private readonly inputs: Map<string, LicenseInput>;
  constructor(inputs: Map<string, LicenseInput>) { this.inputs = inputs; }

  explicit(id: string, name: string, version: string): void {
    const input = this.inputs.get(id);
    if (!input || input.name !== name || input.version !== version) fail('RELEASE_EXPLICIT_LICENSE_REQUIRED');
    this.add(input, 'explicit-input');
  }
  package(project: string, pkg: LockedPackage): void {
    const id = `npm:${pkg.directory}@${pkg.version}`;
    if (this.notices.some(notice => notice.id === id)) return;
    if (this.inputs.has(id)) { this.explicit(id, pkg.name, pkg.version); return; }
    if (!pkg.license || /UNLICENSED/iu.test(pkg.license)) fail('RELEASE_EXPLICIT_LICENSE_REQUIRED');
    const files = readdirSync(join(project, pkg.directory), { withFileTypes: true })
      .filter(entry => entry.isFile() && /^(?:licen[cs]e|copying|notice|third[-_]?party)(?:[._-].*)?$/iu.test(entry.name))
      .map(entry => regularFile(join(project, pkg.directory, entry.name)));
    if (!files.length) fail('RELEASE_EXPLICIT_LICENSE_REQUIRED');
    this.add({ id, name: pkg.name, version: pkg.version, license: pkg.license, source: publicSource(pkg.source), files }, 'installed-package');
  }
  private add(input: LicenseInput, provenance: ComponentNotice['provenance']): void {
    const id = createHash('sha256').update(input.id).digest('hex').slice(0, 20);
    const files = input.files.map((source, index) => {
      const path = `licenses/${id}/${index}-${basename(source)}`;
      this.files.push({ source, path });
      return path;
    });
    this.notices.push({ id: input.id, name: input.name, version: input.version, license: input.license,
      source: input.source, files, provenance });
  }
}
