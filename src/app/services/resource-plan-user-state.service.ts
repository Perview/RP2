import { Injectable, OnInit } from '@angular/core';
import { HttpClient, HttpResponse, HttpHeaders, HttpRequest } from '@angular/common/http';
import { ConfigService, } from './config-service.service'
import { HttpClient } from '@angular/common/http'
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/catch';
import 'rxjs/add/operator/do';
import 'rxjs/add/operator/filter'
import 'rxjs/add/operator/mergeMap'
import { Observable } from 'rxjs';
import * as moment from 'moment'


import { IResPlan, ResPlan, IProject, Project, WorkUnits, Timescale, IInterval, Interval, IResource, Resource, Config, Result } from '../resourcePlans/res-plan.model'
declare var $: any;

@Injectable()
export class ResourcePlanUserStateService {
    config: Config;
    constructor(private http: HttpClient, private _configSvc: ConfigService) {
        this.config = _configSvc.config;
    }

    getCurrentUserId(): Observable<string> {


        console.log("configuration = " + JSON.stringify(this.config))
        let baseUrl = `${this.config.projectServerUrl}/_api/SP.UserProfiles.PeopleManager/GetMyProperties/AccountName`
        //1. get data from SP List UserState 
        let url = baseUrl;
        let headers = new HttpHeaders();
        headers = headers.set('accept', 'application/json;odata=verbose')
        ;
        let options = {
            headers 
        };
        return this.http.get(url,options)
            .flatMap((spData: Response) => {
                ;
                var accountName = spData["d"].AccountName
                url = `${this.config.projectServerUrl}/_api/ProjectData/Resources`
                let filter = "?$filter=ResourceNTAccount eq '" + encodeURIComponent('i:0#.w|' + accountName) + "'"
                return this.http.get(url + filter,options)
                    .map((data: Response) => {
                        return data["d"].results[0].ResourceId.toUpperCase();
                    })
            })
    }

    getUniqueResourcesForResManager(resUid: string): Observable<IResource[]> {
        let baseUrl = `${this.config.ResPlanUserStateUrl}/Items`

        //remember to change UID0 to UID
        //let select = '$select=ResourceUID0'  //dev
        let select = '$select=ResourceUID'  //qa
        let filter = `$filter=ResourceManagerUID eq '${resUid}'`;
        //1. get data from SP List UserState 
        let url = baseUrl + '?' + filter + '&' + select;
        let headers = new HttpHeaders();
        headers = headers.set('accept', 'application/json;odata=verbose')
       
        ;
        let options = {
            headers 
        };
        return this.http.get(url,options)
            .map((data: Response) => 
            {
                ;
                if(data["d"].results.length > 0)
                return JSON.parse(data["d"].results
                .map(r=>r["ResourceUID0"])) as IResource[] //dev
                //.map(r=>r["ResourceUID"])) as IResource[] //qa
                else{
                    return []
                }
            })
    }

    getProjectIdsFromAssignmentsForResources(resources: IResource[]): Observable<IResPlan[]> {
        let baseUrl = `${this.config.projectServerUrl}/_api/ProjectData/Assignments`;
        let select = "$select=ProjectId,ProjectName";
        let headers = new HttpHeaders();
        headers = headers.set('accept', 'application/json;odata=verbose')
        let options = {
            headers 
        };
        let resourceProjectsMap : IResPlan[] = []
        resources.forEach(resource => {
            resourceProjectsMap.push(new ResPlan(resource))
        })
        ;
        //console.log('=======================hitting project server for assigments')
        return Observable.from(resources).flatMap(t => {
            let filter = `$filter=ResourceName eq '${t.resName}' and AssignmentType eq 101`
            let url = baseUrl + '?' + filter + '&' + select;
            // get unique project Uids from PS where the current resource has access to
            //and project has resource plan assignments

            return this.http.get(url, options)
                .switchMap((data: Response) => data["d"].results)
                .map(p => new Project(p["ProjectId"], p["ProjectName"], false, []))
                .distinct(x => x.projUid)
                .toArray()
                .flatMap(projects => {
                    resourceProjectsMap.find(r => r.resource.resUid.toUpperCase() == t.resUid.toUpperCase()).projects = projects;
                    return resourceProjectsMap;
                }
                ).toArray()
                .do(r=>
                {
                    console.log("RES PLANS READ ROM ASSIGNMENTS=" + JSON.stringify(r))
                })
        })

        //.do(t => console.log('projects user has access on=' + JSON.stringify(t)))


    }

