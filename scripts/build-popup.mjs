// Builds the Popup look into dist-look-popup. A script keeps the env var
// portable: `VITE_LOOK=popup vite build` fails in Windows shells.
import process from "node:process";
import { build } from "vite";

process.env.VITE_LOOK = "popup";
await build();
