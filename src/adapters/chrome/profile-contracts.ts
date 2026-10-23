export interface ChromeProfileCandidate {
  id: string;
  name: string;
  directoryName: string;
}

export interface ChromeProfileDiscovery {
  state: 'ready' | 'not-found' | 'unavailable';
  profiles: ChromeProfileCandidate[];
}

export interface ChromeProfileDiscoveryOptions {
  localAppData?: string;
  userDataDirectory?: string;
}

/** Main-process data only; never forward the filesystem paths to the renderer. */
export interface ResolvedChromeProfile extends ChromeProfileCandidate {
  userDataDirectory: string;
  profileDirectory: string;
}
