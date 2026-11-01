import { createRequire } from 'node:module';

const pkg = createRequire(import.meta.url)('../package.json') as { name: string; version: string };

export const PACKAGE_NAME = pkg.name;
export const PACKAGE_VERSION = pkg.version;
