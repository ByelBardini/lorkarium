import type { CreateSheetTemplateRequestDto } from '@lorkarium/contracts';
import { useState } from 'react';
import { sheetTemplateFileProblemMessage } from '@/features/sheets/sheet-template-messages';
import {
  readSheetTemplateFile,
  sheetTemplateFileTooLarge,
  type SheetTemplateFileContent,
} from '@/lib/sheet-template-file';

export type PendingSheetTemplateImport = Readonly<{
  folderId: string | null;
  template: SheetTemplateFileContent;
}>;

export type SheetTemplateImportPorts = Readonly<{
  /** Creates the template; resolves when the library was read again. */
  importTemplate: (template: CreateSheetTemplateRequestDto) => Promise<void>;
  /** The library's last refusal, read after the create resolves. */
  refusal: string | null;
}>;

export type SheetTemplateImporter = Readonly<{
  /** The `ref` of the hidden file input. */
  attachInput: (input: HTMLInputElement | null) => void;
  /** "Importar modelo de ficha" (`null` = the root): opens the file picker for that folder. */
  choose: (folderId: string | null) => void;
  readFile: (file: File | undefined) => Promise<void>;
  /** Why the picked file was refused, before any confirmation. */
  problem: string | null;
  /** The file read and waiting for "Importar". */
  pending: PendingSheetTemplateImport | null;
  sending: boolean;
  /** The server's refusal of the create; the dialog stays open. */
  sendError: string | null;
  confirm: (name: string) => Promise<void>;
  cancel: () => void;
}>;

async function readPicked(file: File): Promise<ReturnType<typeof readSheetTemplateFile>> {
  if (sheetTemplateFileTooLarge(file.size)) return { ok: false, problem: 'over_budget' };
  return readSheetTemplateFile(await file.text());
}

/** The import of a `.lksheet`: pick a file for a folder, read it in the client, then create the
 *  template only after the master confirms; a refused file creates nothing.
 *
 *  Example: `const importer = useSheetTemplateImport({ importTemplate, refusal }); importer.choose(folderId)` */
export function useSheetTemplateImport(ports: SheetTemplateImportPorts): SheetTemplateImporter {
  const [input, attachInput] = useState<HTMLInputElement | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingSheetTemplateImport | null>(null);
  const [phase, setPhase] = useState<'idle' | 'sending' | 'sent'>('idle');
  // The library's refusal is only known once the create resolved and the outcome re-rendered.
  const sent = phase === 'sent';
  const imported = sent && !ports.refusal;
  // A finished import is forgotten, so a later refusal of another action does not reopen it.
  if (imported) {
    setPhase('idle');
    setPending(null);
  }
  const readFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    const reading = await readPicked(file);
    setProblem(reading.ok ? null : sheetTemplateFileProblemMessage(reading.problem));
    setPhase('idle');
    setPending(reading.ok ? { folderId, template: reading.template } : null);
  };
  const confirm = async (name: string): Promise<void> => {
    if (!pending) return;
    setPhase('sending');
    await ports.importTemplate({ ...pending.template, name, folderId: pending.folderId });
    setPhase('sent');
  };
  const choose = (folder: string | null): void => {
    setFolderId(folder);
    input?.click();
  };
  return {
    attachInput,
    choose,
    readFile,
    problem,
    pending: imported ? null : pending,
    sending: phase === 'sending',
    sendError: sent ? ports.refusal : null,
    confirm,
    cancel: () => setPending(null),
  };
}
