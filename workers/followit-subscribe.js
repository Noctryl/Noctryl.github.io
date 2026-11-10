const ALLOWED_ORIGIN = "https://noctryl.github.io";
const FOLLOWIT_URL = "https://api.follow.it/subscription-form/SDdFQkgzYWlTL2trS3JoUlFOOThib2dMWmlGcTdzVUNTSkZUamcrVmptcFRYaXFIYXRGeFBXWTc4aTk0eDNXVmxnRHZZUGtqRk5ZVk9NOG5MZzhKcW1rRkp4aW1BNDN1MUUzdDB3VjBqeldmQ3NkT3RQWjRNVUtHbGdsT1phT2J8bUVHYkpsd1lDTnVHb0IxSVA5eHM2YmUwUDhpSjNTV2dDc0dzRXlTbGIyWT0=/8";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
      "Cache-Control": "no-store"
    }
  });
}

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin");
    if (origin && origin !== ALLOWED_ORIGIN) return json({ ok: false, message: "Origin not allowed." }, 403);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
          "Vary": "Origin"
        }
      });
    }
    if (request.method !== "POST") return json({ ok: false, message: "Use POST." }, 405);

    let email;
    try {
      ({ email } = await request.json());
    } catch {
      return json({ ok: false, message: "Invalid request." }, 400);
    }
    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return json({ ok: false, message: "Please enter a valid email address." }, 400);
    }

    try {
      const body = new URLSearchParams({ email: email.trim() });
      const upstream = await fetch(FOLLOWIT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "text/html"
        },
        body: body.toString(),
        redirect: "manual"
      });

      // Workers expose manual upstream redirects (status + Location) for inspection.
      const location = upstream.headers.get("Location");
      if (upstream.status >= 300 && upstream.status < 400 && location) {
        let destination;
        try {
          destination = new URL(location, FOLLOWIT_URL);
        } catch {
          return json({ ok: false, message: "Follow.it returned an unexpected redirect. Please use the regular form." }, 502);
        }
        const allowedHost = destination.hostname === "follow.it" || destination.hostname.endsWith(".follow.it");
        if (!allowedHost || /error|invalid|fail/i.test(destination.pathname) || destination.searchParams.has("error")) {
          return json({ ok: false, message: "Follow.it did not confirm processing. Please try the regular form." }, 422);
        }
        return json({
          ok: true,
          state: "request-dispatched",
          message: "Follow.it redirected the request. If your address was accepted, a confirmation email may arrive—please check your inbox."
        });
      }

      if (upstream.status === 403 || upstream.status === 429) {
        return json({ ok: false, message: "Follow.it blocked or rate-limited this request. Please use the regular form." }, 502);
      }
      // Do not claim success for a non-redirect or unknown HTML response.
      return json({ ok: false, message: "Follow.it returned an unrecognized response. Please use the regular form." }, 502);
    } catch {
      return json({ ok: false, message: "Could not reach Follow.it. Please try again." }, 502);
    }
  }
};
