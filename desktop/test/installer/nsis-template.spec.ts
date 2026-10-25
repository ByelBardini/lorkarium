import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// No NSIS run in the unit suite: these guard the copied Tauri template and its wiring, the parts
// a CLI bump or a careless edit breaks silently (the installer still builds, the updater does not).

const TAURI_DIR = fileURLToPath(new URL('../../src-tauri/', import.meta.url));
const NSIS_DIR = `${TAURI_DIR}nsis/`;
const BOM = '﻿';

interface NsisBundleConfig {
  template: string;
  installerHooks: string;
  installerIcon: string;
}

function readText(path: string): string {
  return readFileSync(path, 'utf8');
}

function nsisConfig(): NsisBundleConfig {
  const config = JSON.parse(readText(`${TAURI_DIR}tauri.conf.json`)) as {
    bundle: { windows: { nsis: NsisBundleConfig } };
  };
  return config.bundle.windows.nsis;
}

function hookFiles(): string[] {
  return readdirSync(NSIS_DIR).filter((name) => name.endsWith('.nsh'));
}

function matchesOf(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map((match) => match[1] ?? '');
}

const template = readText(`${NSIS_DIR}installer.nsi`);

describe('NSIS installer template', () => {
  it('is wired in tauri.conf.json to files that exist', () => {
    const { template: templatePath, installerHooks, installerIcon } = nsisConfig();

    for (const path of [templatePath, installerHooks, installerIcon]) {
      expect(existsSync(`${TAURI_DIR}${path}`), path).toBe(true);
    }
  });

  it('was copied from the installed @tauri-apps/cli, so a CLI bump forces a review of the copy', () => {
    const require = createRequire(import.meta.url);
    const { version } = require('@tauri-apps/cli/package.json') as { version: string };

    expect(template).toContain(`(tauri-cli-v${version},`);
  });

  it('keeps what the updater and the uninstall rely on from the upstream template', () => {
    const upstreamMarkers = [
      '${GetOptions} $CMDLINE "/P" $PassiveMode',
      '${GetOptions} $CMDLINE "/UPDATE" $UpdateMode',
      '"$(silentDowngrades)"',
      'Section WebView2',
      'Section Install',
      'Section Uninstall',
      'Function .onInstSuccess',
      'Function RunMainBinary',
      'Function CreateOrUpdateDesktopShortcut',
      '!insertmacro NSIS_HOOK_POSTINSTALL',
      '!insertmacro NSIS_HOOK_POSTUNINSTALL',
      '${If} $DeleteAppDataCheckboxState = 1',
      '!insertmacro MUI_PAGE_INSTFILES',
      '!insertmacro MUI_UNPAGE_INSTFILES',
    ];

    for (const marker of upstreamMarkers) expect(template, marker).toContain(marker);
  });

  it('only inserts Lorkarium macros that the hook files define', () => {
    const defined = hookFiles().flatMap((name) =>
      matchesOf(readText(`${NSIS_DIR}${name}`), /^!macro (LK_\w+)/gm),
    );
    const inserted = matchesOf(template, /^!insertmacro (LK_\w+)/gm);

    expect(inserted).toEqual([
      'LK_PAGE_HOME',
      'LK_STYLE_INSTFILES',
      'LK_PAGE_DONE',
      'LK_UNPAGE_CONFIRM',
      'LK_STYLE_UNINSTFILES',
      'LK_UNPAGE_DONE',
    ]);
    for (const macro of inserted) expect(defined, macro).toContain(macro);
  });

  it('ships every hero bitmap the hooks embed', () => {
    const scales = matchesOf(readText(`${NSIS_DIR}lorkarium-ui.nsh`), /\\hero-(\d+)\.bmp/g);

    expect(scales).toEqual(['125', '150', '200', '100']);
    for (const scale of scales) expect(existsSync(`${NSIS_DIR}art/hero-${scale}.bmp`)).toBe(true);
  });

  it('saves the hook files with accents as UTF-8 with BOM, or makensis reads them as ANSI', () => {
    for (const name of hookFiles()) {
      const text = readText(`${NSIS_DIR}${name}`);
      const hasNonAscii = [...text.replace(BOM, '')].some((char) => char.charCodeAt(0) > 127);
      if (hasNonAscii) expect(text.startsWith(BOM), name).toBe(true);
    }
  });
});
