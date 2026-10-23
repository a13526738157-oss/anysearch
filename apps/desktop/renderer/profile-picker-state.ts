import type { ChromeProfileCandidate, ChromeProfileDiscovery } from '../../../src/adapters/chrome/profile-contracts.ts';

export type ProfileSelection = { kind: 'profile'; profileId: string } | { kind: 'current' } | null;

export function reconcileProfileSelection(
  selected: ProfileSelection,
  discovery: ChromeProfileDiscovery | null,
): ProfileSelection {
  if (selected?.kind === 'current') return selected;
  if (discovery === null) return selected;
  const profiles = discovery.state === 'ready' ? discovery.profiles : [];
  if (selected?.kind === 'profile') {
    return profiles.some(profile => profile.id === selected.profileId) ? selected : null;
  }
  const onlyProfile = profiles.length === 1 ? profiles[0] : undefined;
  return onlyProfile ? { kind: 'profile', profileId: onlyProfile.id } : null;
}

export function selectedChromeProfile(
  selected: ProfileSelection,
  discovery: ChromeProfileDiscovery | null,
): ChromeProfileCandidate | undefined {
  if (selected?.kind !== 'profile' || discovery?.state !== 'ready') return undefined;
  return discovery.profiles.find(profile => profile.id === selected.profileId);
}

export function profilePairingTarget(
  selected: ProfileSelection,
  discovery: ChromeProfileDiscovery | null,
): { profileId?: string } | null {
  if (selected?.kind === 'current') return {};
  const profile = selectedChromeProfile(selected, discovery);
  return profile ? { profileId: profile.id } : null;
}
