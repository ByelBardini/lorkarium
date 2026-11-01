import {
  FileCode2Icon,
  FilePlusIcon,
  FileUpIcon,
  FolderPlusIcon,
  Grid2X2PlusIcon,
  ImagePlusIcon,
  ScrollTextIcon,
  SquarePlusIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** What "Criar item" of the header makes, always at the root. */
export type LibraryCreateActions = Readonly<{
  grid: () => void;
  document: () => void;
  sheetTemplate: () => void;
  importSheetTemplate: () => void;
  sheet: () => void;
  image: () => void;
  folder: () => void;
}>;

/** The master's "Criar item" menu of the library header.
 *
 *  Example: `<LibraryCreateMenu live={live} create={{ grid, document, sheetTemplate, importSheetTemplate, sheet, image, folder }} />` */
export function LibraryCreateMenu({
  live,
  create,
}: Readonly<{ live: boolean; create: LibraryCreateActions }>): React.JSX.Element {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button size="icon" disabled={!live} aria-label="Criar item">
          <SquarePlusIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-44"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <DropdownMenuItem onSelect={create.grid}>
          <Grid2X2PlusIcon />
          Novo grid
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={create.document}>
          <FilePlusIcon />
          Novo documento
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={create.sheetTemplate}>
          <FileCode2Icon />
          Novo modelo de ficha
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={create.importSheetTemplate}>
          <FileUpIcon />
          Importar modelo de ficha
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={create.sheet}>
          <ScrollTextIcon />
          Nova ficha
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={create.image}>
          <ImagePlusIcon />
          Nova imagem
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={create.folder}>
          <FolderPlusIcon />
          Nova pasta
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
