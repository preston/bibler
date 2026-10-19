// Author: Preston Lee

import { Routes } from '@angular/router';
import {
  guestOnlyRoute,
  requireAccessRoute,
  requireBiblesRoute,
  requireCurationRoute,
  requireSignedInRoute,
} from './guards/auth.guards';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./components/landing.component').then((m) => m.LandingComponent)
  },
  {
    path: 'login',
    loadComponent: () => import('./components/login.component').then((m) => m.LoginComponent),
    canActivate: [guestOnlyRoute]
  },
  {
    path: 'sermons',
    loadComponent: () => import('./components/sermons-list.component').then((m) => m.SermonsListComponent)
  },
  {
    path: 'sermons/:uuid',
    loadComponent: () => import('./components/sermon-detail.component').then((m) => m.SermonDetailComponent)
  },
  {
    path: 'studies',
    loadComponent: () => import('./components/studies-list.component').then((m) => m.StudiesListComponent)
  },
  {
    path: 'studies/:uuid',
    loadComponent: () => import('./components/study-detail.component').then((m) => m.StudyDetailComponent),
    children: [
      {
        path: 'details',
        loadComponent: () =>
          import('./components/study-detail-details.component').then((m) => m.StudyDetailDetailsComponent),
        canActivate: [requireSignedInRoute]
      },
      {
        path: 'ai',
        loadComponent: () => import('./components/study-detail-ai.component').then((m) => m.StudyDetailAiComponent),
        canActivate: [requireSignedInRoute]
      },
      {
        path: 'step/:planItemUuid/commentary',
        loadComponent: () =>
          import('./components/study-plan-commentary.component').then((m) => m.StudyPlanCommentaryComponent)
      },
      {
        path: 'step/:planItemUuid/verse',
        loadComponent: () =>
          import('./components/study-plan-verse.component').then((m) => m.StudyPlanVerseComponent)
      },
      {
        path: 'step/:planItemUuid/question',
        loadComponent: () =>
          import('./components/study-plan-question.component').then((m) => m.StudyPlanQuestionComponent)
      },
      {
        path: 'step/:planItemUuid/task',
        loadComponent: () => import('./components/study-plan-task.component').then((m) => m.StudyPlanTaskComponent)
      },
      {
        path: 'step/:planItemUuid/custom',
        loadComponent: () => import('./components/study-plan-blank.component').then((m) => m.StudyPlanBlankComponent)
      },
      {
        path: 'step/:planItemUuid/worship',
        loadComponent: () =>
          import('./components/study-plan-worship.component').then((m) => m.StudyPlanWorshipComponent)
      },
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('./components/study-plan-empty.component').then((m) => m.StudyPlanEmptyComponent)
      }
    ]
  },
  {
    path: 'reader',
    loadComponent: () => import('./components/reader.component').then((m) => m.ReaderComponent)
  },
  {
    path: 'comparator',
    loadComponent: () => import('./components/comparator.component').then((m) => m.ComparatorComponent)
  },
  {
    path: 'search',
    loadComponent: () => import('./components/search.component').then((m) => m.SearchComponent)
  },
  {
    path: 'api',
    loadComponent: () => import('./components/api.component').then((m) => m.ApiComponent)
  },
  {
    path: 'settings',
    loadComponent: () => import('./components/settings-shell.component').then((m) => m.SettingsShellComponent),
    children: [
      { path: '', redirectTo: 'access', pathMatch: 'full' },
      {
        path: 'access',
        loadComponent: () => import('./components/settings-access.component').then((m) => m.SettingsAccessComponent)
      },
      {
        path: 'ai',
        loadComponent: () => import('./components/settings-ai.component').then((m) => m.SettingsAiComponent),
        canActivate: [requireSignedInRoute, requireBiblesRoute]
      },
      {
        path: 'documents',
        loadComponent: () =>
          import('./components/settings-documents.component').then((m) => m.SettingsDocumentsComponent),
        canActivate: [requireSignedInRoute]
      },
      {
        path: 'library',
        redirectTo: 'documents',
        pathMatch: 'full'
      },
      {
        path: 'studies',
        loadComponent: () =>
          import('./components/settings-studies.component').then((m) => m.SettingsStudiesComponent),
        canActivate: [requireSignedInRoute, requireCurationRoute]
      },
      {
        path: 'roles',
        loadComponent: () => import('./components/settings-roles.component').then((m) => m.SettingsRolesComponent),
        canActivate: [requireSignedInRoute, requireAccessRoute]
      },
      {
        path: 'users',
        loadComponent: () => import('./components/settings-users.component').then((m) => m.SettingsUsersComponent),
        canActivate: [requireSignedInRoute, requireAccessRoute]
      }
    ]
  }
];
