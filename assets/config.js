/* 站点配置：部署后一般不用改。
 * 如果 Worker 不在同一个域名的 /api 路径下，把 chatEndpoint 改成完整地址。 */
window.WHALE_CONFIG = {
  chatEndpoint: "/api/chat",
  healthEndpoint: "/api/health",
  maxHistory: 12,
  greeting:
    "（尾鳍在水面拍了一下）……来了啊。\n我是鲸落落。鲸鱼，不是鱼，先说清楚。\n有事说事，我懒，但我听着呢。",
};