    getResPlans(resMgrUid: string, fromDate: Date, toDate: Date, timescale: Timescale, workunits: WorkUnits): Observable<IResPlan[]> {
        //let uniqueProjectsForResMgr = this.getUniqueProjectsForResManager(resMgrUid);
        let resourceForResMgr = this.getUniqueResourcesForResManager(resMgrUid);

        //let uniqueProjectsForAllResMgr = resourceForResMgr.flatMap(resources => this.getUniqueProjectsAcrossResMgrs(resMgrUid, resources));
        let resProjMap: [IResPlan];
        let uniqueProjectsResMgrHasAccessOn = resourceForResMgr.flatMap(resources => this.getProjectIdsFromAssignmentsForResources(resources));
        //let mergedProjects = uniqueProjectsForResMgr.merge(uniqueProjectsForAllResMgr)

        // let projectsWithreadOnlyFlag = mergedProjects.flatMap(val => {

        //     return uniqueProjectsResMgrHasAccessOn.flatMap(projectsWithRights => {
        //         return val.map(x => {
        //             ;
        //             if (projectsWithRights.find(k => k.projUid.toUpperCase() == x.projUid.toUpperCase()) == null) {
        //                 x.readOnly = true;
        //             }
        //             else {
        //                 x.readOnly = false;
        //             }
        //             return x;
        //         })
        //     })
        // }).distinct(t => t.projUid).toArray()

        
        return resourceForResMgr.flatMap(resources => {

            
                return this.getResPlansFromProjects(resMgrUid, resources, uniqueProjectsResMgrHasAccessOn, fromDate, toDate, timescale, workunits)
                // .do(t => {
                //     //console.log('resource plans read from add resource =' + JSON.stringify(t))
                // })
            
            // .do(t => {
            //     //console.log('projects passed in =' + JSON.stringify(t))
            // })
        })

    }

    ///Add Resource Plan use case
    getResPlansFromResources(resMgrUid: string, resources: IResource[], fromDate: Date, toDate: Date, timescale: Timescale, workunits: WorkUnits): Observable<IResPlan[]> {
        //let projectsForAllResources = this.getUniqueProjectsAcrossResMgrs(resMgrUid, resources);
        let projectsThatUserHasAccessOn = this.getProjectIdsFromAssignmentsForResources(resources);
        //let combinedProjects = projectsForAllResources.merge(projectsThatUserHasAccessOn);
        // let allProjectsWithReadOnlyFlags = combinedProjects.flatMap(projectsForResource => {
        //     return projectsThatUserHasAccessOn.flatMap(projectsWithrights => {
        //         return projectsForResource.map(x => {
        //             if (projectsWithrights.find(k => k.projUid.toUpperCase() == x.projUid.toUpperCase()) != null) {
        //                 x.readOnly = false;
        //             }
        //             else {
        //                 x.readOnly = true;
        //             }
        //             return x;
        //         })
        //     })
        // }).toArray()


        // var readOnlyProjects = allProjectsWithReadOnlyFlags.map(t => { ; return t.filter(project => project.readOnly == true) })
        return this.getResPlansFromProjects(resMgrUid, resources, projectsThatUserHasAccessOn, fromDate, toDate, timescale, workunits)
        // .filter((r: IResPlan[]) => {
        //         ;
        //         return r.find(x => {
        //             return resources.map(p => p.resUid.toUpperCase()).indexOf(x.resource.resUid.toUpperCase()) > -1
        //         }) != null
        //     })

        
        // .do(resPlans => {
        //     this.AddResourceToManager(resMgrUid, resPlans).subscribe();
        // });

        // return readableResPlans.flatMap(x => {
        //     return this.getReadOnlyResPlans(resMgrUid, resources, readOnlyProjects).flatMap(t => {
        //         ;
        //         return Observable.from(x.concat(t)).groupBy(t => {
        //             return t.resource.resUid.toUpperCase()
        //         }).flatMap(group => {
        //             ;
        //             return group && group.key && group.reduce(function (a, b) {
        //                 for (var i = 0; i < b.projects.length; i++) {
        //                     if (a.projects.findIndex(t => t.projUid.toUpperCase() == b.projects[i].projUid.toUpperCase()) < 0)
        //                         a.projects = a.projects.concat(b.projects[i]);
        //                 }
        //                 return a; // returns object with property x
        //             })
        //         })
        //     }).
        //         toArray()
        // })

        // return allProjectsWithReadOnlyFlags.flatMap(t => {

        //     return readOnlyResPlans;
        // })
    }
    

