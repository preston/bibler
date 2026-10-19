// Author: Preston Lee

import { enableProdMode, provideZonelessChangeDetection } from '@angular/core';
import { environment } from './environments/environment';
import { AppComponent } from './app/components/app.component';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { withInterceptors, provideHttpClient } from '@angular/common/http';
import { authTokenInterceptor } from './app/services/auth-token.interceptor';
import { routes } from './app/app.routes';

if (environment.production) {
  enableProdMode();
}

bootstrapApplication(AppComponent, {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authTokenInterceptor]))
  ]
}).catch((err) => console.error(err));
