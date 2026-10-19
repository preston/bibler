import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap } from '@angular/router';
import { map } from 'rxjs';
import { STUDY_DETAIL_API } from './study-detail-api.token';

@Injectable()
export abstract class StudyPlanWorkspaceBaseComponent {
  readonly vm = inject(STUDY_DETAIL_API);
  private readonly route = inject(ActivatedRoute);

  readonly planItemUuid = toSignal(
    this.route.paramMap.pipe(map((p: ParamMap) => p.get('planItemUuid'))),
    { initialValue: this.route.snapshot.paramMap.get('planItemUuid') }
  );

  readonly showStepEditor = computed(() => !!this.planItemUuid());
}
