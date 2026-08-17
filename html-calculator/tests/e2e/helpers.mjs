import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const releasePath = resolve(
  import.meta.dirname,
  "../../../outputs/01a0089d-c14c-76d1-a1fc-c095a30f2935/便民充电站单枪收入与融资租赁测算.html",
);
export const releaseFileUrl = pathToFileURL(releasePath).href;
