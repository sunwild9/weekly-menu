// 纯JS，移除所有TS导入、类型定义
const PUBLIC_ACCESS_KEY = "menu-view-9876secret";
// token有效期 2小时
const TOKEN_EXPIRE = 2 * 60 * 60 * 1000;

// 生成登录Token
function generateToken(env) {
  const random = crypto.randomUUID();
  return btoa(`${random}-${env.ADMIN_SECRET_KEY}`);
}

// 校验token合法性
function verifyToken(token, env) {
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
  const url = new URL(request.url);
  const path = url.pathname;
  let body;
  try {
    body = await request.json();
  } catch(err) {
    return Response.json({code:400,msg:"JSON解析失败，请求格式错误"});
  }
  const action = body.action;
  const accessKey = body.accessKey;

  // 校验访客公开密钥，不通过直接拦截
  if (accessKey !== PUBLIC_ACCESS_KEY) {
    return Response.json({ code: 403, msg: "访问密钥无效" });
  }

  // ========== 新增R2图片上传接口 /upload-image ==========
  if (path === "/api/menu/upload-image") {
    const adminToken = body.adminToken;
    if (!verifyToken(adminToken, env)) {
      return Response.json({ code: 401, msg: "管理员未登录或凭证失效" });
    }
    const { base64Img } = body;
    if (!base64Img || !base64Img.startsWith("data:image/")) {
      return Response.json({ code: 400, msg: "图片数据无效" });
    }
    // base64转二进制
    const baseStr = base64Img.split(",")[1];
    const binaryStr = atob(baseStr);
    const uint8 = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      uint8[i] = binaryStr.charCodeAt(i);
    }
    const imgBlob = new Blob([uint8], { type: "image/jpeg" });
    // 唯一文件名存入dishes目录
    const fileName = `dishes/${Date.now()}-${crypto.randomUUID().slice(0,8)}.jpg`;
    // 写入R2桶，Pages绑定变量DISH_BUCKET
    await env.DISH_BUCKET.put(fileName, imgBlob, {
      httpMetadata: { contentType: "image/jpeg" }
    });
    const r2PublicUrl = `https://pub-${env.DISH_BUCKET.bucketId}.r2.dev/${fileName}`;
    return Response.json({
      code: 200,
      data: { url: r2PublicUrl }
    });
  }

  // ========== 新增R2图片删除接口 /delete-image ==========
  if (path === "/api/menu/delete-image") {
    const adminToken = body.adminToken;
    if (!verifyToken(adminToken, env)) {
      return Response.json({ code: 401, msg: "管理员未登录或凭证失效" });
    }
    const { imageUrl } = body;
    const bucketDomain = `pub-${env.DISH_BUCKET.bucketId}.r2.dev/`;
    if (!imageUrl.includes(bucketDomain)) {
      return Response.json({ code: 200, msg: "外部图片无需删除" });
    }
    const fileKey = imageUrl.split(bucketDomain)[1];
    await env.DISH_BUCKET.delete(fileKey);
    return Response.json({ code: 200, msg: "R2图片已删除" });
  }

  // 1. 登录接口：校验账号密码
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

  // 2. 获取只读数据 get / realtime
  if (action === "get" || action === "realtime") {
    const res = await env.DB.prepare("SELECT data, updated_at FROM menu_store WHERE id = 1").first();
    const storeData = res?.data ? JSON.parse(res.data) : { dishes: [], weeklyMenus: {}, publishedWeeks: {} };
    if (action === "realtime") {
      return Response.json({ code: 200, updateTime: res?.updated_at || 0 });
    }
    return Response.json({ code: 200, data: storeData });
  }

  // 3. 写入保存 set
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