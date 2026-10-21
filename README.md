# 鲸落落 · CETACEA

一只聪明但懒的鲸鱼娘的网站。页面挂 GitHub Pages，聊天走 Cloudflare Worker 代理 DeepSeek。

```
whale-site/
├─ index.html            页面主体
├─ assets/
│  ├─ styles.css         深海配色、鲸尾 SVG 动画
│  ├─ app.js             聊天逻辑（SSE 流式 + 接口自动回退）
│  └─ config.js          开场白、默认接口地址
├─ worker/
│  ├─ worker.js          人设 + DeepSeek 代理（密钥放环境变量）
│  └─ wrangler.toml      手动部署用
├─ .nojekyll
└─ deploy.ps1            一键部署（不需要 git / gh）
```

## 线上结构

```
你的域名                → CNAME → <用户名>.github.io   （GitHub Pages，静态页）
api.你的域名            → Cloudflare Worker 自定义域 （聊天接口，自动签证书）
```

前端默认先试同源 `/api/chat`，失败就自动换到 `https://api.<本站域名>/api/chat`，
所以两种挂法都能用，页面不用改。

## 一键部署

准备三样东西：

| 东西 | 在哪拿 | 需要的权限 |
| --- | --- | --- |
| GitHub Token | Settings → Developer settings → Personal access tokens (classic) | `repo` |
| Cloudflare API Token | My Profile → API Tokens → Create Token | `Zone.DNS:Edit`、`Account.Workers Scripts:Edit`、`Zone.Zone Settings:Edit`（可选）、`Account.Account Settings:Read`（可选） |
| DeepSeek API Key | platform.deepseek.com → API keys | 账户里有余额 |

本机没装 git 也没关系，全靠 HTTP API：

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy.ps1 `
  -GitHubToken "ghp_xxx" `
  -CloudflareToken "xxx" `
  -AccountId "你的账户ID" `
  -Domain "example.com" `
  -DeepSeekKey "sk-xxx"
```

> `-ExecutionPolicy Bypass` 是给默认禁止运行脚本的 Windows 用的，不然会报 "running scripts is disabled"。
> `-AccountId` 不知道就省略，脚本会自己查（要求 Token 有账号读权限）。

脚本流程：

1. 校验 Token，建仓库（`-Repo`，默认 `whale-site`；已存在就复用）
2. 把站点文件推到 `main`
3. 开 Pages，绑自定义域名
4. 传 Worker、写密钥、绑 `api.<域名>` 自定义域
5. 建根域 CNAME，**先 DNS-only** 等 GitHub 签证书
6. 证书 OK 后开 Cloudflare 代理，SSL 改 Full，页面不通会自动退回
7. 验证页面和 `/api/health`

## 常见坑

**根域已经有 A 记录。** 脚本会停下来告诉你有哪些冲突，加 `-Force` 才会删。

**证书一直不下来。** GitHub Pages 签证书时不能走 Cloudflare 代理，所以脚本第一步是 DNS-only。
如果 5 分钟内没签完，它会保持 DNS-only 退出——过几分钟原命令重跑一次即可，会接着往下走。

**`/api/health` 404。** 看 Workers → 你的 Worker → Settings → Domains & Routes，确认
`api.你的域名` 绑上了。绑不上的话，也可以手动加。

**SSL 模式是 Flexible。** 会跟 GitHub Pages 的强制 HTTPS 撞成重定向循环，改成 Full。

## 手动部署

1. 新建仓库，把除 `worker/`、`deploy.ps1` 外的文件推上去。
2. Settings → Pages → Source 选 `main` / root，Custom domain 填你的域名。
3. Cloudflare 加 CNAME：`@` → `<用户名>.github.io`，**先别开代理**，等证书。
4. `worker/` 目录里：

```bash
npx wrangler deploy
npx wrangler secret put DEEPSEEK_API_KEY
# 然后在控制台 Workers → Settings → Domains & Routes 添加 api.你的域名
```

5. 证书好了再把小云朵点亮，SSL 改 Full。

## 改人设

人设写在 `worker/worker.js` 顶部的 `PERSONA` 里。改完重新部署 Worker，前端不用动。

## 成本与安全

- Pages 免费；Worker 免费额度每天 10 万次请求。
- DeepSeek 按 token 计费，一次对话几分钱。
- 密钥只存在于 Worker secret 里，浏览器永远拿不到。
- Worker 没做限流。公开后如果被刷，在 Cloudflare 给 `/api/*` 加 Rate Limiting 规则（比如每 IP 每分钟 10 次）。