    public getRequestDigestToken(): Observable<string> {
        let url = `${this.config.projectServerUrl}/_api/contextinfo`;
        let headers = new HttpHeaders();
        headers = headers.set('accept', 'application/json;odata=verbose')
        let options = {
            headers 
        };

        return this.http.post(url, {}, options).map(response => 
            {
                ;
            return response["d"].GetContextWebInformation.FormDigestValue})
            
    }
    public AddResourceToManager(resMgrUid: string, resourcePlans: IResPlan[]): Observable<Result> {
        let existingResources :IResource[];
        
        let headers = new HttpHeaders();
        headers = headers.set('accept', 'application/json;odata=verbose')
        let options = {
            headers 
        };
        let url = `${this.config.ResPlanUserStateUrl}/Items`
        let filter = `?$filter=ResourceManagerUID eq '${resMgrUid}'`
        let isNewEntry = false;
        return this.http.get(url + filter, options)
                    .flatMap((data: Response) => {
                        let resources = [];
                        resources = resources.concat(resourcePlans.map(r=>r.resource));
                        if(data["d"].results.length > 0){
                        existingResources = JSON.parse(data["d"].results[0]["ResourceUID0"]).map(resource => { return new Resource(resource.resUid, resource.resName) }) //dev
                        //existingResources = JSON.parse(data.json().d.results[0]["ResourceUID"]).map(resource => { return new Resource(resource.resUid, resource.resName) }) //qa
                        existingResources = existingResources
                        .filter(e=>resources.map(r=>r.resUid.toUpperCase()).indexOf(e.resUid.toUpperCase()) < 0)
                        }
                        else{
                            isNewEntry = true;
                        }
                        
        return this.getRequestDigestToken().flatMap(digest => {
            
                let url = `${this.config.ResPlanUserStateUrl}/Items`

               let headers = new HttpHeaders();
               headers = headers.set('Accept', 'application/json;odata=verbose')
               headers = headers.set('Content-Type', 'application/json;odata=verbose')
               headers = headers.set('X-RequestDigest', digest)
                if(isNewEntry == false){
                    headers = headers.set('X-HTTP-Method', 'MERGE')
                    headers = headers.set('IF-MATCH', '*')
                }
                let options = {
                    headers: headers
                }
                //let resources = `'[${resourcePlans.map(t => 
                
 
                if(isNewEntry == false)
                {
                    url = data["d"].results[0].__metadata.uri;
                    resources = existingResources.concat(resources);
                }
                let resourcesJSON = `'[${resources.map(t => '{"resUid":"' + t.resUid + '","resName":"' + t.resName + '"}').join(",")}]'`
                let body = `{"__metadata": { "type": "SP.Data.ResourcePlanUserStateListItem" },"ResourceManagerUID": "${resMgrUid}"
                ,"ResourceUID":${resourcesJSON}}`;
                return this.http.post(url, body, options)
                    .map(r => {
                        let result = new Result();
                        result.success = true;
                        return result;
                    }) 
                })
        })
    }

