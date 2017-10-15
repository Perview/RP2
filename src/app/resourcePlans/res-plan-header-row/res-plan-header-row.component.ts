import { Component, OnInit,Input,Output,EventEmitter } from '@angular/core';
import {IResPlan,Timescale,WorkUnits,IInterval} from '../../resourcePlans/res-plan.model';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'res-plan-header-row',
  templateUrl: './res-plan-header-row.component.html',
  styleUrls: ['./res-plan-header-row.component.css']
})
export class ResPlanHeaderRowComponent implements OnInit {
visible: boolean = true;
 _resPlans: IResPlan[];
 _intervals: IInterval[];
  

  constructor(private router: Router,private _route: ActivatedRoute) { }
  @Output() onselectAllChanged = new EventEmitter<boolean>();
  ngOnInit() {
  this._route.data.subscribe(values =>{
    this._resPlans = values.resPlans; 
    this.setIntervals(this._resPlans)
    //console.log('header component data=' + JSON.stringify(values.resPlans))
  },(error)=>console.log(error));
  }

  selectAllChange(value:boolean)
  {
   this.onselectAllChanged.emit(value);
  }

  setIntervals(resPlans:IResPlan[]) 
  {
   resPlans.forEach(resPlan=>{
     let projectWithIntervals = resPlan.projects.find(t=>t.intervals.length > 0);
     if(projectWithIntervals)
     {
       this._intervals = projectWithIntervals.intervals;
       //TODO how to break out of for loop when intervals already found
     }

   })
  }

}
