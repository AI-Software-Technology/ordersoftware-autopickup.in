// DB keeps relative paths ("/uploads/products/x.png"). Frontend may live on another
// origin, so every JSON response gets those paths expanded to full URLs.
const { publicBase, URL_PREFIX } = require('../utils/uploads');

const NEEDLE = `"${URL_PREFIX}`;

module.exports = function uploadUrls(req, res, next) {
  const original = res.json.bind(res);
  res.json = (body) => {
    if (body === undefined || body === null) return original(body);
    const text = JSON.stringify(body);
    if (text === undefined || !text.includes(NEEDLE)) return original(body);
    const base = publicBase(req);
    const out = text.split(NEEDLE).join(`"${base}${URL_PREFIX}`);
    res.set('Content-Type', 'application/json; charset=utf-8');
    return res.send(out);
  };
  next();
};
