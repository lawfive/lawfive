# Receive changes as they happen

Check that a webhook delivery is really from LawFive, then act on it once. The person makes the webhook in the website's Settings → Webhooks, chooses its topics and gets its `whsec_...` secret once.

Check the signature against the raw body before parsing it. It's the hex HMAC-SHA256 of `<t>.<body>`, sent as `X-LawFive-Signature: t=<unix seconds>,v1=<signature>`. A delivery can arrive more than once, so remember its `id`.

```js
import { createHmac, timingSafeEqual } from "node:crypto";

function isFromLawFive(rawBody, header, secret, maxAgeSeconds = 300) {
    const fields = Object.fromEntries(header.split(",").map((part) => part.split("=")));
    const age = Math.abs(Date.now() / 1000 - Number(fields.t));
    if (!(age <= maxAgeSeconds)) return false;
    const expected = createHmac("sha256", secret).update(`${fields.t}.${rawBody}`).digest();
    const given = Buffer.from(fields.v1 ?? "", "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
}

const seen = new Set(); // Keep these somewhere lasting, for at least a few hours.

// Returns the HTTP status to answer with. Answer within 10 seconds, so queue anything slow.
function handleDelivery(rawBody, signatureHeader, secret, act) {
    if (!signatureHeader || !isFromLawFive(rawBody, signatureHeader, secret)) return 401;
    const delivery = JSON.parse(rawBody);
    if (seen.has(delivery.id)) return 200;
    seen.add(delivery.id);
    if (!delivery.test) act(delivery.event, delivery.data);
    return 200;
}
```

`event` is the record and what happened, such as `match.updated` or `venue.deleted`, and `data` is the record, or only its id, version and when it was deleted. Anything but a `2xx` is tried again after 1 minute, 5 minutes, 30 minutes and 2 hours. Deliveries can arrive out of order, so compare `version` before replacing what you have. To catch up after an outage, use `GET /v1/changes`.
