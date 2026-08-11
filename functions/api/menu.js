// 公开访问密钥（访客查看页面用）
const PUBLIC_ACCESS_KEY = "menu-view-9876secret";
const TOKEN_EXPIRE = 2 * 60 * 60 * 1000;
function generateToken(env) {
  const random = crypto.randomUUID();
  const raw = `${random}-${env.ADMIN_SECRET_KEY}`;
  return btoa(raw).replace(/[\r\n]/g, "");
}
function verifyToken(token, env) {
  if (!token) return false;
  token = token.replace(/[\r\n]/g, "");
  try {
    const decode = atob(token);
    return decode.includes(env.ADMIN_SECRET_KEY);
  } catch {
    return false;
  }
}
// 处理OPTIONS跨域预检（必须加，否则FormData跨域405）
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400"
    }
  });
}
export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try {
    body = await request.json();
  } catch(err){
    return Response.json({code:400,msg:"JSON解析失败，请求格式错误"});
  }
  const action = body.action;
  const accessKey = body.accessKey;
  if (accessKey !== PUBLIC_ACCESS_KEY) {
    return Response.json({ code: 403, msg: "访问密钥无效" });
  }
  // 登录
  if (action === "login") {
    const { username, password } = body;
    if (username === env.ADMIN_USER && password === env.ADMIN_PASS) {
      const token = generateToken(env);
      return Response.json({
        code: 200,
        data: { token, expire: Date.now() + TOKEN_EXPIRE }
      });
    } else {
      return Response.json({ code: 401, msg: "账号或密码错误" });
    }
  }
  // get / realtime
  if (action === "get" || action === "realtime") {
    const res = await env.DB.prepare("SELECT data FROM menu_store WHERE id = 1").first();
    const storeData = res?.data ? JSON.parse(res.data) : { dishes: [], weeklyMenus: {}, publishedWeeks: {} };
    if (action === "realtime") {
      return Response.json({ code: 200, updateTime: res?.updated_at || 0 });
    }
    return Response.json({ code: 200, data: storeData });
  }
  // set 保存数据
  if (action === "set") {
    const adminToken = body.adminToken;
    if (!verifyToken(adminToken, env)) {
      return Response.json({ code: 401, msg: "管理员未登录或凭证失效" });
    }
    const data = body.data;
    const now = Date.now();
    await env.DB.prepare(`
      INSERT OR REPLACE INTO menu_store (id, data, updated_at)
      VALUES (1, ?, ?)
    `).bind(JSON.stringify(data), now).run();
    return Response.json({ code: 200, msg: "保存成功", updateTime: now });
  }
  return Response.json({ code: 400, msg: "无效操作" });
}