    getResPlansFromProjects(resUid: string, resources: IResource[], resPlans: Observable<IResPlan[]>, fromDate: Date, toDate: Date, timescale: Timescale, workunits: WorkUnits): Observable<IResPlan[]> {
        let emptyResPlans = Observable.of(resources.map(r => new ResPlan(r, [])))
        var uniqueProjects = resPlans.flatMap(r=>Observable.from(r).flatMap(r=>r.projects)).distinct(x=>x.projUid);
        return uniqueProjects.flatMap((project: IProject) => {
            return this.getResPlan(resources, `${this.config.projectServerUrl}`, project, fromDate, toDate, timescale, workunits)

        }).toArray()
          
       
            .concat(emptyResPlans)
            .concat(resPlans)
            .flatMap(t => { ; return t; }).
            groupBy(t => { return t.resource.resUid.toUpperCase() }).flatMap(group => {
                return group.reduce(function (a, b) {
                    // if(group.key === "00000000-0000-0000-0000-000000000000")
                    // {
                    //     resProjMap.forEach(resPlan => {
                    //        resPlan.projects.forEach(project => {
                    //            if(a.projects.concat(b.projects).map(p=>p.projUid.toUpperCase()).indexOf(project.projUid.toUpperCase()) > -1)
                    //            {
                    //               project.readOnly = true;
                    //            }
                    //        }); 
                    //     });
                    // }
                    for (var i = 0; i < b.projects.length; i++) {
                        if (a.projects.findIndex(t => t.projUid.toUpperCase() == b.projects[i].projUid.toUpperCase()) < 0)
                            a.projects = a.projects.concat(b.projects[i]);
                    }
                    return a; // returns object with property x
                })

            })
           .toArray()
           .do(t => console.log("RES PLANS READ =====" + JSON.stringify(t)))
           .map(rps=>{
            rps.forEach(rp => {
                var allReadOnlyProjects = rps.find(r => r.resource.resUid.toUpperCase() == "00000000-0000-0000-0000-000000000000") && rps.find(r => r.resource.resUid.toUpperCase() == "00000000-0000-0000-0000-000000000000").projects.filter(p => p.readOnly == true)
                if (allReadOnlyProjects) {
                    var readOnlyProjectsInRP = rp.projects.filter(p => allReadOnlyProjects.map(r => r.projUid.toUpperCase()).indexOf(p.projUid.toUpperCase()) > -1)
                    readOnlyProjectsInRP.forEach(project => {
                        project.readOnly = true;
                        project.readOnlyReason = allReadOnlyProjects.find(x=>x.projUid.toUpperCase() == project.projUid.toUpperCase()).readOnlyReason
                        project.intervals = this.buildIntervals(fromDate,toDate,timescale);
                    });
                }
                //weed out stale publish projects
                rp.projects =  rp.projects.filter(p=>p.stalePublish == false && p.intervals && p.intervals.length > 0);
                rp.projects = rp.projects.sort((a,b)=>{
                    return a.projName.localeCompare(b.projName);
                })
            })
            rps.findIndex(r => r.resource.resUid.toUpperCase() == "00000000-0000-0000-0000-000000000000") > -1 &&
             rps.splice(rps.findIndex(r => r.resource.resUid.toUpperCase() == "00000000-0000-0000-0000-000000000000"), 1)
            return rps;
           })
           
    }

    getDateFormatString(date: Date): string {
        var NowMoment = moment(date)
        return NowMoment.format('YYYY-MM-DD');
    }

