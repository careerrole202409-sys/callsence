import "@supabase/functions-js/edge-runtime.d.ts";
import { RtcTokenBuilder, RtcRole } from "npm:agora-token";

const APP_ID = Deno.env.get("AGORA_APP_ID") ?? "";
const APP_CERTIFICATE = Deno.env.get("AGORA_APP_CERTIFICATE") ?? "";

Deno.serve(async (req) => {
  // CORS対応
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  try {
    const { channelName, uid } = await req.json();

    if (!channelName) {
      return new Response(JSON.stringify({ error: "channelName is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const uidNum = uid ?? Math.floor(Math.random() * 100000);
    const expireTs = Math.floor(Date.now() / 1000) + 3600; // 1時間有効

    const token = RtcTokenBuilder.buildTokenWithUid(
      APP_ID,
      APP_CERTIFICATE,
      channelName,
      uidNum,
      RtcRole.PUBLISHER,
      expireTs,
      expireTs
    );

    return new Response(
      JSON.stringify({ token, uid: uidNum, channelName }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});