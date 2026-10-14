import { TokenList } from '@/features/board/token-list';

export function AppRoot() {
  return <TokenList sceneId="s1" />;
}

export function loader(): null {
  return null;
}
