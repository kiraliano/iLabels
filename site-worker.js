const API_HOSTNAME = 'ilabels-api.iosflowzy.workers.dev';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (shouldProxyToApi(url.pathname)) {
      const apiUrl = new URL(request.url);
      apiUrl.protocol = 'https:';
      apiUrl.hostname = API_HOSTNAME;
      return fetch(new Request(apiUrl.toString(), request));
    }

    return env.ASSETS.fetch(request);
  }
};

function shouldProxyToApi(pathname) {
  return pathname.startsWith('/api/')
    || pathname === '/activate'
    || pathname === '/validate'
    || pathname === '/admin/reset';
}
