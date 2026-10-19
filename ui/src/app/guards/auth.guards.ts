import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs/operators';
import { AuthTokenService } from '../services/auth-token.service';
import { SessionService } from '../services/session.service';

const loginRedirect = (router: Router, returnUrl: string) =>
  router.createUrlTree(['/login'], { queryParams: { returnUrl } });

const requireSession = (returnUrl: string, check: (session: SessionService, router: Router) => boolean | ReturnType<Router['createUrlTree']>): ReturnType<CanActivateFn> => {
  const auth = inject(AuthTokenService);
  const session = inject(SessionService);
  const router = inject(Router);
  if (!auth.token()?.trim()) {
    return loginRedirect(router, returnUrl);
  }
  return session.ensureSessionLoaded().pipe(
    map(() => check(session, router))
  );
};

/** Valid session token and user (session loaded). Redirects to login with returnUrl when absent. */
export const requireSignedInRoute: CanActivateFn = (_route, state) => {
  return requireSession(state.url, (session, router) => {
    if (session.user()) return true;
    return loginRedirect(router, state.url);
  });
};

/**
 * For login/register-style routes: allow guests; redirect signed-in users away
 * (avoids showing the login form when already authenticated).
 */
export const guestOnlyRoute: CanActivateFn = (route, _state) => {
  const auth = inject(AuthTokenService);
  const session = inject(SessionService);
  const router = inject(Router);
  if (!auth.token()?.trim()) {
    return true;
  }
  return session.ensureSessionLoaded().pipe(
    map(() => {
      if (!session.user()) {
        return true;
      }
      const raw = route.queryParamMap.get('returnUrl');
      const target = raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/studies';
      return router.parseUrl(target);
    })
  );
};

export const requireBiblesRoute: CanActivateFn = (_route, state) => {
  return requireSession(state.url, (session, router) => (session.hasBiblesPermission() ? true : router.createUrlTree(['/settings/access'])));
};

export const requireAccessRoute: CanActivateFn = (_route, state) => {
  return requireSession(state.url, (session, router) => (session.hasAccessPermission() ? true : router.createUrlTree(['/settings/access'])));
};

export const requireCurationRoute: CanActivateFn = (_route, state) => {
  return requireSession(state.url, (session, router) => (session.hasCurationPermission() ? true : router.createUrlTree(['/settings/access'])));
};
