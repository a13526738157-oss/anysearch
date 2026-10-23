import { parseArgs } from 'node:util';
import type { ContentLevel } from '../../core/contracts.ts';
import { contentAccessProfile } from './content-access.ts';

export interface SetupArguments {
  operation: 'preview' | 'provision' | 'status' | 'revoke';
  apply: boolean;
  contentLevel: ContentLevel;
}

export function parseSetupArguments(args: string[]): SetupArguments {
  const parsed = parseArgs({
    args, allowPositionals: true, strict: true, tokens: true,
    options: { apply: { type: 'boolean' }, 'content-level': { type: 'string' } },
  });
  const optionNames = parsed.tokens.filter(token => token.kind === 'option').map(token => token.name);
  if (new Set(optionNames).size !== optionNames.length || parsed.positionals.length !== 1) {
    throw new Error('INVALID_SETUP_ARGUMENTS');
  }
  const operation = parsed.positionals[0];
  if (operation !== 'preview' && operation !== 'provision' && operation !== 'status' && operation !== 'revoke') {
    throw new Error('INVALID_SETUP_ARGUMENTS');
  }
  const level = parsed.values['content-level'] ?? 'metadata';
  if (level !== 'metadata' && level !== 'public_text') throw new Error('INVALID_CONTENT_LEVEL');
  const contentLevel = contentAccessProfile(level).contentLevel;
  const apply = parsed.values.apply ?? false;
  if ((operation === 'provision' || operation === 'revoke') !== apply) {
    throw new Error('EXPLICIT_APPLY_REQUIRED');
  }
  return { operation, apply, contentLevel };
}
