// Entry point used only by `npm run dev`. Turns on live reload, then
// starts the real server. `npm start` (production) still runs
// server.js directly and never loads livereload at all.
process.env.LIVE_RELOAD = '1';
require('./server.js');
