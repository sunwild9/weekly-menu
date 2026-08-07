import { D1Database } from "@cloudflare/workers-types";

export interface Env {
  DB: D1Database;
  ADMIN_USER: string;
  ADMIN_PASS: string;
  ADMIN_SECRET_KEY: string;
}

// 公开访问密钥（访客查看页面用，可保留原menu-view-9876secret）
const PUBLIC_ACCESS_KEY = "menu-view-9876secret";
// token有效期 2小时
const TOKEN_EXPIRE = 2 * 60 * 60 * 1000;

// 生成登录Token
function generateToken(env: Env) {
  const random = crypto.randomUUID();
  return btoa(`${random}-${env.ADMIN_SECRET_KEY}`);
}

// 校验token合法性
function verifyToken(token: string, env: Env) {
  if (!token) return false;
  try {
    const decode = atob(token);
    return decode.includes(env.ADMIN_SECRET_KEY);
  } catch {
    return false;
  }
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

  // 校验访客公开密钥，不通过直接拦截
  if (accessKey !== PUBLIC_ACCESS_KEY) {
    return Response.json({ code: 403, msg: "访问密钥无效" });
  }

  // 1. 登录接口：校验账号密码，返回token
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

  // 2. 获取只读数据（访客/管理员都能看，无需token）
  if (action === "get" || action === "realtime") {
    // 原有D1查询逻辑不变，只返回菜品、周菜单、发布状态
    const res = await env.DB.prepare("SELECT data FROM menu_store WHERE id = 1").first();
    const storeData = res?.data ? JSON.parse(res.data) : { dishes: [], weeklyMenus: {}, publishedWeeks: {} };
    if (action === "realtime") {
      return Response.json({ code: 200, updateTime: res?.updated_at || 0 });
    }
    return Response.json({ code: 200, data: storeData });
  }

  // 3. 写入操作（保存菜品、保存周菜单、清空菜单等，必须校验管理员token）
  if (action === "set") {
    const adminToken = body.adminToken;
    // 后端校验token，前端传过来，不再传明文密钥
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