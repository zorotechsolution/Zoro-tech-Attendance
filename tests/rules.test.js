const path=require('path').join(__dirname,'..','js')+'/';
require(path+'config.js'); require(path+'utils.js'); require(path+'rules.js');
const {rules:R, utils:U}=globalThis.AMS;
let fails=0; const eq=(a,b,m)=>{ if(JSON.stringify(a)!==JSON.stringify(b)){fails++;console.log('FAIL',m,a,b);} else console.log('ok  ',m); };

// permission summary
const P=(date,minutes,s='10:00')=>({date,minutes,startTime:s,endTime:'11:00',createdAt:date+'T00:00'});
let s=R.permissionSummary([P('2026-11-02',60),P('2026-11-03',60)],'2026-11');
eq([s.used,s.remaining,s.excess],[120,30,0],'within allowance');
s=R.permissionSummary([P('2026-11-02',100),P('2026-11-03',60),P('2026-11-04',30)],'2026-11');
eq([s.used,s.remaining,s.excess],[190,0,40],'excess only beyond 150');
eq(s.items.map(i=>i.excessMinutes),[0,10,30],'per-item excess split');
s=R.permissionSummary([P('2026-10-30',200),P('2026-11-02',20)],'2026-11');
eq([s.used,s.excess],[20,0],'monthly reset (Oct does not carry)');
s=R.permissionSummary([P('2026-11-02',150)],'2026-11');
eq([s.remaining,s.excess],[0,0],'exactly 150 => no excess');

// validation
const now=U.nowIST(new Date('2026-11-09T06:15:00Z')); // 11:45 IST Mon
eq(now.dateKey+' '+now.time,'2026-11-09 11:45','IST conversion');
eq(R.validatePermission({date:'2026-11-09',startTime:'14:00',endTime:'15:00'},[],now),[],'valid permission');
eq(R.validatePermission({date:'2026-11-08',startTime:'14:00',endTime:'15:00'},[],now).length>0,true,'Sunday rejected');
eq(R.validatePermission({date:'2026-11-09',startTime:'09:00',endTime:'10:00'},[],now).length>0,true,'before office hours rejected');
eq(R.validatePermission({date:'2026-11-09',startTime:'17:00',endTime:'18:00'},[],now).length>0,true,'after office hours rejected');
eq(R.validatePermission({date:'2026-11-09',startTime:'14:00',endTime:'15:00'},[{date:'2026-11-09',startTime:'14:30',endTime:'15:30'}],now).length>0,true,'overlap rejected');
eq(R.validatePermission({date:'2026-10-01',startTime:'14:00',endTime:'15:00'},[],now).length>0,true,'too old rejected');

// status
const rec=(inIso,outIso,date)=>({employeeId:'e1',date,checkIn:inIso,checkOut:outIso});
let st=R.recordStatus(rec('2026-11-09T04:00:00Z','2026-11-09T12:00:00Z','2026-11-09'),now); // 09:30 -> 17:30
eq([st.status,st.workedMinutes],['present',480],'on time full day');
st=R.recordStatus(rec('2026-11-09T04:30:00Z',null,'2026-11-09'),now);
eq([st.status,st.lateMinutes],['working',30],'working today, 10:00 in');
st=R.recordStatus(rec('2026-11-06T04:30:00Z',null,'2026-11-06'),now);
eq(st.status,'incomplete','past day no checkout');

// midnight edge: 18:30Z = 00:00 IST next day
eq(U.nowIST(new Date('2026-11-08T18:30:00Z')).dateKey,'2026-11-09','IST midnight rollover');

// monthly summary: employee joined 2026-11-02, today Mon 11:45 (before end) => elapsed through Sun 8th
const emp={id:'e1',joinDate:'2026-11-02'};
const att=[rec('2026-11-02T04:00:00Z','2026-11-02T12:00:00Z','2026-11-02'),rec('2026-11-03T04:00:00Z','2026-11-03T12:00:00Z','2026-11-03')];
const ms=R.monthlySummary(emp,att,[],'2026-11',now);
eq([ms.workingDays,ms.present,ms.absent],[6,2,4],'monthly: 6 working days (2-7 Nov), 2 present, 4 absent derived');
eq(R.dailyRows([emp],att,'2026-11-08',now)[0].status,'off','Sunday = off');
eq(R.dailyRows([emp],att,'2026-11-09',now)[0].status,'pending','today before end, no record = pending (not absent)');
// regression: a late arrival who has not checked out yet must still count as late
const lateEmp={id:'e1',joinDate:'2026-11-09'};
const lateWorking=[rec('2026-11-09T04:45:00Z',null,'2026-11-09')]; // 10:15 IST, still working
const lm=R.monthlySummary(lateEmp,lateWorking,[],'2026-11',now);
eq([lm.late,lm.lateMinutes,lm.present],[1,45,1],'late arrival counted while still checked in');
console.log(fails? fails+' FAILURES':'ALL PASSED'); process.exit(fails?1:0);
