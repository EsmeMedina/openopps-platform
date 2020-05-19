const cacheControl = require('koa-cache-control');
const compress = require('koa-compress');
const flash = require('koa-better-flash');
const parser = require('koa-better-body');
//const parser = require('koa-bodyparser');
const cors = require('@koa/cors');

module.exports = (app) => {
  // initialize flash
  app.use(flash());
  // initialize body parser
  app.use(parser());
  // initialize cache controller
  app.use(cacheControl(openopps.cache.noStore));
  // initialize response compression
  app.use(compress({}));
  // initialize CORS
  app.use(cors(openopps.cors));
  // initialize log middleware
  require('../lib/log/middleware')(app);
};