    buildIntervals(_startDate: Date, _endDate: Date , _timeScale: Timescale ): IInterval[] {
        
            let intervals: Interval[] = []
            let firstInterval = new Interval()
        if(_timeScale == Timescale.weeks){
            if (moment(_startDate).day() === 0 ) {  //sunday
              firstInterval.start = moment(_startDate).toDate()
              firstInterval.end = moment(_startDate).toDate()
            }
            else {
              firstInterval.start = moment(_startDate).toDate()
              firstInterval.end = new Date(moment(_startDate).add(1, 'day').isoWeekday(7).format('MM-DD-YYYY'))
              console.log(firstInterval)
            }
            
            
            let lastInterval = new Interval()
            if (moment(_endDate).day() === 1)   {   //monday
              lastInterval.start = moment(_endDate).toDate()
              lastInterval.end = moment(_endDate).toDate()
            }
            else {
              lastInterval.start = moment(_endDate).subtract(1, 'day').isoWeekday(1).toDate()
              lastInterval.end = moment(_endDate).toDate()
            }
            
            intervals.push(firstInterval)
             
            let weeksToGenerate = moment(lastInterval.end).diff(moment(firstInterval.start),'weeks')
        
            for (var i = 0; i < weeksToGenerate; i++)  {
              let interval = new Interval()
              interval.start = moment(intervals[i].end).add(1,'days').toDate()
              interval.end = moment(intervals[i].end).add(1,'weeks').toDate()
              intervals.push(interval)
            }
            
            if (lastInterval.start > intervals[weeksToGenerate].end) {
              intervals.push(lastInterval)
            } 
        }

        if(_timeScale == Timescale.calendarMonths){
            ;
            if (moment(_startDate).endOf('month').date() === moment(_startDate).date()) {  //end of month
              firstInterval.start = moment(_startDate).toDate()
              firstInterval.end = moment(_startDate).toDate()
            }
            else {
              firstInterval.start = moment(_startDate).toDate()
              firstInterval.end = new Date(moment(_startDate).endOf('month').add(1,'days').format('MM-DD-YYYY'))
              console.log(firstInterval)
            }
            
            
            let lastInterval = new Interval()
            if (moment(_endDate).date() === 1)   {   //beginning of the month
              lastInterval.start = moment(_endDate).toDate()
              lastInterval.end = moment(_endDate).toDate()
            }
            else {
              lastInterval.start = moment(_endDate).startOf('month').toDate()
              lastInterval.end = moment(_endDate).toDate()
            }
            
            intervals.push(firstInterval)
             
            let monthsToGenerate = moment(lastInterval.end).diff(moment(firstInterval.start),'month')
        
            for (var i = 0; i < monthsToGenerate; i++)  {
              let interval = new Interval()
              interval.start = moment(intervals[i].end).add(1,'days').toDate()
              interval.end = moment(interval.start).endOf('month').add(1,'days').toDate()
              intervals.push(interval)
            }
            
            if (lastInterval.start > intervals[monthsToGenerate].end) {
              intervals.push(lastInterval)
            } 
        }

        if(_timeScale == Timescale.years){
            ;
            if (moment(_startDate).endOf('year').month() === moment(_startDate).month()) {  //end of month
              firstInterval.start = moment(_startDate).toDate()
              firstInterval.end = moment(_startDate).toDate()
            }
            else {
              firstInterval.start = moment(_startDate).toDate()
              firstInterval.end = new Date(moment(_startDate).endOf('year').format('MM-DD-YYYY'))
              console.log(firstInterval)
            }
            
            
            let lastInterval = new Interval()
            if (moment(_endDate).month() === 0)   {   //beginning of the month
              lastInterval.start = moment(_endDate).toDate()
              lastInterval.end = moment(_endDate).toDate()
            }
            else {
              lastInterval.start = moment(_endDate).startOf('year').toDate()
              lastInterval.end = moment(_endDate).toDate()
            }
            
            intervals.push(firstInterval)
             
            let yearsToGenerate = moment(lastInterval.end).diff(moment(firstInterval.start),'year')
        
            for (var i = 0; i < yearsToGenerate; i++)  {
              let interval = new Interval()
              interval.start = moment(intervals[i].end).add(1,'days').toDate()
              interval.end = moment(intervals[i].end).add(1,'years').toDate()
              intervals.push(interval)
            }
            
            if (lastInterval.start > intervals[yearsToGenerate].end) {
              intervals.push(lastInterval)
            } 
        }
            return intervals;
          }
    getResPlan(resources: IResource[], projectUrl: string = `${this.config.projectServerUrl}/`, project: IProject, start: Date, end: Date,
        timescale: Timescale, workunits: WorkUnits)
        : Observable<IResPlan> {
        console.log('entering getResPlans method');
        let headers = new HttpHeaders();
        headers = headers.set('accept', 'application/json;odata=verbose')
        let options = {
            headers
        };
        let adapterPath = `${this.config.adapterUrl}`
        let body = {
            method: 'PwaGetResourcePlansCommand',
            'puid': project.projUid,
            'projname': project.projName,
            'fromDate': this.getDateFormatString(start),
            'toDate': this.getDateFormatString(end),
            'timeScale': this.getTimeScaleString(timescale),
            'workScale': WorkUnits[workunits]
        }
        console.log("====================================Hitting Adapter Get Res Plan for project = " + project.projName)
        return Observable.fromPromise($.ajax({
            url: adapterPath,
            type: 'POST',
            dataType: "json",
            data: body,
            xhrFields: {
                withCredentials: true
           }
        }))
            .flatMap((r: ResPlan[]) => {
                // let resPlans : IResPlan
                // ;
                // console.log("++++++++++++++++++++++++++++++++++++++++")
                // Object.assign({}, resPlans, r)

                return Observable.from(r)

            })
            .merge(
            Observable.from(resources).flatMap((r: IResource) => {
                return Observable.of(new ResPlan(new Resource(r.resUid, r.resName)))
            })
            )
            .filter((t: IResPlan) => {

                return resources.find(k => t.resource.resUid === "00000000-0000-0000-0000-000000000000" || k.resUid.toUpperCase() == t.resource.resUid.toUpperCase()) != null
            })

    }


