export default async (request) => {
  if (request.method !== "GET") {
    return Response.json({ error: "Método não permitido." }, { status: 405 });
  }

  const appName = process.env.METERED_APP_NAME;
  const apiKey = process.env.METERED_API_KEY;

  if (!appName || !apiKey || !/^[a-z0-9-]+$/i.test(appName)) {
    return Response.json({ error: "Configuração TURN ausente." }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    const url = new URL(`https://${appName}.metered.live/api/v1/turn/credentials`);
    url.searchParams.set("apiKey", apiKey);
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!response.ok) {
      return Response.json({ error: "Falha ao obter credenciais TURN." }, {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      });
    }

    const iceServers = await response.json();
    if (!Array.isArray(iceServers) || !iceServers.length) {
      return Response.json({ error: "Resposta TURN inválida." }, { status: 502 });
    }

    return Response.json(iceServers, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Falha ao consultar o serviço TURN." }, { status: 502 });
  }
};
