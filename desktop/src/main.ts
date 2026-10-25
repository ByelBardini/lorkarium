import '@fontsource-variable/cinzel';
import '@fontsource-variable/hanken-grotesk';
import './splash.css';
import { TauriShellBridge } from './shell-bridge';
import { startSplash } from './splash-controller';
import { splashElementsOf } from './splash-render';

void startSplash(new TauriShellBridge(), splashElementsOf(document), (problem) =>
  console.warn(problem),
);
