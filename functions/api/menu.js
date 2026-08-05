export async function onRequest(context) {
    const { request, env } = context;
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };
    //处理跨域预检OPTIONS
    if(request.method === "OPTIONS"){
        return new Response(null,{headers:corsHeaders})
    }
    //只接受POST请求，其他方法返回405
    if(request.method !== "POST"){
        return Response.json({code:405,msg:"只允许POST请求"},{status:405,headers:corsHeaders})
    }
    try{
        const payload = await request.json();
        const action = payload.action;
        const accessKey = payload.accessKey;
        const ADMIN_KEY = "kebao@4083789";
        const PUBLIC_KEY = "menu-view-9876secret";

        if(accessKey !== PUBLIC_KEY){
            return Response.json({code:403,msg:"密钥错误"},{headers:corsHeaders})
        }
        if(action === "get"){
            const row = await env.DB.prepare(`SELECT data FROM store WHERE id=1`).first();
            let data = row?.data ? JSON.parse(row.data) : null;
            return Response.json({code:200,data},{headers:corsHeaders})
        }else if(action === "set"){
            if(payload.adminKey !== ADMIN_KEY){
                return Response.json({code:403,msg:"管理员密钥错误"},{headers:corsHeaders})
            }
            const jsonStr = JSON.stringify(payload.data);
            await env.DB.prepare(`INSERT OR REPLACE INTO store(id,data) VALUES(1,?)`).bind(jsonStr).run();
            return Response.json({code:200,msg:"ok"},{headers:corsHeaders})
        }else if(action === "realtime"){
            const r = await env.DB.prepare(`SELECT updated_at FROM store WHERE id=1`).first();
            return Response.json({updateTime: r?.updated_at ?? 0},{headers:corsHeaders})
        }
        return Response.json({code:400,msg:"未知action"},{headers:corsHeaders})
    }catch(e){
        return Response.json({code:500,msg:e.message},{headers:corsHeaders})
    }
}