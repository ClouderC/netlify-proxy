# Netlify HTTPS Proxy

一个基于 Netlify Functions 的 HTTPS 代理服务，可以转发所有类型的 HTTP 请求。

## 功能特性

- ✅ **全路径转发**：支持根目录下所有路径的请求转发
- ✅ **多种请求方法**：支持 GET、POST、PUT、DELETE、OPTIONS、HEAD、PATCH
- ✅ **Web 页面代理**：可以代理完整的网站，包括 HTML、CSS、JS、图片等
- ✅ **API 请求代理**：支持 REST API、JSON API 等
- ✅ **CORS 支持**：完整的跨域资源共享支持
- ✅ **相对链接修复**：自动将相对链接转换为绝对链接
- ✅ **错误处理**：详细的错误信息和状态码

## 限制说明

- ❌ **WebSocket 不支持**：Netlify Functions 不支持长连接，WebSocket 会被拒绝
- ❌ **Server-Sent Events 限制**：SSE 可能会因为超时而中断
- ⚠️ **执行时间限制**：免费版 10 秒，付费版 15 分钟
- ⚠️ **并发限制**：免费版有并发请求数限制

## 配置

### 环境变量

在 Netlify 部署设置中配置以下环境变量：

- `PROXY_PASS`: 目标服务器地址（默认：https://www.baidu.com）

### 部署步骤

1. Fork 或下载此项目
2. 连接到 Netlify
3. 设置环境变量 `PROXY_PASS`
4. 部署

## 使用示例

假设你的 Netlify 域名是 `your-proxy.netlify.app`，目标服务器是 `https://example.com`：

```bash
# 访问首页
curl https://your-proxy.netlify.app/

# 访问 API
curl https://your-proxy.netlify.app/api/users

# POST 请求
curl -X POST https://your-proxy.netlify.app/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"user","password":"pass"}'
```

## 技术实现

- **运行环境**：Node.js (Netlify Functions)
- **HTTP 客户端**：node-fetch
- **路径处理**：完整的查询参数和路径转发
- **Headers 处理**：智能过滤和转发 HTTP headers
- **内容处理**：支持二进制和文本内容，自动链接修复

## 故障排除

### 常见问题

1. **502 错误**：检查目标服务器是否可访问
2. **超时错误**：请求可能超过了 25 秒限制
3. **CORS 错误**：检查浏览器控制台，通常已自动处理
4. **WebSocket 错误**：不支持，建议使用轮询或 SSE 替代

### 调试

查看 Netlify Functions 日志：
1. 进入 Netlify 控制台
2. 选择你的站点
3. 进入 Functions 标签
4. 查看实时日志

## 许可证

MIT License
