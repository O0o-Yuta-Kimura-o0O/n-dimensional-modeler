import './style.css';
import { detectLang, setLang } from './i18n';
import { App } from './ui/app';

setLang(detectLang());
// expose for debugging in the browser console
(window as unknown as { ndm: App }).ndm = new App();
