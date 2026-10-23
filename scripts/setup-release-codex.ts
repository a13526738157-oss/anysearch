import { parsePortableSetupArguments, preparePortableCodexSetup } from '../src/adapters/mcp/portable-setup.ts';
import { printFailure, printResult } from '../src/distribution/cli.ts';

try { printResult(preparePortableCodexSetup(parsePortableSetupArguments(process.argv.slice(2)))); }
catch (error) { printFailure(error); }
