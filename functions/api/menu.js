// 公开访问密钥（访客查看页面用）
const PUBLIC_ACCESS_KEY = "menu-view-9876secret";
// token有效期 2小时
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

// 【新增】R2图片上传接口处理函数
async function handleImageUpload(request, env) {
  const formData = await request.formData();
  // ✅不再从header拿token，从表单体内拿
  const token = formData.get("adminToken");

  if (!verifyToken(token, env)) {
    return Response.json({ code: 401, msg: "管理员未登录或凭证失效" }, { status: 401 });
  }

  const file = formData.get("dishImg");
  if (!file) {
    return Response.json({ code: 400, msg: "未上传图片文件" }, { status: 400 });
  }

  // 限制文件类型、大小 2MB
  const allowType = ["image/jpeg", "image/png", "image/webp"];
  if (!allowType.includes(file.type)) {
    return Response.json({ code: 400, msg: "仅支持jpg/png/webp图片" }, { status: 400 });
  }
  if (file.size > 2 * 1024 * 1024) {
    return Response.json({ code: 400, msg: "图片最大2MB" }, { status: 400 });
  }

  // 生成唯一文件名，避免重名
  const ext = file.type.split("/")[1];
  const fileName = `dish-${crypto.randomUUID()}.${ext}`;

  // 写入R2桶 DISH_BUCKET 环境变量（Pages已绑定）
  await env.DISH_BUCKET.put(fileName, file.stream(), {
    httpMetadata: {
      contentType: file.type,
      cacheControl: "public, max-age=31536000"
    }
  });

  // R2公开访问地址，替换为你的账户ID
  const r2PublicUrl = `https://menu-dish-img.15856149546@163.com.r2.cloudflarestorage.com/${fileName}`;

  return Response.json({
    code: 200,
    data: { imgUrl: r2PublicUrl, fileName }
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // 路由分发：/api/menu/upload 图片上传，原有逻辑/api/menu 菜单操作
  if (url.pathname === "/api/menu/upload") {
    return handleImageUpload(request, env);
  }

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