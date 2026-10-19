import {Component, ChangeDetectionStrategy} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './header.component';
import { FooterComponent } from './footer.component';
import { ToastHostComponent } from './toast-host.component';

@Component({
    selector: 'app',
    templateUrl: 'app.html',
    standalone: true,
    imports: [RouterOutlet, HeaderComponent, FooterComponent, ToastHostComponent],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent {}
