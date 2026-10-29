import "./style.css";
import { App } from "./app";

// Konsoldan erişim ve ileride eklenti API'si için.
(window as unknown as { saggcad: App }).saggcad = new App();
