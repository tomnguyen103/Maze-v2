// Builds one look: `node scripts/build-look.mjs pilot` writes dist, and `popup` writes dist-look-popup.
// The script sets VITE_LOOK in the process env, which wins over a stray value in a shell or an .env file.
// A script also keeps the env var portable: `VITE_LOOK=popup vite build` fails in Windows shells.
import process from "node:process";
import { build } from "vite";
import { resolveLook } from "../vite.config.mjs";

process.env.VITE_LOOK = resolveLook(process.argv[2]);
await build();
