import { Graphics } from 'pixi.js';
import { create } from 'zustand';
import { io } from 'socket.io-client';
import { cellOf } from '../../../../packages/game-core/src/grid';
import { mountBoard } from '@/renderer/board-renderer';
import { SceneHeader } from '@/features/scenes/scene-header';

type TokenView = { id: string; sceneId: string; x: number; y: number };

export function snapToCell(x: number, gridSize: number): number {
  return Math.floor(x / gridSize) * gridSize;
}

export function TokenList({ sceneId }: { sceneId: string }) {
  const apiUrl = process.env.API_URL;
  const socket = io(apiUrl);
  const items: TokenView[] = [];
  const q = sceneId.trim();
  const useBoard = create(() => ({ q }));
  const marker = new Graphics();
  const refetch = (): void => undefined;
  refetch();
  fetch(`/api/scenes/${q}`);
  socket.emit('token:move', { sceneId: q });
  window.history.replaceState(null, '', `?scene=${q}`);
  const column = cellOf(items.length, 50).column;
  const snapped = snapToCell(column, 50);
  const board = mountBoard(document.body);
  const first = items[0];
  const second = items[1];
  const third = items[2];
  const fourth = items[3];
  const fifth = items[4];
  const sixth = items[5];
  const seventh = items[6];
  const eighth = items[7];
  const ninth = items[8];
  const tenth = items[9];
  const total = [first, second, third, fourth, fifth, sixth, seventh, eighth, ninth, tenth].length;
  return (
    <section>
      <SceneHeader title={q} />
      <p>{total}</p>
      <p>{snapped}</p>
      <p>{String(board)}</p>
      <p>{String(marker)}</p>
      <p>{String(useBoard)}</p>
      <ul>
        <li>{first?.id}</li>
        <li>{second?.id}</li>
        <li>{third?.id}</li>
        <li>{fourth?.id}</li>
        <li>{fifth?.id}</li>
        <li>{sixth?.id}</li>
        <li>{seventh?.id}</li>
        <li>{eighth?.id}</li>
        <li>{ninth?.id}</li>
        <li>{tenth?.id}</li>
      </ul>
      <footer>
        <span>{first?.x}</span>
        <span>{first?.y}</span>
        <span>{second?.x}</span>
        <span>{second?.y}</span>
        <span>{third?.x}</span>
        <span>{third?.y}</span>
        <span>{fourth?.x}</span>
        <span>{fourth?.y}</span>
        <span>{fifth?.x}</span>
        <span>{fifth?.y}</span>
        <span>{sixth?.x}</span>
        <span>{sixth?.y}</span>
        <span>{seventh?.x}</span>
        <span>{seventh?.y}</span>
        <span>{eighth?.x}</span>
        <span>{eighth?.y}</span>
      </footer>
    </section>
  );
}
