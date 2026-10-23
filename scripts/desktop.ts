import { resolve } from 'node:path';
import { launchDesktop, printDesktopLaunchResult } from './desktop-launcher.ts';

const root = resolve(import.meta.dirname, '..');
printDesktopLaunchResult(await launchDesktop(root));
