const PUBLIC_ACCESS_KEY = "menu-view-9876secret";
const TOKEN_EXPIRE = 2 * 60 * 60 * 1000;
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

// 跨域预检
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
  const formData = await request.formData();
  const token = formData.get("adminToken");
  if (!verifyToken(token, env)) {
    return Response.json({ code: 401, msg: "管理员未登录或凭证失效" }, { status: 401 });
  }
  const file = formData.get("dishImg");
  if (!file) {
    return Response.json({ code: 400, msg: "未上传图片文件" }, { status: 400 });
  }
  const allowType = ["image/jpeg", "image/png", "image/webp"];
  if (!allowType.includes(file.type)) {
    return Response.json({ code: 400, msg: "仅支持jpg/png/webp图片" }, { status: 400 });
  }
  if (file.size > 2 * 1024 * 1024) {
    return Response.json({ code: 400, msg: "图片最大2MB" }, { status: 400 });
  }
  const ext = file.type.split("/")[1];
  const fileName = `dish-${crypto.randomUUID()}.${ext}`;
  await env.DISH_BUCKET.put(fileName, file.stream(), {
    httpMetadata: {
      contentType: file.type,
      cacheControl: "public, max-age=31536000"
    }
  });
  const r2PublicUrl = `https://pub-100033e1797e4db6ae5b45d37bed153d.r2.dev/${fileName}`;
  return Response.json({
    code: 200,
    data: { imgUrl: r2PublicUrl, fileName }
  });
}