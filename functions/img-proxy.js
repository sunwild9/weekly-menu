// functions/img-proxy.js
// 图片代理接口：通过pages.dev域名读取R2图片，避免r2.dev被微信拦截
// ⚠️ 重要：env.R2_BUCKET 必须和你上传接口(/api/menu/upload)里用的R2绑定变量名完全一致！
// 如果你的上传接口里用的是别的名字（比如 MY_BUCKET），请把下面的 R2_BUCKET 改成一样的

export async function onRequestGet(context) {
    const url = new URL(context.request.url);
    const key = url.searchParams.get("key");

    if (!key) {
        return new Response("Missing key parameter", { status: 400 });
    }

    // ⚠️ 这里的 R2_BUCKET 要和你 Pages 控制台里绑定的 R2 变量名一致
    const bucket = context.env.DISH_BUCKET;
    if (!bucket) {
        return new Response("R2 bucket not configured", { status: 500 });
    }

    try {
        const obj = await bucket.get(key);
        if (!obj) {
            return new Response("Image not found", { status: 404 });
        }

        // 设置缓存：图片不常变，缓存7天
        const headers = new Headers();
        headers.set("Content-Type", obj.httpMetadata?.contentType || "image/jpeg");
        headers.set("Cache-Control", "public, max-age=604800");
        headers.set("Access-Control-Allow-Origin", "*");

        return new Response(obj.body, { headers });
    } catch (e) {
        return new Response("Error: " + e.message, { status: 500 });
    }
}

// 不允许POST请求
export async function onRequestPost() {
    return new Response("Method not allowed", { status: 405 });
}
