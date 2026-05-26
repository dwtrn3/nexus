import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import bcrypt from 'bcryptjs';
import { query } from './database.js';

export function configurePassport(passport) {
  passport.serializeUser((user, done) => done(null, user.id));

  passport.deserializeUser(async (id, done) => {
    try {
      const result = await query('SELECT * FROM users WHERE id = $1', [id]);
      done(null, result.rows[0] || false);
    } catch (err) {
      done(err);
    }
  });

  passport.use(new LocalStrategy(
    { usernameField: 'email' },
    async (email, password, done) => {
      try {
        const result = await query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
        const user = result.rows[0];
        if (!user) return done(null, false, { message: 'Invalid email or password' });
        if (!user.password_hash) return done(null, false, { message: 'Please use Google to sign in' });
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return done(null, false, { message: 'Invalid email or password' });
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  ));

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3001/api/auth/google/callback',
        scope: ['profile', 'email', 'https://www.googleapis.com/auth/chat.messages', 'https://www.googleapis.com/auth/gmail.modify']
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails[0].value;
          const name = profile.displayName;

          let result = await query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
          let user = result.rows[0];

          if (!user) {
            const newUser = await query(
              'INSERT INTO users (email, name, google_oauth_token, avatar_url) VALUES ($1, $2, $3, $4) RETURNING *',
              [email.toLowerCase(), name, JSON.stringify({ access_token: accessToken, refresh_token: refreshToken }), profile.photos?.[0]?.value]
            );
            user = newUser.rows[0];
          } else {
            await query(
              'UPDATE users SET google_oauth_token = $1, name = $2 WHERE id = $3',
              [JSON.stringify({ access_token: accessToken, refresh_token: refreshToken }), name, user.id]
            );
            user = (await query('SELECT * FROM users WHERE id = $1', [user.id])).rows[0];
          }

          // Auto-connect Google Chat
          await query(
            `INSERT INTO google_chat_connections (user_id, email, refresh_token)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id) DO UPDATE SET email = $2, refresh_token = $3`,
            [user.id, email, refreshToken || accessToken]
          );

          return done(null, user);
        } catch (err) {
          return done(err);
        }
      }
    ));
  }
}
