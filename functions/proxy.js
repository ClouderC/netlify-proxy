const fetch = require("node-fetch");

exports.handler = async function (event) {
  const targetBase = process.env.PROXY_PASS || "https://www.baidu.com";

  // 处理 OPTIONS 预检请求
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Max-Age": "86400"
      },
      body: ""
    };
  }

  // 更好的路径处理
  let path = event.path || "/";
  if (event.rawQuery) {
    path += "?" + event.rawQuery;
  }

  const targetUrl = targetBase + path;
  console.log(`[${event.httpMethod}] Original path: ${event.path}`);
  console.log(`[${event.httpMethod}] Query: ${event.rawQuery || 'none'}`);
  console.log(`[${event.httpMethod}] Target base: ${targetBase}`);
  console.log(`[${event.httpMethod}] Final URL: ${targetUrl}`);

  // 检查是否是 WebSocket 升级请求
  const isWebSocketUpgrade = event.headers &&
    event.headers.upgrade &&
    event.headers.upgrade.toLowerCase() === 'websocket';

  if (isWebSocketUpgrade) {
    return {
      statusCode: 501,
      headers: {
        "Content-Type": "text/plain",
        "Access-Control-Allow-Origin": "*"
      },
      body: "WebSocket connections are not supported in Netlify Functions. Consider using Server-Sent Events or polling instead."
    };
  }

  // 清理和准备 headers
  const headers = {};

  // 复制重要的 headers，但排除一些不应该转发的
  const excludeHeaders = [
    'host', 'x-forwarded-for', 'x-forwarded-proto', 'x-forwarded-port',
    'x-netlify-id', 'x-netlify-stage', 'x-bb-ab', 'x-bb-client-request-uuid',
    'x-bb-loop', 'x-datadog-trace-id', 'x-datadog-parent-id', 'x-datadog-sampling-priority'
  ];

  Object.keys(event.headers || {}).forEach(key => {
    if (!excludeHeaders.includes(key.toLowerCase())) {
      headers[key] = event.headers[key];
    }
  });

  // 设置必要的 headers
  headers['user-agent'] = headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  // 保持原始的 Accept header，如果没有则设置默认值
  if (!headers['accept']) {
    headers['accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8';
  }

  // 设置 referer 为目标域名
  headers['referer'] = targetBase;

  // 处理请求体
  let body = undefined;
  if (!["GET", "HEAD", "OPTIONS"].includes(event.httpMethod)) {
    if (event.body) {
      // 如果 body 是 base64 编码的，需要解码
      body = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body;
    }
  }

  try {
    const fetchOptions = {
      method: event.httpMethod,
      headers,
      redirect: "follow",
      timeout: 25000, // 25秒超时，留5秒给 Netlify 处理
      follow: 10 // 最多跟随10次重定向
    };

    // 只有在需要时才添加 body
    if (body !== undefined) {
      fetchOptions.body = body;
    }

    const res = await fetch(targetUrl, fetchOptions);

    // 获取响应内容
    const buf = await res.buffer();

    // 准备响应 headers
    const responseHeaders = {};
    res.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      // 排除一些可能导致问题的 headers
      if (!['content-encoding', 'transfer-encoding', 'content-length'].includes(lowerKey)) {
        responseHeaders[key] = value;
      }
    });

    // 添加 CORS headers
    responseHeaders["Access-Control-Allow-Origin"] = "*";
    responseHeaders["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH";
    responseHeaders["Access-Control-Allow-Headers"] = "*";
    responseHeaders["Access-Control-Expose-Headers"] = "*";

    // 检查内容类型以决定如何处理响应
    const contentType = res.headers.get('content-type') || '';
    const isTextContent = contentType.includes('text/') ||
                         contentType.includes('application/json') ||
                         contentType.includes('application/xml') ||
                         contentType.includes('application/javascript') ||
                         contentType.includes('application/x-javascript');

    // 对于文本内容，尝试修复相对链接
    let responseBody = buf;
    if (isTextContent && buf.length > 0) {
      try {
        let content = buf.toString('utf8');

        // 获取当前请求的完整 URL，用于正确解析相对路径
        const currentUrl = targetUrl;

        // 修复相对链接 - 将相对链接转换为绝对链接
        // 但是要小心，不要转换已经是正确路径的链接
        content = content.replace(
          /(?:href|src|action)=["'](?!https?:\/\/|\/\/|#|javascript:|mailto:|tel:|data:)([^"']*?)["']/gi,
          (match, url) => {
            try {
              // 如果 URL 以 / 开头，它是绝对路径，只需要添加域名
              if (url.startsWith('/')) {
                const baseUrl = new URL(targetBase);
                const absoluteUrl = `${baseUrl.protocol}//${baseUrl.host}${url}`;
                console.log(`Absolute path fix: ${url} -> ${absoluteUrl}`);
                return match.replace(url, absoluteUrl);
              } else {
                // 相对路径，使用当前页面的 URL 作为基准来解析
                const absoluteUrl = new URL(url, currentUrl).href;
                console.log(`Relative path fix: ${url} -> ${absoluteUrl}`);
                return match.replace(url, absoluteUrl);
              }
            } catch (e) {
              console.warn(`Failed to resolve URL: ${url}`, e.message);
              return match;
            }
          }
        );

        // 修复 CSS 中的相对路径（如 @import, url() 等）
        if (contentType.includes('text/css')) {
          content = content.replace(
            /url\(['"]?(?!https?:\/\/|\/\/|data:)([^'")\s]+)['"]?\)/gi,
            (match, url) => {
              try {
                let absoluteUrl;
                if (url.startsWith('/')) {
                  // 绝对路径
                  const baseUrl = new URL(targetBase);
                  absoluteUrl = `${baseUrl.protocol}//${baseUrl.host}${url}`;
                } else {
                  // 相对路径
                  absoluteUrl = new URL(url, currentUrl).href;
                }
                console.log(`CSS URL fix: ${url} -> ${absoluteUrl}`);
                return `url("${absoluteUrl}")`;
              } catch (e) {
                console.warn(`Failed to resolve CSS URL: ${url}`, e.message);
                return match;
              }
            }
          );
        }

        responseBody = Buffer.from(content, 'utf8');
      } catch (e) {
        console.warn('Failed to process text content:', e.message);
      }
    }

    console.log(`[${res.status}] Response size: ${responseBody.length} bytes, Content-Type: ${contentType}`);

    return {
      statusCode: res.status,
      headers: responseHeaders,
      body: responseBody.toString("base64"),
      isBase64Encoded: true
    };
  } catch (err) {
    console.error('Proxy error:', err);

    // 提供更详细的错误信息
    let errorMessage = `Proxy failed: ${err.message}`;
    if (err.code === 'ENOTFOUND') {
      errorMessage = `Target server not found: ${targetUrl}`;
    } else if (err.code === 'ECONNREFUSED') {
      errorMessage = `Connection refused to: ${targetUrl}`;
    } else if (err.code === 'ETIMEDOUT') {
      errorMessage = `Request timeout to: ${targetUrl}`;
    }

    return {
      statusCode: 502,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Allow-Origin": "*"
      },
      body: errorMessage
    };
  }
};
