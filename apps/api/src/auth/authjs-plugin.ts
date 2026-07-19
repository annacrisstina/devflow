import { Auth, type AuthConfig } from '@auth/core';
import GitHub from '@auth/core/providers/github';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import type { Db } from '@devflow/db/client';
import { accounts, sessions, users, verificationTokens } from '@devflow/db/schema/auth';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import type { ApiConfig } from '../config.js';

export type AuthJsPluginOptions = {
  config: ApiConfig;
};

export const AUTH_BASE_PATH = '/api/auth';

/**
 * Builds the Auth.js configuration (ADR-0013). Database session strategy:
 * the session token in the cookie is a row in `sessions`, revocable by
 * deleting the row — owning the session table was D3's stated motivation.
 * The OAuth client is the GitHub App's own ("Request user authorization"),
 * so there is no second OAuth App to register.
 */
export function buildAuthConfig(config: ApiConfig, db: Db): AuthConfig {
  return {
    basePath: AUTH_BASE_PATH,
    secret: config.authSecret,
    // The API sits behind our own URL (dev: loopback; prod: the deployment's
    // domain via DEVFLOW_APP_URL) — the Host header is ours to trust.
    trustHost: true,
    adapter: DrizzleAdapter(db, {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    }),
    session: { strategy: 'database' },
    providers: [
      GitHub({
        clientId: config.githubClientId,
        clientSecret: config.githubClientSecret,
      }),
    ],
  };
}

/**
 * Translates a Fastify request into the Fetch `Request` @auth/core consumes.
 * The URL is rebuilt on the configured public base URL, not the Host header,
 * so OAuth callback URLs are stable regardless of how the request arrived.
 */
function toFetchRequest(request: FastifyRequest, appUrl: string): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (typeof value === 'string') headers.set(name, value);
    else if (Array.isArray(value)) for (const v of value) headers.append(name, v);
  }
  const method = request.method.toUpperCase();
  const body =
    method === 'GET' || method === 'HEAD' ? undefined : new Uint8Array(request.body as Buffer);
  return new Request(`${appUrl}${request.raw.url ?? ''}`, { method, headers, body });
}

/**
 * Mounts @auth/core on Fastify — the same shim pattern as the official
 * @auth/express package (there is no official Fastify one; the engine is
 * framework-agnostic Request→Response, so the adapter is ~40 lines).
 */
export const authJsPlugin: FastifyPluginAsync<AuthJsPluginOptions> = async (app, opts) => {
  const authConfig = buildAuthConfig(opts.config, app.db);

  // Auth.js parses its own form bodies (CSRF-checked); hand it raw bytes.
  // Encapsulated in this plugin: the rest of the app never sees form posts.
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'buffer' },
    (_request, body, done) => {
      done(null, body);
    },
  );

  app.route({
    method: ['GET', 'POST'],
    url: `${AUTH_BASE_PATH}/*`,
    handler: async (request, reply) => {
      const response = await Auth(toFetchRequest(request, opts.config.appUrl), authConfig);

      // Set-Cookie must keep one header per cookie; everything else is 1:1.
      response.headers.forEach((value, name) => {
        if (name.toLowerCase() !== 'set-cookie') reply.header(name, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length > 0) reply.header('set-cookie', cookies);

      return reply.status(response.status).send(response.body ? await response.text() : undefined);
    },
  });
};
