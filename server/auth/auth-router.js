const { Router } = require('express');
const { OAuth2Client } = require('google-auth-library');
const db = require('../db/database');
const jwt = require('./jwt');

const router = Router();

async function verifyGoogle(idToken) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID not configured');
  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({ idToken, audience: clientId });
  const payload = ticket.getPayload();
  return { providerId: payload.sub, name: payload.name || 'Google User', avatarUrl: payload.picture || null };
}

async function verifyKakao(accessToken) {
  const res = await fetch('https://kapi.kakao.com/v2/user/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Kakao token invalid');
  const data = await res.json();
  const profile = data.kakao_account?.profile || {};
  return { providerId: String(data.id), name: profile.nickname || 'Kakao User', avatarUrl: profile.profile_image_url || null };
}

router.post('/verify', async (req, res) => {
  const { provider, token, name } = req.body;
  if (!provider || !token) {
    return res.status(400).json({ error: 'provider and token required' });
  }

  try {
    let providerData;

    if (provider === 'guest') {
      const guestName = (name || 'Guest').slice(0, 20);
      const guestId = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      providerData = { providerId: guestId, name: guestName, avatarUrl: null };
    } else if (provider === 'google') {
      providerData = await verifyGoogle(token);
    } else if (provider === 'kakao') {
      providerData = await verifyKakao(token);
    } else {
      return res.status(400).json({ error: 'unsupported provider' });
    }

    const user = db.upsertUser({
      provider,
      providerId: providerData.providerId,
      name: providerData.name,
      avatarUrl: providerData.avatarUrl,
    });

    const jwtToken = jwt.sign({ userId: user.id, name: user.name, provider });
    res.json({ jwt: jwtToken, user: { id: user.id, name: user.name, provider, avatarUrl: user.avatar_url } });
  } catch (err) {
    console.error('[AUTH] verify error:', err.message);
    res.status(401).json({ error: 'token verification failed' });
  }
});

module.exports = router;
