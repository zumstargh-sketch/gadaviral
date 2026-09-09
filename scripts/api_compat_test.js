const fs = require('fs');
const path = require('path');

function walk(dir, extFilter) {
  const results = [];
  fs.readdirSync(dir).forEach(f => {
    const fp = path.join(dir, f);
    const st = fs.statSync(fp);
    if (st.isDirectory()) results.push(...walk(fp, extFilter));
    else if (!extFilter || extFilter.includes(path.extname(f))) results.push(fp);
  });
  return results;
}

function extractFrontendCalls(srcDir) {
  const files = walk(srcDir, ['.ts', '.tsx', '.js', '.jsx']);
  const calls = [];
  const apiRegex = /api\.(get|post|put|patch|del|upload)\(\s*`?"?'?([^`"'\)]+)`?"?'?\s*[,\)]/g;
  files.forEach(f => {
    const txt = fs.readFileSync(f, 'utf8');
    let m;
    while ((m = apiRegex.exec(txt)) !== null) {
      calls.push({method: m[1].toUpperCase(), path: m[2].trim(), file: f});
    }
  });
  return calls;
}

function extractPluginRoutes(pluginFile) {
  const txt = fs.readFileSync(pluginFile, 'utf8');
  const routeRegex = /register_rest_route\(\s*['\"]gadaviral\/v1['\"],\s*['\"]([^'\"]+)['\"],\s*\[\s*['\"]methods['\"]\s*=>\s*['\"]([^'\"]+)['\"],/g;
  const simpleRegex = /register_rest_route\(\s*['\"]gadaviral\/v1['\"],\s*['\"]([^'\"]+)['\"],\s*\[/g;
  const methodsRegex = /register_rest_route\([^,]+,\s*['\"]([^'\"]+)['\"],\s*\[([\s\S]*?)\]\s*\)/g;
  const routes = [];
  let m;
  while ((m = methodsRegex.exec(txt)) !== null) {
    const url = m[1];
    const body = m[2];
    let methods = 'GET';
    const mm = /\'methods\'\s*=>\s*'([^']+)'/.exec(body) || /\"methods\"\s*=>\s*\"([^\"]+)\"/.exec(body) || /\'methods\'\s*=>\s*\[([^\]]+)\]/.exec(body);
    if (mm) methods = mm[1];
    const perm = /permission_callback\s*=>\s*([^,\]]+)/.exec(body);
    routes.push({url, methods, permission_callback: perm ? perm[1].trim() : null});
  }
  // Fallback simple regex
  if (routes.length === 0) {
    while ((m = simpleRegex.exec(txt)) !== null) {
      routes.push({url: m[1], methods: 'GET', permission_callback: null});
    }
  }
  return routes;
}

function normalizePath(p) {
  return ('/' + p).replace(/\/+/g, '/').replace(/\\/g, '/');
}

function matchCallsToRoutes(calls, routes) {
  const report = [];
  calls.forEach(c => {
    // strip query params
    const pathOnly = c.path.split('?')[0];
    // normalize template placeholders like ${id} used in frontend static strings
    const normalizedPath = pathOnly.replace(/\$\{[^}]+\}/g, 'PLACEHOLDER');
    // try to find route that matches pattern
    const match = routes.find(r => {
      // convert WP route to regex
      const pattern = r.url.replace(/\(\?P<[^>]+>[^)]+\)/g, '[^/]+');
      const full = '^' + pattern.replace(/\//g, '\\/') + '$';
      try { return new RegExp(full).test(normalizedPath); } catch { return false; }
    });
    // Determine method match
    let methodMatch = false;
    let authRequired = 'unknown';
    if (match) {
      const allowed = match.methods.split('|').map(s => s.trim().toUpperCase());
      methodMatch = allowed.includes(c.method) || (c.method === 'UPLOAD' && allowed.includes('POST'));
      // permission_callback may be function name or code; if it contains gadv_require_jwt mark as required
      if (match.permission_callback && match.permission_callback.indexOf('gadv_require_jwt') !== -1) authRequired = 'required';
      else if (!match.permission_callback || match.permission_callback.indexOf('__return_true') !== -1) authRequired = 'public';
      else authRequired = 'unknown';
    }
    report.push({call: c, matched: !!match, route: match || null, methodMatch, auth: authRequired});
  });
  return report;
}

function main() {
  const frontendDir = path.join(__dirname, '..', 'web', 'src');
  const pluginFile = path.join(__dirname, '..', 'wordpress', 'gadaviral-api', 'gadaviral-api.php');
  const calls = extractFrontendCalls(frontendDir);
  const routes = extractPluginRoutes(pluginFile);
  const matches = matchCallsToRoutes(calls, routes);
  const summary = {total_calls: calls.length, matched: matches.filter(m=>m.matched).length, missing: matches.filter(m=>!m.matched).length};
  const out = {calls, routes, matches, summary};
  fs.writeFileSync(path.join(__dirname, 'api_compat_report.json'), JSON.stringify(out, null, 2));
  console.log('API compatibility report written to scripts/api_compat_report.json');
}

main();
