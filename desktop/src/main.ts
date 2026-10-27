import '@fontsource-variable/cinzel';
import '@fontsource-variable/hanken-grotesk';
import './splash.css';
import { TauriShellBridge } from './shell-bridge';
import { startSplash } from './splash-controller';
import { splashElementsOf } from './splash-render';
import { splashTitleBarOf, wireSplashTitleBar } from './splash-title-bar';

const bridge = new TauriShellBridge();
const warn = (problem: string): void => console.warn(problem);
wireSplashTitleBar(bridge, splashTitleBarOf(document), warn);
void startSplash(bridge, splashElementsOf(document), warn);
