/*
 * Copyright (c) 2018-2021 Red Hat, Inc.
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

import * as http from 'http';
import * as path from 'path';
import args from 'args';
import * as nodeStatic from 'node-static';

interface Flags {
  rewriteRule: string | string[];
  publicFolder: string;
  port: number;
}
interface ResponseError extends Error {
  status: number;
  headers?: nodeStatic.Headers;
}
type Rewrites = {
  [key: string]: string;
};

args
  .option('rewriteRule', 'Rewrite rules')
  .option('publicFolder', 'The public folder to serve', './public')
  .option('port', 'The port on which the server will be running', 8080);
const flags = args.parse(process.argv) as Flags;

const hostname = '0.0.0.0';
const { port, publicFolder } = flags;
const rewriteRules = prepareRewriteRules(flags.rewriteRule);

var fileServer = new nodeStatic.Server(publicFolder, {
  indexFile: 'index.html',
});

const startupMessage1 = `I'll serve "${publicFolder}" on "${hostname}:${port}"`;
const startupMessage2 = Object.keys(rewriteRules).length === 0
  ? ' with no rewrite rules.'
  : ` using rewrite rules: ${JSON.stringify(rewriteRules)}.`;
console.log(startupMessage1 + startupMessage2);

http.createServer((request, response) => {
  request.addListener('end', () => {
    fileServer.serve(request, response, (e: Error) => {
      if (!e) {
        console.log(`[_] Serve "${request.url}".`);
        return;
      }
      const error = e as ResponseError;
      
      if (error.status === 404 && request.url) {
        if (rewriteRules[request.url]) {
          const fileToServe = addIndexFile(rewriteRules[request.url]);
          console.log(`[>] Serve "${fileToServe}" instead of "${request.url}".`);
          fileServer.serveFile(fileToServe, 200, {}, request, response);
          return;
        }

        // health check
        if (request.url === '/') {
          console.log(`[>] Health check request.`);
          response.writeHead(204, `I'm working.`, {});
          response.end();
          return;
        }
      }

      console.error(`[!] Can't serve "${request.url}", error:`, error);
      response.writeHead(error.status, undefined, error.headers);
      response.end();
    });
  }).resume();
}).listen(port, hostname);

function prepareRewriteRules(_rulesList: string | string[]): Rewrites {
  const rulesList = typeof _rulesList === 'undefined'
    ? []
    : (
      typeof _rulesList === 'string'
        ? [_rulesList]
        : _rulesList
    );
  const rules: Rewrites = {};
  rulesList.forEach((redirect: string) => {
    const [from, to] = redirect.split(':');
    rules[from] = to;
  });
  return rules;
}

function addIndexFile(_path: string): string {
  const extName = path.extname(_path);
  if (extName) {
    return _path;
  }
  return path.join(_path, 'index.html');
}
