import { replaceQuery } from '@/lib/browser-url';

export function SceneHeader({ title }: { title: string }) {
  return <h2 onClick={() => replaceQuery('?scene=1')}>{title}</h2>;
}