    addProjects(resMgrUid: string, projects: IProject[], resource: IResource, fromDate: Date, toDate: Date, timeScale: Timescale, workScale: WorkUnits): Observable<Result[]> {

        let ob = Observable.from(projects).flatMap(p => {
            // return r.filter(project=>{
            //     let val = true;
            return this.addProject(resMgrUid, p, resource, this.getDateFormatString(fromDate), this.getDateFormatString(toDate), timeScale, workScale)
            // })
        }).toArray()

        //ob.subscribe();
        return ob;
    }

    addProject(resMgrUid: string, project: IProject, resource: IResource, fromDate: string, toDate: string, timeScale: Timescale, workScale: WorkUnits): Observable<Result> {
        var success;
        //TODO
        let adapterPath = `${this.config.adapterUrl}`
        let body = {
            method: 'PwaAddResourcePlanCommand',
            'puid': project.projUid,
            'resuid': resource.resUid,
            'resname': resource.resName,
            'projname': project.projName,
            'user': '',
            'fromDate': fromDate,
            'toDate': toDate,
            'timeScale': this.getTimeScaleString(timeScale),
            'workScale': WorkUnits[workScale]
        }
        let headers = new Headers();
        headers.append('accept', 'application/json;odata=verbose')
        headers.append('content-type', 'application/x-www-form-urlencoded')
        let options = {
            headers
        }
        return Observable.fromPromise($.ajax({
            url: adapterPath,
            type: 'POST',
            dataType: "json",
            data: body,
            xhrFields: {
                withCredentials: true
           }
        })).map(r => {
            return r as Result
        })
        // return this.http.post(adapterPath,body,options).flatMap(r=>
        //     {
        //         return Observable.of(project);
        //     })
    }


    getTimeScaleString(value: Timescale): string {
        ;
        switch (value.toString()) {
            case Timescale.calendarMonths.toString(): return "Calendar Months";
            case Timescale.financialMonths.toString(): return "Financial Months";
            case Timescale.weeks.toString(): return "Weeks";
            case Timescale.years.toString(): return "Years";
            default: return "";

        }
    }


