/**
 * Dragging with a finger or a mouse (pointer events work for both).
 *
 * Something you can drag is a "source" (a tile in your hand, the end of the
 * wall, the dice). Places you can drop it are marked in the page with a
 * data-drop="..." attribute (the middle of the table, your hand).
 */
import { useCallback, useEffect, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { TileType } from '@lan-mahjong/shared';

export type DragSource =
  | { kind: 'hand'; tileId: number; type: TileType }
  | { kind: 'wallFront' }
  | { kind: 'wallBack' }
  | { kind: 'dice' };

export interface DragState {
  src: DragSource;
  startX: number;
  startY: number;
  x: number;
  y: number;
  /** True once the pointer has moved far enough to count as a drag. */
  moved: boolean;
}

export interface Drop {
  zone: string | null;
  x: number;
  y: number;
}

const MIN_MOVE = 6;

export function useDrag(onDrop: (src: DragSource, drop: Drop) => void, onTap?: (src: DragSource) => void) {
  const [drag, setDrag] = useState<DragState | null>(null);

  const start = useCallback(
    (src: DragSource) => (e: ReactPointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault();
      setDrag({ src, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, moved: false });
    },
    [],
  );

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent): void => {
      setDrag((d) =>
        d && {
          ...d,
          x: e.clientX,
          y: e.clientY,
          moved: d.moved || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > MIN_MOVE,
        },
      );
    };
    const up = (e: PointerEvent): void => {
      const d = drag;
      setDrag(null);
      const moved = d.moved || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > MIN_MOVE;
      if (!moved) {
        onTap?.(d.src);
        return;
      }
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-drop]');
      onDrop(d.src, { zone: el?.getAttribute('data-drop') ?? null, x: e.clientX, y: e.clientY });
    };
    const cancel = (): void => setDrag(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
    // Re-subscribe only when a new drag starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.src, drag?.startX, drag?.startY]);

  return { drag, start };
}
