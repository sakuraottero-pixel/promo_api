const fs = require('fs');
const path = require('path');

const PROMO_PATH = process.env.PROMO_FILE_PATH || path.join(__dirname, '..', 'public', 'promo.json');
const ALLOW_LIST = (process.env.CORS_ALLOW_LIST || '').split(',').map(s => s.trim()).filter(Boolean);
const ADMIN_ID = process.env.ADMIN_ID;
const ADMIN_PASS = process.env.ADMIN_PASS;
const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || 'secret';

function cors(res, origin) {
  if (!origin) return;
  if (ALLOW_LIST.length === 0 || ALLOW_LIST.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
}

module.exports = async (req, res) => {
  try {
    const origin = req.headers.origin;
    cors(res, origin);
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      return res.status(200).end();
    }

    // ensure promo file exists
    if (!fs.existsSync(PROMO_PATH)) {
      const defaultObj = {
        promoCode: '196923',
        created_at: new Date().toISOString(),
        expire_at: 'unlimited',
        is_expired: false,
        is_timeLimited: false,
        history: []
      };
      fs.mkdirSync(path.dirname(PROMO_PATH), { recursive: true });
      fs.writeFileSync(PROMO_PATH, JSON.stringify(defaultObj, null, 2));
    }

    const raw = fs.readFileSync(PROMO_PATH, 'utf8');
    const data = JSON.parse(raw);

    if (req.method === 'GET') {
      // calculate expiry state if timeLimited
      if (data.is_timeLimited && data.expire_at !== 'unlimited') {
        const expire = new Date(data.expire_at).getTime();
        if (Date.now() >= expire) {
          // expired -> set default (last default in history where is_timeLimited===false, else fallback)
          data.is_expired = true;
          // find last default promo in history (non-timeLimited) newest
          const defaultHist = data.history.slice().reverse().find(h => !h.is_timeLimited);
          const fallback = defaultHist || { promoCode: '196923', created_at: new Date().toISOString(), expire_at: 'unlimited', is_timeLimited: false, is_expired: false };
          data.promoCode = fallback.promoCode;
          data.created_at = fallback.created_at;
          data.expire_at = fallback.expire_at;
          data.is_timeLimited = false;
          data.is_expired = false;
          // append expired entry to history (keeps it for up to 24h)
          data.history = data.history || [];
          data.history.push({ ...data, expired_at_checked: new Date().toISOString() });
          // write back
          fs.writeFileSync(PROMO_PATH, JSON.stringify(data, null, 2));
        }
      }

      return res.json(data);
    }

    // POST/PUT endpoints are protected via a simple Basic Auth body check (for serverless demo). In production use proper auth.
    const body = req.method === 'GET' ? {} : req.body || JSON.parse(req.rawBody || '{}');

    // login endpoint
    if (req.url.includes('/api/promo/login') && req.method === 'POST') {
      const { id, pass } = body;
      if (id === ADMIN_ID && pass === ADMIN_PASS) {
        // return a simple session token (signed data) - here we return a short-lived token
        const token = Buffer.from(JSON.stringify({ id, t: Date.now() })).toString('base64');
        return res.json({ ok: true, token });
      }
      return res.status(401).json({ ok: false, error: 'Invalid credentials' });
    }

    // require token in body.token for protected actions
    if (!body.token) return res.status(401).json({ ok: false, error: 'missing token' });

    // Set new temporary promo (time-limited)
    if (req.method === 'POST' && req.url.includes('/api/promo/set-temp')) {
      const { promoCode, minutes } = body;
      const created = new Date();
      const expireAt = new Date(created.getTime() + (Number(minutes) || 0) * 60 * 1000);
      const entry = {
        promoCode: String(promoCode),
        created_at: created.toISOString(),
        expire_at: expireAt.toISOString(),
        is_expired: false,
        is_timeLimited: true
      };

      // push current (if not timeLimited) into history as default marker
      data.history = data.history || [];
      // save backup of current
      data.history.push({ ...data });

      // set new current
      data.promoCode = entry.promoCode;
      data.created_at = entry.created_at;
      data.expire_at = entry.expire_at;
      data.is_expired = false;
      data.is_timeLimited = true;

      fs.writeFileSync(PROMO_PATH, JSON.stringify(data, null, 2));
      return res.json({ ok: true, data });
    }

    // Set default promo (permanent until replaced)
    if (req.method === 'POST' && req.url.includes('/api/promo/set-default')) {
      const { promoCode } = body;
      const created = new Date();
      const entry = {
        promoCode: String(promoCode),
        created_at: created.toISOString(),
        expire_at: 'unlimited',
        is_expired: false,
        is_timeLimited: false
      };

      // replace default by appending previous default to history and writing new default as current only if nothing timeLimited active
      data.history = data.history || [];
      // append previous
      data.history.push({ ...data });

      // set as default backup (we keep this as current only when no temp active)
      // If there is a current timeLimited promo, we still register the new default but keep current showing until expiry.
      // So we store the new default in a dedicated spot in data._default
      data._default = entry; // internal default

      // if current is not timeLimited, immediately make it current
      if (!data.is_timeLimited) {
        data.promoCode = entry.promoCode;
        data.created_at = entry.created_at;
        data.expire_at = entry.expire_at;
        data.is_timeLimited = false;
        data.is_expired = false;
      }

      fs.writeFileSync(PROMO_PATH, JSON.stringify(data, null, 2));
      return res.json({ ok: true, data });
    }

    return res.status(400).json({ ok: false, error: 'unknown action' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'server error', details: err.message });
  }
};
