import type { PackageOptions, ReleaseManifest } from './contracts.ts';
import { describeFile, writeNewVersion } from './files.ts';
import { packagePayload } from './payload.ts';

export function createRelease(options: PackageOptions): object {
  const plan = packagePayload(options.projectDirectory, options.outputDirectory, options.licenseInputPath);
  const descriptions = plan.files.map(describeFile);
  const manifest: ReleaseManifest = { ...plan.metadata, files: descriptions };
  if (!options.apply) return { operation: 'package-preview', apply: false, version: manifest.version, payload: 'full',
    target: plan.target, files: descriptions.length, bytes: descriptions.reduce((total, file) => total + file.size, 0),
    dependencies: manifest.runtime.dependencies, notices: manifest.notices.map(notice => ({
      id: notice.id, name: notice.name, version: notice.version, source: notice.source, provenance: notice.provenance,
    })), userDataIncluded: false, wroteFiles: false };
  const payloadDirectory = writeNewVersion(plan.target, plan.files, descriptions, JSON.stringify(manifest, null, 2) + '\n');
  return { operation: 'package', version: manifest.version, payloadDirectory, userDataIncluded: false,
    launched: false, settingsChanged: false };
}
