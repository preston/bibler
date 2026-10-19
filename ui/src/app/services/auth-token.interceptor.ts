import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthTokenService } from './auth-token.service';

export const authTokenInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthTokenService).token();
  if (!token) return next(req);
  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