    saveResPlans(resPlan: IResPlan[], fromDate: Date, toDate: Date, timeScale: Timescale, workScale: WorkUnits): Observable<Result[]> {
        var success;
        //TODO
        let adapterPath = `${this.config.adapterUrl}`;
        let body = {
            method: 'PwaupdateResourcePlanCommand',
            'resourceplan': JSON.stringify(resPlan),
            'fromDate': this.getDateFormatString(fromDate),
            'toDate': this.getDateFormatString(toDate),
            'timeScale': this.getTimeScaleString(timeScale),
            'workScale': WorkUnits[workScale]
        }
        let headers = new HttpHeaders();
        headers = headers.set('accept', 'application/json;odata=verbose')
        headers = headers.set('content-type', 'application/x-www-form-urlencoded')
        let options =  {
            headers
        }
        return Observable.fromPromise($.ajax({
            url: adapterPath,
            type: 'POST',
            dataType: "json",
            data: body,
            xhrFields: {
                withCredentials: true
           }
        })).map(r => {
            return r as Result[];
        })
    }

    deleteResPlans(resPlan: IResPlan[], fromDate: Date, toDate: Date, timeScale: Timescale, workScale: WorkUnits): Observable<Result[]> {
        var success;
        resPlan.forEach(r=>{
            r.projects = r.projects.filter(p=>p.readOnly == false)
        }) 
        let pwaPath = `${this.config.projectServerUrl}/`
        let adapterPath = `${this.config.adapterUrl}`;
        let body = {
            method: 'PwaDeleteResourcePlanCommand',
            'resourceplan': JSON.stringify(resPlan),
            'fromDate': this.getDateFormatString(fromDate),
            'toDate': this.getDateFormatString(toDate),
            'timeScale': this.getTimeScaleString(timeScale),
            'workScale': WorkUnits[workScale]
        }
        
        return Observable.fromPromise($.ajax({
            url: adapterPath,
            type: 'POST',
            dataType: "json",
            data: body,
            xhrFields: {
                withCredentials: true
           }
        })).map((r) => {
            return r as Result[];
        })

        // return this.http.post(adapterPath,body,options).flatMap(r=>
        //     {
        //         return Observable.of(project);
        //     })
    }
    HideResPlans(resMgrUid: string, resPlans: IResPlan[]): Observable<Result> {
        let headers = new HttpHeaders();
        headers = headers.set('accept', 'application/json;odata=verbose')
        let options ={
            withCredentials: true,
            headers
        }
        let url = `${this.config.ResPlanUserStateUrl}/Items`
        let filter = `?$filter=ResourceManagerUID eq '${resMgrUid}'`
        resPlans = resPlans.filter(r=>r["selected"] == true)
        //1. get data from SP List UserState  
        return this.http.get(url + filter, options)

            .flatMap((data: Response) => {
                ;
                let resources = <IResource[]>JSON.parse(data["d"].results[0]["ResourceUID0"]) //dev
                //let resources = <IResource[]>JSON.parse(data.json().d.results[0]["ResourceUID"]) //qa
                .map(resource => { return new Resource(resource.resUid, resource.resName) })
                resources = resources.filter(r => resPlans.map(d=>d.resource.resUid.toUpperCase()).indexOf(r.resUid.toUpperCase()) < 0)
                return this.getRequestDigestToken().flatMap(digest => {

                    let headers = new HttpHeaders();
                    headers = headers.set('Accept', 'application/json;odata=verbose')
                    headers = headers.set('Content-Type', 'application/json;odata=verbose')
                    headers = headers.set('X-RequestDigest', digest)


                    
                        let resourcesJSON = `'[${resources.map(t => '{"resUid":"' + t.resUid + '","resName":"' + t.resName + '"}').join(",")}]'`
                        headers = headers.set('IF-MATCH', '*')
                        headers = headers.set('X-HTTP-Method', 'MERGE')
                        let options = {
                            headers: headers
                        }
                        
                        let body = `{"__metadata": { "type": "SP.Data.ResourcePlanUserStateListItem" },"ResourceUID0":${resourcesJSON}}"}` //dev
                        //let body = `{"__metadata": { "type": "SP.Data.ResourcePlanUserStateListItem" },"ResourceUID":${resourcesJSON}}"}` //qa
                        return this.http.post(data["d"].results[0].__metadata.uri, body, options)
                            .map((response: Response) => {
                                    var result=  new Result();
                                    result.success = true;
                                    return result;
                            })      
                })
            })

    }

    



}
