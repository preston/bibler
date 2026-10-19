// Author: Preston Lee

import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
    selector: 'app-footer',
    templateUrl: 'footer.html',
    standalone: true,
    imports: [],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class FooterComponent {}
