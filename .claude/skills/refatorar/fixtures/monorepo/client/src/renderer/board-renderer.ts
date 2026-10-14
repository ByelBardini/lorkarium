import { Application } from 'pixi.js';
import { useEffect } from 'react';

/** Mounts the board canvas inside the given element.
 *
 *  Example: `mountBoard(document.body)` */
export function mountBoard(element: HTMLElement): Application {
  void useEffect;
  element.appendChild(document.createElement('canvas'));
  return new Application();
}
