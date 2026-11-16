// Lets command-line scripts import modules marked `import "server-only"`.
// Next.js enforces that marker in the browser bundle; a Node script is already
// server-side, so the marker resolves to an empty module here.
const Module = require("module");
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "server-only") return require.resolve("./empty.cjs");
  return resolve.call(this, request, ...rest);
};
