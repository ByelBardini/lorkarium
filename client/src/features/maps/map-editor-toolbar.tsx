import { MAP_POLYGON_VERTICES_MAX } from '@lorkarium/game-core';
import { Hexagon, MapPin, Pencil, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMapDrawingFlow, type MapDrawingTool } from '@/stores/map-drawing-flow';
import { mapDrawingFailureMessage } from './map-messages';
import type { MapEditor } from './use-map-editor';

/** The master's way into the editor of a map and, inside it, the tools and what they are saying.
 *
 *  Example: `<MapEditorToolbar editor={editor} />` */
export function MapEditorToolbar({ editor }: Readonly<{ editor: MapEditor }>): React.JSX.Element {
  if (editor.editing) return <EditingTools editor={editor} />;
  return (
    <Button size="sm" variant="outline" disabled={!editor.live} onClick={editor.open}>
      <Pencil aria-hidden="true" />
      Editar mapa
    </Button>
  );
}

function EditingTools({ editor }: Readonly<{ editor: MapEditor }>): React.JSX.Element {
  return (
    <>
      <div
        role="toolbar"
        aria-label="Editor do mapa"
        className="flex items-center gap-1 rounded-md border border-border bg-popover p-1 shadow-lg"
      >
        <ToolButton editor={editor} tool="polygon" label="Polígono" icon={Hexagon} />
        <ToolButton editor={editor} tool="pin" label="Pino" icon={MapPin} />
        <Button size="sm" variant="ghost" onClick={editor.close}>
          Concluir
        </Button>
      </div>
      <DrawingNotes editor={editor} />
    </>
  );
}

type ToolButtonProps = Readonly<{
  editor: MapEditor;
  tool: MapDrawingTool;
  label: string;
  icon: LucideIcon;
}>;

function ToolButton({ editor, tool, label, icon: Icon }: ToolButtonProps): React.JSX.Element {
  const pressed = useMapDrawingFlow(editor.flow, (state) => state.tool === tool);
  const saving = useMapDrawingFlow(editor.flow, (state) => state.saving);
  return (
    <Button
      size="sm"
      variant={pressed ? 'default' : 'ghost'}
      aria-pressed={pressed}
      disabled={!editor.live || saving}
      onClick={() => editor.toggleTool(tool)}
    >
      <Icon aria-hidden="true" />
      {label}
    </Button>
  );
}

function DrawingNotes({ editor }: Readonly<{ editor: MapEditor }>): React.JSX.Element | null {
  const tool = useMapDrawingFlow(editor.flow, (state) => state.tool);
  const vertices = useMapDrawingFlow(editor.flow, (state) => state.vertices.length);
  const failure = useMapDrawingFlow(editor.flow, (state) => state.failure);
  const hint = editor.live
    ? drawingHint(tool, vertices)
    : 'Sem conexão: edite quando a mesa voltar.';
  if (!hint && !failure) return null;
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-lg">
      {hint && (
        <p role="status" className="text-muted-foreground">
          {hint}
        </p>
      )}
      {failure && (
        <p role="alert" className="text-destructive-text">
          {mapDrawingFailureMessage(failure)}
        </p>
      )}
    </div>
  );
}

function drawingHint(tool: MapDrawingTool | null, vertices: number): string | null {
  if (tool === 'pin') return 'Clique no mapa para marcar o lugar. Esc cancela.';
  if (tool !== 'polygon') return null;
  return `${vertices} de ${MAP_POLYGON_VERTICES_MAX} pontos. Enter ou o primeiro ponto fecha, Esc desfaz.`;
}
