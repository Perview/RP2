import { Routes } from '@angular/router'
import { ResPlanListComponent } from './resourcePlans/res-plan-list.component'
import { FooComponent } from './resourcePlans/foo.component'

import { RxjsComponentComponent } from './resourcePlans/rxjs-component/rxjs-component.component'
import { Rxjs2 } from './resourcePlans/rxjs-component/rxjs-component.component2'
import { ResourcePlansResolverService } from './services/resource-plans-resolver.service'

export const appRoutes: Routes = [

  {
    path: 'resPlans'
    , component: ResPlanListComponent
    , resolve: {resPlans: ResourcePlansResolverService }
  },
  { path: 'foo', component: FooComponent },

  { path: '', redirectTo: '/resPlans', pathMatch: 'full' }

]